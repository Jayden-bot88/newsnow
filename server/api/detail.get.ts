import { Buffer } from "node:buffer"
import process from "node:process"
import { load } from "cheerio"
import iconv from "iconv-lite"
import { extractBilibiliDesc, extractVideo, parseWallstreetcnArticlePayload, parseWallstreetcnLivePayload } from "../utils/detail-extract"
import { blocksToText, preferDescWhenExtractedIsTitle } from "../utils/detail-final-text"
import type { PostDetailBlock } from "../utils/detail-blocks-post"
import { postProcessDetailBlocks } from "../utils/detail-blocks-post"
import { extractGenericBlocks } from "../utils/detail-generic-blocks"
import { getDetailSummaryHint } from "../utils/detail-site-hints"
import { extractSiteContent } from "../utils/detail-site-content"
import { extractDoubanMovieSubjectDetail, extractJin10FlashDetail, extractKaopuNewsListEntryDetail, extractMktnewsFlashDetail, extractXueqiuStockDetail, parseJin10NewestJs } from "../utils/detail-site-api"
import { verifyDetailPublicToken } from "../utils/detail-public-token"
import { assertSafeDetailUrl } from "../utils/detail-ssrf"
import { getRateLimitTable } from "#/database/rate-limit"

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const DETAIL_BLOCKLIST = process.env.DETAIL_BLOCKLIST
const DETAIL_PUBLIC_JWT_SECRET = process.env.DETAIL_PUBLIC_JWT_SECRET

const FETCH_TIMEOUT_MS = 20_000
const MAX_HTML_BYTES = 2_000_000
const MAX_REDIRECTS = 5

// /api/detail is a public-facing, high-risk endpoint. Keep conservative defaults.
// Operators can override via env.
const CACHE_MAX_ENTRIES = Number(process.env.DETAIL_CACHE_MAX_ENTRIES || "100")
const RATE_LIMIT_PER_MIN = Number(process.env.DETAIL_RATE_LIMIT_PER_MIN || "20")

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number, value: any }>()

const KAOPU_NEWS_LIST_URL = "https://kaopustorage.blob.core.windows.net/news-prod/news_list_hans_0.json"
const kaopuCache = {
  at: 0,
  byLink: new Map<string, unknown>(),
}

const jin10Cache = {
  at: 0,
  newest: [] as ReturnType<typeof parseJin10NewestJs>,
}

const rate = new Map<string, { resetAt: number, count: number }>()

function detectHtmlCharset(buf: Buffer): string | undefined {
  // Use latin1 so we don't accidentally corrupt bytes while searching.
  const head = buf.subarray(0, Math.min(buf.length, 4096)).toString("latin1")
  const m = /<meta[^>]+charset=["']?([^"'\s>]+)/i.exec(head)
    || /charset=([\w-]+)/i.exec(head)
  const raw = m?.[1]?.trim().toLowerCase()
  if (!raw) return undefined
  if (raw === "utf8") return "utf-8"
  if (raw === "gb2312") return "gbk"
  return raw
}

function decodeHtml(buf: Buffer): string {
  const charset = detectHtmlCharset(buf)
  if (!charset || charset === "utf-8") return buf.toString("utf-8")
  try {
    return iconv.decode(buf, charset)
  } catch {
    return buf.toString("utf-8")
  }
}

function parseAllowlist(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

function matchesHostRules(host: string, rules: string[]) {
  const hostLower = host.toLowerCase()
  return rules.some((rule) => {
    if (rule.startsWith("*.") && rule.length > 2) {
      const suffix = rule.slice(1)
      return hostLower.endsWith(suffix)
    }
    if (rule.startsWith(".")) return hostLower.endsWith(rule)
    return hostLower === rule
  })
}

function getClientIp(event: any): string {
  const h = getHeaders(event)
  const direct = h["cf-connecting-ip"]
    || h["true-client-ip"]
    || h["x-real-ip"]
  if (typeof direct === "string" && direct.trim()) return direct.trim()

  const forwarded = h["x-forwarded-for"]
  if (typeof forwarded === "string" && forwarded.trim()) {
    // Use the first hop.
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return "unknown"
}

async function assertRateLimit(event: any) {
  if (!Number.isFinite(RATE_LIMIT_PER_MIN) || RATE_LIMIT_PER_MIN <= 0) return
  const ip = getClientIp(event)
  const now = Date.now()

  // Prefer DB-backed limiter when available (works across processes/instances).
  // Fallback to in-memory map when db is not configured.
  try {
    const table = await getRateLimitTable()
    if (table) {
      await table.consume({
        key: `detail:${ip}`,
        limit: RATE_LIMIT_PER_MIN,
        windowMs: 60_000,
        now,
      })
      return
    }
  } catch {
    // ignore
  }

  const row = rate.get(ip)
  if (!row || now >= row.resetAt) {
    rate.set(ip, { resetAt: now + 60_000, count: 1 })
    return
  }
  row.count += 1
  if (row.count > RATE_LIMIT_PER_MIN) {
    throw createError({ statusCode: 429, message: "Too many requests" })
  }
}

async function assertDetailToken(event: any) {
  if (!DETAIL_PUBLIC_JWT_SECRET) return
  const token = getHeader(event, "X-Detail-Token")?.trim() || ""
  if (!token) throw createError({ statusCode: 401, message: "Missing detail token" })
  await verifyDetailPublicToken({ secret: DETAIL_PUBLIC_JWT_SECRET, token })
}

function pruneCache(now: number) {
  // Remove expired entries.
  for (const [k, v] of cache) {
    if (now - v.at >= CACHE_TTL_MS) cache.delete(k)
    else break
  }
  // Bound cache size (Map preserves insertion order).
  if (!Number.isFinite(CACHE_MAX_ENTRIES) || CACHE_MAX_ENTRIES <= 0) return
  while (cache.size > CACHE_MAX_ENTRIES) {
    const first = cache.keys().next().value as string | undefined
    if (!first) break
    cache.delete(first)
  }
}

function isHttpUrl(url: string) {
  return /^https?:\/\//.test(url)
}

function imagesFromBlocks(blocks: unknown): string[] {
  const arr = Array.isArray(blocks) ? blocks : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const b of arr) {
    if (!b || typeof b !== "object") continue
    const type = (b as any).type
    if (type !== "img") continue
    const src = (b as any).src
    if (typeof src !== "string" || !isHttpUrl(src)) continue
    if (seen.has(src)) continue
    seen.add(src)
    out.push(src)
    if (out.length >= 9) break
  }
  return out
}

async function assertSafeUrl(rawUrl: string) {
  await assertSafeDetailUrl(rawUrl)
}

function assertDetailUrlAllowed(rawUrl: string) {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return
  }
  const host = u.hostname.toLowerCase()
  const path = u.pathname

  // If configured, block these hosts from /api/detail entirely.
  const rules = parseAllowlist(DETAIL_BLOCKLIST)
  if (rules.length > 0 && matchesHostRules(host, rules)) {
    throw createError({ statusCode: 400, message: "Detail blocked" })
  }

  // Known consistently blocked hosts (CF/WAF/login) or non-article domains.
  if (host.endsWith("chongbuluo.com")) {
    throw createError({ statusCode: 400, message: "Detail blocked" })
  }
  if (host === "sec.douban.com") {
    throw createError({ statusCode: 400, message: "Detail blocked" })
  }

  // If we already know it's not a single article page, do not return a hint payload.
  // (The client can still open the original URL.)
  const hint = getDetailSummaryHint({ requestedUrl: rawUrl, finalUrl: rawUrl })
  if (hint) {
    throw createError({ statusCode: 400, message: "Detail blocked" })
  }

  // WallstreetCN livenews is often SPA/protected; treat as unsupported body.
  if (host.endsWith("wallstreetcn.com") && path.startsWith("/livenews/")) {
    throw createError({ statusCode: 400, message: "Detail blocked" })
  }
}

async function fetchHtmlWithLimit(startUrl: string): Promise<{ html: string, finalUrl: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  const rewriteTencentUrl = (raw: string): string => {
    try {
      const u = new URL(raw)
      const host = u.hostname.toLowerCase()
      if (host === "news.qq.com" || host === "new.qq.com") {
        const m = /^\/rain\/a\/([A-Z0-9]+)$/.exec(u.pathname)
        if (m?.[1]) return `https://view.inews.qq.com/a/${m[1]}`
      }
      return raw
    } catch {
      return raw
    }
  }

  try {
    let current = rewriteTencentUrl(startUrl)
    if (current !== startUrl) {
      await assertSafeUrl(current)
    }

    for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...(current.includes("qq.com") ? { Referer: "https://news.qq.com/" } : undefined),
        },
      })

      // Manual redirect handling so every hop is SSRF-checked.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location")
        if (!loc) throw createError({ statusCode: 502, message: "Upstream redirect" })
        if (i === MAX_REDIRECTS) throw createError({ statusCode: 502, message: "Too many redirects" })
        const next = new URL(loc, current).toString()
        await assertSafeUrl(next)
        current = next
        continue
      }

      if (!res.ok) {
        // Tencent News is frequently protected by a JS WAF interstitial.
        // If we got a 501 HTML body, return it so downstream can show a helpful hint,
        // and also attempt a best-effort canonical URL rewrite (news.qq.com -> view.inews.qq.com).
        if (res.status === 501 && /qq\.com$/i.test(new URL(current).hostname)) {
          const next = rewriteTencentUrl(current)
          if (next !== current) {
            await assertSafeUrl(next)
            current = next
            continue
          }

          const body = res.body
          if (!body) throw createError({ statusCode: 502, message: `Upstream ${res.status}` })

          const reader = body.getReader()
          const chunks: Uint8Array[] = []
          let total = 0
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (!value) continue
            total += value.byteLength
            if (total > MAX_HTML_BYTES) break
            chunks.push(value)
          }

          const buf = Buffer.concat(chunks.map(c => Buffer.from(c)))
          return { html: decodeHtml(buf), finalUrl: current }
        }

        throw createError({ statusCode: 502, message: `Upstream ${res.status}` })
      }

      const contentType = res.headers.get("content-type") || ""
      if (contentType && !/^text\//i.test(contentType) && !/html/i.test(contentType)) {
        throw createError({ statusCode: 502, message: "Upstream not html" })
      }

      const lenHeader = res.headers.get("content-length")
      const len = lenHeader ? Number(lenHeader) : 0
      if (lenHeader && (!Number.isFinite(len) || len > MAX_HTML_BYTES)) {
        throw createError({ statusCode: 413, message: "Response too large" })
      }

      const body = res.body
      if (!body) throw createError({ statusCode: 502, message: "Upstream empty" })

      const reader = body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        total += value.byteLength
        if (total > MAX_HTML_BYTES) {
          controller.abort()
          throw createError({ statusCode: 413, message: "Response too large" })
        }
        chunks.push(value)
      }

      const buf = Buffer.concat(chunks.map(c => Buffer.from(c)))
      return {
        html: decodeHtml(buf),
        finalUrl: current,
      }
    }

    throw createError({ statusCode: 502, message: "Upstream fetch failed" })
  } catch (e: any) {
    if (e?.statusCode) throw e
    if (e?.name === "AbortError") {
      throw createError({ statusCode: 504, message: "Upstream timeout" })
    }
    throw createError({ statusCode: 502, message: "Upstream fetch failed" })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchJsonWithLimit(url: string, headers: Record<string, string> = {}) {
  // Defense-in-depth: keep all outbound fetches behind SSRF checks.
  await assertSafeUrl(url)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        ...headers,
      },
    })
    if (!res.ok) {
      throw createError({ statusCode: 502, message: `Upstream ${res.status}` })
    }
    return await res.json() as unknown
  } catch (e: any) {
    if (e?.statusCode) throw e
    if (e?.name === "AbortError") {
      throw createError({ statusCode: 504, message: "Upstream timeout" })
    }
    throw createError({ statusCode: 502, message: "Upstream fetch failed" })
  } finally {
    clearTimeout(timeout)
  }
}

async function tryExtractViaSiteApi(inputUrl: string) {
  let u: URL
  try {
    u = new URL(inputUrl)
  } catch {
    return undefined
  }

  const host = u.hostname.toLowerCase()

  // Jin10 flash detail pages are mostly share templates; use its newest JS feed.
  if (host === "flash.jin10.com" || host.endsWith(".jin10.com")) {
    const m = /^\/detail\/(\d+)/.exec(u.pathname)
    const id = m?.[1]
    if (id) {
      const now = Date.now()
      if (now - jin10Cache.at > 2 * 60_000 || !jin10Cache.newest?.length) {
        const apiUrl = `https://www.jin10.com/flash_newest.js?t=${now}`
        await assertSafeUrl(apiUrl)
        const { html } = await fetchHtmlWithLimit(apiUrl)
        jin10Cache.at = now
        jin10Cache.newest = parseJin10NewestJs(html) || []
      }
      const extracted = extractJin10FlashDetail({ id, newest: jin10Cache.newest || [] })
      if (extracted) return extracted
    }
  }

  // Kaopu sources sometimes link to publishers that hard-block server-side fetches.
  // If the target URL is present in Kaopu's curated list, fall back to its description.
  {
    const now = Date.now()
    if (now - kaopuCache.at > 10 * 60_000 || kaopuCache.byLink.size === 0) {
      await assertSafeUrl(KAOPU_NEWS_LIST_URL)
      const json = await fetchJsonWithLimit(KAOPU_NEWS_LIST_URL)
      const byLink = new Map<string, unknown>()
      if (Array.isArray(json)) {
        for (const entry of json) {
          if (!entry || typeof entry !== "object") continue
          const link = (entry as any).link
          if (typeof link !== "string" || !link.trim()) continue
          try {
            byLink.set(new URL(link).toString(), entry)
          } catch {
            // ignore
          }
        }
      }
      kaopuCache.at = now
      kaopuCache.byLink = byLink
    }

    const entry = kaopuCache.byLink.get(u.toString())
    if (entry) {
      const extracted = extractKaopuNewsListEntryDetail({ apiJsonEntry: entry })
      if (extracted) return extracted
    }
  }

  // mktnews flash pages are JS-heavy; prefer its public API.
  if (host === "mktnews.net" || host.endsWith(".mktnews.net")) {
    const id = u.searchParams.get("id")
    if (u.pathname === "/flashDetail.html" && id) {
      // mktnews API rejects overly large limits; keep aligned with list fetcher.
      const apiUrl = `https://api.mktnews.net/api/flash?type=0&limit=50`
      await assertSafeUrl(apiUrl)
      const json = await fetchJsonWithLimit(apiUrl)
      const extracted = extractMktnewsFlashDetail({ id, apiJson: json })
      if (extracted) return extracted
    }
  }

  // Douban movie subject pages are often redirected to sec.douban.com (anti-bot).
  // Prefer the mobile rexxar API for a stable intro/metadata payload.
  if (host === "movie.douban.com" || host.endsWith(".movie.douban.com") || host === "www.douban.com" || host.endsWith(".douban.com")) {
    const m = /^\/subject\/(\d+)\/?$/.exec(u.pathname)
    const id = m?.[1]
    if (id) {
      const apiUrl = `https://m.douban.com/rexxar/api/v2/subject/${id}`
      await assertSafeUrl(apiUrl)
      const json = await fetchJsonWithLimit(apiUrl, {
        Referer: `https://m.douban.com/movie/subject/${id}/`,
      })
      const extracted = extractDoubanMovieSubjectDetail({ apiJson: json })
      if (extracted) return extracted
    }
  }

  // xueqiu stock pages are not articles; render a readable quote summary from its API.
  if (host === "xueqiu.com" || host.endsWith(".xueqiu.com")) {
    const m = /^\/s\/([\w.-]+)$/.exec(u.pathname)
    const symbol = m?.[1]
    if (symbol) {
      await assertSafeUrl("https://xueqiu.com/hq")
      const cookieController = new AbortController()
      const cookieTimeout = setTimeout(() => cookieController.abort(), FETCH_TIMEOUT_MS)
      const cookieRes = await fetch("https://xueqiu.com/hq", {
        method: "GET",
        redirect: "manual",
        signal: cookieController.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      }).finally(() => clearTimeout(cookieTimeout))

      const cookie = cookieRes.headers.getSetCookie().join("; ")

      const apiUrl = `https://stock.xueqiu.com/v5/stock/quote.json?symbol=${encodeURIComponent(symbol)}&extend=detail`
      await assertSafeUrl(apiUrl)
      const json = await fetchJsonWithLimit(apiUrl, {
        ...(cookie ? { cookie } : {}),
        Referer: `https://xueqiu.com/s/${symbol}`,
      })
      const extracted = extractXueqiuStockDetail({ symbol, apiJson: json })
      if (extracted) return extracted
    }
  }

  return undefined
}

function pickMainContainer($: ReturnType<typeof load>) {
  const selectors = [
    "article",
    "[role='article']",
    "#article",
    "#content",
    "#main",
    ".article",
    ".article-content",
    ".content",
    ".post",
    ".post-content",
    ".entry-content",
    ".rich-content",
    ".main",
    "main",
  ]

  let best: { sel: string, len: number } | undefined
  for (const sel of selectors) {
    const el = $(sel).first()
    if (!el.length) continue
    const len = el.text().replace(/\s+/g, " ").trim().length
    if (!best || len > best.len) best = { sel, len }
  }

  return best ? $(best.sel).first() : $("body")
}

function cleanTextLines(lines: string[]) {
  const cleaned = lines
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    // Drop nav-like tiny chips.
    .filter(s => s.length >= 8)

  // De-dupe while preserving order.
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of cleaned) {
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

function looksNoisy(text: string) {
  // A lot of very short tokens is usually navigation/tag soup.
  const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean)
  if (lines.length < 8) return false
  const short = lines.filter(s => s.length <= 12).length
  return short / lines.length > 0.7
}

function stripIthomeDisclaimer(text: string, title?: string) {
  const blocks = text
    .split(/\n{2,}/)
    .map(s => s.trim())
    .filter(Boolean)

  // Some IT之家 pages repeat the title as the first paragraph.
  if (blocks.length >= 2 && title) {
    const normalize = (s: string) => s
      .replace(/\s+/g, " ")
      .replace(/\s*[-|—–]\s*IT之家\s*$/i, "")
      .trim()
    const first = normalize(blocks[0]!)
    const titleNorm = normalize(title)
    if (titleNorm && first === titleNorm) {
      blocks.shift()
    }
  }

  while (blocks.length) {
    const last = blocks[blocks.length - 1]!
    if (/^广告声明[：:]/.test(last)) {
      blocks.pop()
      continue
    }
    break
  }

  return blocks.join("\n\n")
}

export default defineEventHandler(async (event) => {
  await assertRateLimit(event)

  const query = getQuery(event)
  const url = typeof query.url === "string" ? query.url : ""
  if (!url || !isHttpUrl(url)) throw createError({ statusCode: 400, message: "Invalid url" })
  await assertDetailToken(event)
  assertDetailUrlAllowed(url)
  await assertSafeUrl(url)

  pruneCache(Date.now())

  // Some URLs are known non-article pages (aggregates / login walls).
  // We no longer return hint payloads for these.
  const hintBeforeFetch = getDetailSummaryHint({ requestedUrl: url, finalUrl: url })
  if (hintBeforeFetch) throw createError({ statusCode: 400, message: "Detail blocked" })

  const cached = cache.get(url)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value
  }

  // Some pages are better served via public JSON APIs instead of HTML extraction.
  // This helps with JS-heavy pages and strong anti-bot frontends.
  try {
    const extracted = await tryExtractViaSiteApi(url)
    if (extracted?.text || (extracted?.images && extracted.images.length)) {
      const site = (() => {
        try {
          return new URL(url).hostname
        } catch {
          return ""
        }
      })()

      const payload = {
        url,
        site,
        title: extracted.title || "",
        desc: extracted.text,
        text: extracted.text,
        blocks: extracted.blocks || [],
        // Policy A: only keep images that are truly in body blocks.
        images: imagesFromBlocks(extracted.blocks || []),
        video: undefined,
      }
      setResponseHeader(event, "Cache-Control", "public, s-maxage=60, stale-while-revalidate=600")
      cache.delete(url)
      cache.set(url, { at: Date.now(), value: payload })
      pruneCache(Date.now())
      return payload
    }
  } catch {
    // Fall through to HTML extraction.
  }

  const { html, finalUrl } = await fetchHtmlWithLimit(url)

  // Some forum pages return an access-denied template with a copyright footer.
  // Do not treat it as extractable content.
  try {
    const u = new URL(finalUrl)
    const host = u.hostname.toLowerCase()
    if (host.endsWith("hupu.com") && /JR你好，您无法访问该帖子/.test(html)) {
      throw createError({ statusCode: 400, message: "Detail blocked" })
    }
  } catch {
    // ignore
  }

  // Some pages are known aggregates without an extractable article body.
  const hintAfterFetch = getDetailSummaryHint({ requestedUrl: url, finalUrl })
  if (hintAfterFetch) throw createError({ statusCode: 400, message: "Detail blocked" })

  // WallstreetCN is an SPA. The HTML contains no article body.
  // Use its public API to extract readable content.
  try {
    const u = new URL(finalUrl)
    const m = /\/articles\/(\d+)/.exec(u.pathname)
    if (u.hostname.endsWith("wallstreetcn.com") && m?.[1]) {
      const id = m[1]
      const apiUrl = `https://api-one.wallstcn.com/apiv1/content/articles/${id}?extract=1`
      await assertSafeUrl(apiUrl)
      const res = await fetch(apiUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": "https://wallstreetcn.com/",
          "Accept": "application/json",
        },
      })
      if (res.ok) {
        const json: any = await res.json()
        const parsed = parseWallstreetcnArticlePayload(json?.data)
        if (parsed.text || (parsed.images && parsed.images.length)) {
          const site = u.hostname
          const payload = {
            url,
            site,
            title: parsed.title || "",
            desc: parsed.desc || "",
            text: parsed.text || parsed.desc || "",
            // Policy A: no images unless they appear in body blocks.
            images: [],
            video: undefined,
          }

          setResponseHeader(event, "Cache-Control", "public, s-maxage=60, stale-while-revalidate=600")
          cache.delete(url)
          cache.set(url, { at: Date.now(), value: payload })
          pruneCache(Date.now())
          return payload
        }
      }
    }
  } catch {
    // ignore
  }

  // WallstreetCN livenews is also SPA.
  try {
    const u = new URL(finalUrl)
    const m = /\/livenews\/(\d+)/.exec(u.pathname)
    if (u.hostname.endsWith("wallstreetcn.com") && m?.[1]) {
      const id = m[1]
      const apiUrl = `https://api-one.wallstcn.com/apiv1/content/lives/${id}`
      await assertSafeUrl(apiUrl)
      const res = await fetch(apiUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": "https://wallstreetcn.com/",
          "Accept": "application/json",
        },
      })
      if (res.ok) {
        const json: any = await res.json()
        const parsed = parseWallstreetcnLivePayload(json?.data)
        if (parsed.text || (parsed.images && parsed.images.length)) {
          const site = u.hostname
          const payload = {
            url,
            site,
            title: parsed.title || "",
            desc: parsed.desc || "",
            text: parsed.text || parsed.desc || "",
            // Policy A: no images unless they appear in body blocks.
            images: [],
            video: undefined,
          }

          setResponseHeader(event, "Cache-Control", "public, s-maxage=60, stale-while-revalidate=600")
          cache.delete(url)
          cache.set(url, { at: Date.now(), value: payload })
          pruneCache(Date.now())
          return payload
        }
      }
    }
  } catch {
    // ignore
  }

  // Site-specific extractors for content that is either embedded as JSON or has known DOM.
  try {
    const extracted = extractSiteContent({ html, finalUrl })
    if (extracted?.text || (extracted?.images && extracted.images.length)) {
      const site = (() => {
        try {
          return new URL(finalUrl).hostname
        } catch {
          return ""
        }
      })()
      const blocks = extracted?.blocks?.length
        ? postProcessDetailBlocks({
            host: site,
            title: extracted?.title || "",
            blocks: extracted.blocks as PostDetailBlock[],
          })
        : []

      const textFromBlocks = blocksToText(blocks)
      const finalText = textFromBlocks || extracted?.text || ""

      const payload = {
        url,
        site,
        title: extracted?.title || "",
        desc: finalText,
        text: finalText,
        blocks,
        // Policy A: only keep images that are truly in body blocks.
        images: imagesFromBlocks(blocks),
        video: undefined,
      }
      setResponseHeader(event, "Cache-Control", "public, s-maxage=60, stale-while-revalidate=600")
      cache.delete(url)
      cache.set(url, { at: Date.now(), value: payload })
      pruneCache(Date.now())
      return payload
    }
  } catch {
    // ignore
  }

  const $ = load(html)
  const video = extractVideo($, finalUrl)
  $("script,style,noscript,iframe,svg,canvas,form,button").remove()

  const title = (
    $("meta[property='og:title']").attr("content")
    || $("meta[name='title']").attr("content")
    || $("title").text()
    || $("h1").first().text()
  ).trim()

  let desc = (
    $("meta[property='og:description']").attr("content")
    || $("meta[name='description']").attr("content")
    || ""
  ).trim()

  const bilibiliDesc = extractBilibiliDesc(html, finalUrl)
  if (bilibiliDesc) {
    desc = bilibiliDesc
  } else {
    // Bilibili's meta description often includes stats/author blob; keep just the first sentence.
    try {
      const host = new URL(finalUrl).hostname.toLowerCase()
      if (host.endsWith("bilibili.com") && desc) {
        const cut = desc.split(/,\s*视频播放量/)[0]?.trim()
        if (cut) desc = cut
      }
    } catch {
      // ignore
    }
  }

  const container = pickMainContainer($)
  container.find("nav,header,footer,aside").remove()

  // Extract readable text.
  const selector = container.is("article") || container.attr("role") === "article"
    ? "h1,h2,h3,p,li"
    : "h1,h2,h3,p"

  const lines = cleanTextLines(container
    .find(selector)
    .toArray()
    .map(el => $(el).text().replace(/\s+/g, " ").trim())
    .slice(0, 120),
  )

  const text = lines.join("\n\n")
  const finalTextRaw = (!text || looksNoisy(text))
    ? desc
    : preferDescWhenExtractedIsTitle({ title, desc, extractedText: text })
  const finalText = (() => {
    try {
      const host = new URL(finalUrl).hostname.toLowerCase()
      if (host.endsWith("ithome.com")) {
        return stripIthomeDisclaimer(finalTextRaw, title)
      }
    } catch {
      // ignore
    }
    return finalTextRaw
  })()

  // Policy A: do not attach best-effort meta/DOM images to detail unless they are in body blocks.
  // (This avoids showing og:image/avatars/UI images that are not part of the article body.)

  const site = (() => {
    try {
      return new URL(finalUrl).hostname
    } catch {
      return ""
    }
  })()

  const blocks = postProcessDetailBlocks({
    host: site,
    title,
    blocks: extractGenericBlocks({ $, container, baseUrl: finalUrl }) as PostDetailBlock[],
  })

  const textFromBlocks = blocksToText(blocks)
  const finalTextFromBlocks = textFromBlocks || finalText

  const images = imagesFromBlocks(blocks)

  const payload = {
    url,
    site,
    title,
    desc,
    text: finalTextFromBlocks,
    blocks,
    images,
    video,
  }

  setResponseHeader(event, "Cache-Control", "public, s-maxage=60, stale-while-revalidate=600")

  cache.delete(url)
  cache.set(url, { at: Date.now(), value: payload })
  pruneCache(Date.now())
  return payload
})

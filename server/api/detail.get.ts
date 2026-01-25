import { lookup } from "node:dns/promises"
import { Buffer } from "node:buffer"
import { isIP } from "node:net"
import process from "node:process"
import { load } from "cheerio"
import { sources } from "@shared/sources"

import { extractBilibiliDesc, extractVideo } from "../utils/detail-extract"

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

const FETCH_TIMEOUT_MS = 10_000
const MAX_HTML_BYTES = 2_000_000
const MAX_URL_LENGTH = 2048
const MAX_REDIRECTS = 5

const CACHE_MAX_ENTRIES = Number(process.env.DETAIL_CACHE_MAX_ENTRIES || "200")
const RATE_LIMIT_PER_MIN = Number(process.env.DETAIL_RATE_LIMIT_PER_MIN || "30")

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number, value: any }>()

const rate = new Map<string, { resetAt: number, count: number }>()

function parseAllowlist(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

function deriveAllowlistFromSources(): string[] {
  const out = new Set<string>()
  for (const s of Object.values(sources)) {
    if (!s?.home) continue
    try {
      const host = new URL(s.home).hostname.toLowerCase()
      const base = host.startsWith("www.") ? host.slice(4) : host
      if (!base) continue
      // Allow exact base host and any subdomain under it.
      out.add(base)
      out.add(`.${base}`)
    } catch {
      // ignore invalid home
    }
  }
  return Array.from(out)
}

function getAllowlist(): string[] {
  const env = parseAllowlist(process.env.DETAIL_ALLOWLIST)
  return env.length ? env : deriveAllowlistFromSources()
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

function assertRateLimit(event: any) {
  if (!Number.isFinite(RATE_LIMIT_PER_MIN) || RATE_LIMIT_PER_MIN <= 0) return
  const ip = getClientIp(event)
  const now = Date.now()
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

function isPrivateIp(ip: string) {
  // ipv4 private ranges
  if (/^127\./.test(ip)) return true
  if (/^10\./.test(ip)) return true
  if (/^192\.168\./.test(ip)) return true
  if (/^169\.254\./.test(ip)) return true
  if (/^172\.(?:16|17|18|19|2\d|30|31)\./.test(ip)) return true

  // ipv6 localhost / unique local / link-local
  if (ip === "::1") return true
  if (/^fc/i.test(ip) || /^fd/i.test(ip)) return true
  if (/^fe80:/i.test(ip)) return true

  return false
}

async function assertSafeUrl(rawUrl: string) {
  if (rawUrl.length > MAX_URL_LENGTH) {
    throw createError({ statusCode: 400, message: "URL too long" })
  }

  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw createError({ statusCode: 400, message: "Invalid url" })
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw createError({ statusCode: 400, message: "Invalid url" })
  }

  if (u.username || u.password) {
    throw createError({ statusCode: 400, message: "Blocked url" })
  }

  if (u.port && u.port !== "80" && u.port !== "443") {
    throw createError({ statusCode: 400, message: "Blocked port" })
  }

  const host = u.hostname
  if (!host) throw createError({ statusCode: 400, message: "Invalid url" })
  if (host === "localhost") throw createError({ statusCode: 400, message: "Blocked host" })

  const allowlist = getAllowlist()

  if (allowlist.length > 0) {
    const hostLower = host.toLowerCase()
    const ok = allowlist.some((rule) => {
      if (rule.startsWith("*.") && rule.length > 2) {
        const suffix = rule.slice(1)
        return hostLower.endsWith(suffix)
      }
      if (rule.startsWith(".")) return hostLower.endsWith(rule)
      return hostLower === rule
    })
    if (!ok) throw createError({ statusCode: 400, message: "Blocked host" })
  }

  // Direct IP literal.
  if (isIP(host) && isPrivateIp(host)) {
    throw createError({ statusCode: 400, message: "Blocked host" })
  }

  // DNS resolve to prevent obvious SSRF.
  try {
    const res = await lookup(host, { all: true, verbatim: true })
    if (res.some(r => isPrivateIp(r.address))) {
      throw createError({ statusCode: 400, message: "Blocked host" })
    }
  } catch (e: any) {
    // If DNS fails, treat as invalid/unsafe.
    if (e?.statusCode) throw e
    throw createError({ statusCode: 400, message: "Unresolvable host" })
  }
}

async function fetchHtmlWithLimit(startUrl: string): Promise<{ html: string, finalUrl: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    let current = startUrl
    for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

      return {
        html: Buffer.concat(chunks.map(c => Buffer.from(c))).toString("utf-8"),
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

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr))
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

function resolveUrl(base: string, maybe: string) {
  try {
    return new URL(maybe, base).toString()
  } catch {
    return undefined
  }
}

export default defineEventHandler(async (event) => {
  assertRateLimit(event)

  const query = getQuery(event)
  const url = typeof query.url === "string" ? query.url : ""
  if (!url || !isHttpUrl(url)) throw createError({ statusCode: 400, message: "Invalid url" })
  await assertSafeUrl(url)

  pruneCache(Date.now())

  const cached = cache.get(url)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value
  }

  const { html, finalUrl } = await fetchHtmlWithLimit(url)

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
  const finalText = (!text || looksNoisy(text)) ? desc : text

  // Extract images (best effort).
  const images = uniq(
    container
      .find("img")
      .toArray()
      .map((el) => {
        const srcset = $(el).attr("srcset") || $(el).attr("data-srcset")
        const bestFromSrcset = srcset
          ? srcset
              .split(",")
              .map(s => s.trim().split(/\s+/)[0])
              .filter(Boolean)
              .pop()
          : undefined

        const src = bestFromSrcset
          || $(el).attr("data-src")
          || $(el).attr("data-original")
          || $(el).attr("data-lazy-src")
          || $(el).attr("src")
        if (!src) return undefined
        const u = resolveUrl(finalUrl, src)
        return u && isHttpUrl(u) ? u : undefined
      })
      .filter((x): x is string => Boolean(x)),
  ).slice(0, 9)

  const ogImage = $("meta[property='og:image']").attr("content")
  const og = ogImage ? resolveUrl(finalUrl, ogImage) : undefined
  if (og && isHttpUrl(og) && !images.includes(og)) images.unshift(og)

  const site = (() => {
    try {
      return new URL(finalUrl).hostname
    } catch {
      return ""
    }
  })()

  const payload = {
    url,
    site,
    title,
    desc,
    text: finalText,
    images,
    video,
  }

  setResponseHeader(event, "Cache-Control", "public, s-maxage=60, stale-while-revalidate=600")

  cache.delete(url)
  cache.set(url, { at: Date.now(), value: payload })
  pruneCache(Date.now())
  return payload
})

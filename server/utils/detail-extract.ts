import { load } from "cheerio"
import type { CheerioAPI } from "cheerio"

export interface DetailVideo {
  type: "iframe" | "file" | "hls"
  url: string
}

export interface WallstreetcnArticle {
  title?: string
  desc?: string
  text?: string
  images?: string[]
}

export interface WallstreetcnLive {
  title?: string
  desc?: string
  text?: string
  images?: string[]
}

function isHttpUrl(url: string) {
  return /^https?:\/\//.test(url)
}

function resolveUrl(base: string, maybe: string) {
  try {
    return new URL(maybe, base).toString()
  } catch {
    return undefined
  }
}

export function parseWallstreetcnArticlePayload(payload: unknown): WallstreetcnArticle {
  if (!payload || typeof payload !== "object") return {}
  const p = payload as any
  const title = typeof p.title === "string" ? p.title.trim() : undefined
  const content = typeof p.content === "string" ? p.content : ""
  const contentShort = typeof p.content_short === "string" ? p.content_short.trim() : ""

  const extractBlocksFromHtml = (html: string) => {
    if (!html) return []
    const $ = load(html)
    $("script,style,noscript").remove()
    $("br").replaceWith("\n")

    const blocks: string[] = []
    const elements = $("p,h2,h3,h4,blockquote,ul,ol").toArray()
    for (const el of elements) {
      const tag = (el as any).name as string | undefined
      if (tag === "ul" || tag === "ol") {
        const items = $(el)
          .find("li")
          .toArray()
          .map(li => $(li).text())
          .map(s => s.replace(/\s+/g, " ").trim())
          .filter(Boolean)
        if (items.length >= 2) {
          blocks.push(items.map(x => `- ${x}`).join("\n"))
        } else if (items.length === 1) {
          blocks.push(items[0]!)
        }
        continue
      }
      blocks.push($(el).text())
    }

    if (!blocks.length) {
      blocks.push($.root().text())
    }

    return blocks
      .map((s) => {
        return String(s)
          .replace(/\r/g, "")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n[ \t]+/g, "\n")
          .replace(/[ \t]{2,}/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
      })
      .filter(Boolean)
  }

  const blocks = extractBlocksFromHtml(content)
  let text = blocks.length ? blocks.join("\n\n") : undefined

  const promoKeywords = [
    "今日见闻专享",
    "见闻专享",
    "见闻历",
    "多购多惠",
    "划算到爆",
    "亲友互赠",
    "自留收藏",
    "大师课",
  ]

  const isTopAdLine = (line: string) => {
    const normalized = line.replace(/\s+/g, "").toLowerCase()
    if (!normalized) return false

    // Common top-of-article promo for app upgrade / download.
    if (/^(?:请|点击|扫码)/.test(line) && /\bapp\b|最新版app/i.test(line)) {
      if (/升级|下载|安装|打开|收听|订阅|开通|购买|领取/.test(line)) return true
      if (/见闻|华尔街见闻/.test(line)) return true
    }

    if (/(?:升级|下载|安装|打开).{0,12}(?:见闻|华尔街见闻).{0,12}app/.test(normalized)) return true
    if (/(?:见闻|华尔街见闻).{0,12}app.{0,12}(?:升级|下载|安装|打开)/.test(normalized)) return true
    return false
  }

  const isPunctuationOnly = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    return /^[,.;:!?，。！？；：、]+$/.test(trimmed)
  }

  if (text) {
    let skipping = false
    const kept: string[] = []
    const rawLines = text.split(/\n+/).map((s: string) => s.trim()).filter(Boolean)

    // Merge punctuation-only fragments back into the previous line.
    const mergedLines: string[] = []
    for (const line of rawLines) {
      if (isPunctuationOnly(line) && mergedLines.length) {
        mergedLines[mergedLines.length - 1] = `${mergedLines[mergedLines.length - 1]}${line}`
        continue
      }
      mergedLines.push(line)
    }

    const lines = mergedLines.filter((line: string, idx: number) => {
      // WallstreetCN top promo is usually within first few blocks.
      if (idx >= 6) return true
      return !isTopAdLine(line)
    })

    for (const line of lines) {
      if (!skipping && promoKeywords.some(k => line.includes(k))) {
        skipping = true
        continue
      }

      if (skipping) {
        // Stop skipping at the next major section heading.
        if (/^(?:经济指标|经济数据|产业大会|公司财报|重点关注|今日焦点|财经日历)$/.test(line)) {
          skipping = false
          kept.push(line)
        }
        continue
      }

      // Also drop standalone promo lines even if not in a block.
      if (promoKeywords.some(k => line.includes(k))) {
        continue
      }

      kept.push(line)
    }

    text = kept.join("\n\n").trim() || undefined
  }
  // WallstreetCN images are frequently promo banners; keep body text only.
  const images: string[] = []

  return {
    title,
    desc: contentShort || undefined,
    text,
    images,
  }
}

export function parseWallstreetcnLivePayload(payload: unknown): WallstreetcnLive {
  if (!payload || typeof payload !== "object") return {}
  const p = payload as any
  const title = typeof p.title === "string" ? p.title.trim() : undefined
  const contentText = typeof p.content_text === "string" ? p.content_text.trim() : ""
  const content = typeof p.content === "string" ? p.content : ""

  const text = (contentText || content)
    .replace(/\n{3,}/g, "\n\n")
    .trim() || undefined

  const imagesFromPayload = Array.isArray(p.images)
    ? p.images
        .map((x: any) => (typeof x === "string" ? x : (typeof x?.url === "string" ? x.url : undefined)))
        .filter((x: any): x is string => typeof x === "string" && /^https?:\/\//.test(x))
    : []

  const images = Array.from(new Set<string>(imagesFromPayload)).slice(0, 3)

  return {
    title,
    desc: text,
    text,
    images,
  }
}

export function extractAssignedJsonObject(html: string, marker: string) {
  const start = html.indexOf(marker)
  if (start < 0) return undefined

  const braceStart = html.indexOf("{", start + marker.length)
  if (braceStart < 0) return undefined

  let i = braceStart
  let depth = 0
  let inString = false
  let escape = false

  for (; i < html.length; i += 1) {
    const ch = html[i]!
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === "\\") {
        escape = true
        continue
      }
      if (ch === "\"") {
        inString = false
      }
      continue
    }

    if (ch === "\"") {
      inString = true
      continue
    }

    if (ch === "{") {
      depth += 1
      continue
    }

    if (ch === "}") {
      depth -= 1
      if (depth === 0) {
        const jsonText = html.slice(braceStart, i + 1)
        try {
          return JSON.parse(jsonText)
        } catch {
          return undefined
        }
      }
    }
  }

  return undefined
}

export function extractBilibiliDesc(html: string, baseUrl: string) {
  try {
    const u = new URL(baseUrl)
    if (!u.hostname.toLowerCase().endsWith("bilibili.com")) return undefined
    if (!/\/video\/BV[0-9A-Za-z]+/.test(u.pathname)) return undefined

    const state = extractAssignedJsonObject(html, "window.__INITIAL_STATE__=")
    if (!state || typeof state !== "object") return undefined

    const videoData = (state as any).videoData
    if (videoData?.desc && typeof videoData.desc === "string") {
      return videoData.desc.trim()
    }

    const descV2 = videoData?.desc_v2
    if (Array.isArray(descV2)) {
      const parts = descV2
        .map((x: any) => (typeof x?.raw_text === "string" ? x.raw_text.trim() : ""))
        .filter(Boolean)
      const merged = parts.join("\n")
      return merged.trim() || undefined
    }
  } catch {
    // ignore
  }

  return undefined
}

export function extractVideo($: CheerioAPI, baseUrl: string): DetailVideo | undefined {
  // Site-specific embeds (best effort).
  try {
    const u = new URL(baseUrl)
    const host = u.hostname.toLowerCase()

    if (host.endsWith("bilibili.com")) {
      const bvid = /\/video\/(BV[0-9A-Za-z]+)/.exec(u.pathname)?.[1]
      if (bvid) {
        return {
          type: "iframe" as const,
          url: `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=1&high_quality=1&autoplay=0`,
        }
      }
    }

    if (host.endsWith("v.qq.com")) {
      let vid = u.searchParams.get("vid")
        || /\/x\/cover\/[^/]+\/([^./?#]+)\.html/i.exec(u.pathname)?.[1]

      // Many Tencent pages in our feed are cover pages like:
      //   /x/cover/<cid>.html
      // Those pages usually include a canonical link with the real vid:
      //   <link rel="canonical" href=".../x/cover/<cid>/<vid>.html">
      if (!vid) {
        const canonical = (
          $("link[rel='canonical']").attr("href")
          || $("meta[property='og:url']").attr("content")
          || ""
        ).trim()
        if (canonical) {
          try {
            const cu = new URL(canonical, baseUrl)
            vid = cu.searchParams.get("vid")
              || /\/x\/cover\/[^/]+\/([^./?#]+)\.html/i.exec(cu.pathname)?.[1]
          } catch {
            // ignore
          }
        }
      }

      if (vid) {
        return {
          type: "iframe" as const,
          url: `https://v.qq.com/txp/iframe/player.html?vid=${encodeURIComponent(vid)}`,
        }
      }
    }
  } catch {
    // ignore
  }

  const meta = (
    $("meta[property='og:video:secure_url']").attr("content")
    || $("meta[property='og:video:url']").attr("content")
    || $("meta[property='og:video']").attr("content")
    || $("meta[name='twitter:player:stream']").attr("content")
    || $("meta[name='twitter:player']").attr("content")
    || ""
  ).trim()

  const videoTag = (() => {
    const v = $("video").first()
    if (!v.length) return ""
    const src = v.attr("src")
    if (src) return src
    const source = v.find("source").first().attr("src")
    return source || ""
  })().trim()

  const picked = videoTag || meta
  if (!picked) return undefined

  const resolved = resolveUrl(baseUrl, picked)
  if (!resolved || !isHttpUrl(resolved)) return undefined

  let type: "iframe" | "file" | "hls" = "iframe"
  if (/\.m3u8(?:\?|$)/i.test(resolved)) type = "hls"
  else if (/\.(?:mp4|webm|ogg)(?:\?|$)/i.test(resolved)) type = "file"

  return { type, url: resolved }
}

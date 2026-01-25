import type { CheerioAPI } from "cheerio"

export interface DetailVideo {
  type: "iframe" | "file" | "hls"
  url: string
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

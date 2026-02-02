import type { NewsItem } from "@shared/types"

function isHttpUrl(url: string) {
  return /^https?:\/\//.test(url)
}

function normalizeUrl(u: unknown): string | undefined {
  if (typeof u !== "string") return
  if (!isHttpUrl(u)) return
  return u
}

function iconToUrl(icon: NewsItem["extra"] extends infer E
  ? E extends { icon?: infer I } ? I : never
  : never): string | undefined {
  if (!icon) return
  if (typeof icon === "string") return normalizeUrl(icon)
  if (typeof icon === "object" && icon && "url" in icon) return normalizeUrl((icon as any).url)
}

function looksLikeImage(url: string) {
  // Weibo flags are badges, not content images.
  if (/simg\.s\.weibo\.com\/moter\/flags\//i.test(url)) return false
  if (/\.(?:png|jpe?g|webp|gif)(?:\?|$)/i.test(url)) return true
  if (/thumbnail|thumb|cover|pic|image/i.test(url)) return true
  // some sources (e.g. bilibili) use CDN without extensions
  if (/hdslb\.com\//i.test(url)) return true
  return false
}

function extractImagesFromText(text: string) {
  if (!text) return []
  const out: string[] = []

  const imgTag = /<img[^>]*>/gi
  for (const m of text.matchAll(imgTag)) {
    const tag = m[0] || ""
    const srcset = /\ssrcset=["']([^"']+)["']/i.exec(tag)?.[1]
    const src = /\ssrc=["']([^"']+)["']/i.exec(tag)?.[1]
    const dataSrc = /\sdata-src=["']([^"']+)["']/i.exec(tag)?.[1]
    const bestFromSrcset = srcset
      ? srcset
          .split(",")
          .map(s => s.trim().split(/\s+/)[0])
          .filter(Boolean)
          .pop()
      : undefined
    const picked = bestFromSrcset || dataSrc || src
    if (picked && isHttpUrl(picked)) out.push(picked)
    if (out.length >= 3) break
  }

  if (out.length >= 3) return Array.from(new Set(out)).slice(0, 3)

  const md = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g
  for (const m of text.matchAll(md)) {
    const u = m[1]
    if (u && isHttpUrl(u)) out.push(u)
    if (out.length >= 3) break
  }

  return Array.from(new Set(out)).slice(0, 3)
}

/**
 * Ensure `extra.images` exists when we have a reasonable image URL.
 * This gives a consistent multi-image field across all sources.
 */
export function withImages(items: NewsItem[]): NewsItem[] {
  return items.map((item) => {
    const extra = item.extra
    const existingRaw = Array.isArray(extra?.images)
      ? extra!.images!.filter((x): x is string => typeof x === "string" && isHttpUrl(x))
      : []
    const existing = Array.from(new Set(existingRaw)).slice(0, 3)

    if (existing.length) {
      if (Array.isArray(extra?.images)
        && extra.images.length === existing.length
        && extra.images.every((x, i) => x === existing[i])) {
        return item
      }
      return {
        ...item,
        extra: {
          ...extra,
          images: existing,
        },
      }
    }

    const fromText = extractImagesFromText(String(extra?.hover || ""))
    const iconUrl = iconToUrl(extra?.icon as any)
    const iconImages = (iconUrl && looksLikeImage(iconUrl)) ? [iconUrl] : []

    const merged = Array.from(new Set([...fromText, ...iconImages])).slice(0, 3)
    if (!merged.length) return item

    return {
      ...item,
      extra: {
        ...(extra || {}),
        images: merged,
      },
    }
  })
}

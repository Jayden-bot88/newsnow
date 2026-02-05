import { load } from "cheerio"

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

function isLikelyNonContentImage(url: string) {
  try {
    const u = new URL(url)
    const path = `${u.hostname}${u.pathname}`.toLowerCase()
    if (path.endsWith(".svg")) return true
    if (/logo|icon|avatar|favicon|sprite|badge|placeholder|default/.test(path)) return true
    if (/pixel|1x1/.test(path)) return true
  } catch {
    return true
  }
  return false
}

export function extractMetaImages(html: string, baseUrl: string) {
  const $ = load(html)
  const raw = [
    $("meta[property='og:image:secure_url']").attr("content"),
    $("meta[property='og:image']").attr("content"),
    $("meta[name='twitter:image']").attr("content"),
    $("meta[name='twitter:image:src']").attr("content"),
  ]
    .map(x => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)

  const out: string[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    const resolved = resolveUrl(baseUrl, r)
    if (!resolved || !isHttpUrl(resolved)) continue
    if (isLikelyNonContentImage(resolved)) continue
    if (seen.has(resolved)) continue
    seen.add(resolved)
    out.push(resolved)
  }
  return out
}

export function pickFallbackImages(params: { finalUrl: string, metaImages: string[], max?: number }) {
  const { finalUrl, metaImages } = params
  const max = typeof params.max === "number" ? params.max : 3
  try {
    const u = new URL(finalUrl)
    if (u.hostname.endsWith("36kr.com") && u.pathname.startsWith("/newsflashes/")) {
      return []
    }
  } catch {
    // ignore
  }
  return metaImages.slice(0, max)
}

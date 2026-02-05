import type { CheerioAPI } from "cheerio"

// Cheerio's public types don't expose a stable AnyNode type in this repo.
// We keep the DOM node type loose here to avoid coupling to internal packages.
type DomNode = any

export type GenericDetailBlock =
  | { type: "h2", text: string }
  | { type: "p", text: string }
  | { type: "ul", items: string[] }
  | { type: "quote", text: string }
  | { type: "img", src: string, alt?: string }
  | { type: "caption", text: string }

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

function stripImageTransformUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const search = u.search || ""
    if (!search) return raw

    if (u.searchParams.has("x-oss-process")) {
      u.searchParams.delete("x-oss-process")
      return u.toString()
    }

    if (/^\?(?:imageMogr2|imageView2)\b/i.test(search) || (/imageMogr2|imageView2/i.test(search) && !search.includes("="))) {
      u.search = ""
      return u.toString()
    }

    return raw
  } catch {
    return raw
  }
}

function normalizeText(raw: string) {
  return raw.replace(/\s+/g, " ").trim()
}

function pickBestFromSrcset(srcset: string) {
  const last = srcset
    .split(",")
    .map(s => s.trim().split(/\s+/)[0])
    .filter(Boolean)
    .pop()
  return last || undefined
}

function getTagName(node: DomNode): string | undefined {
  const n = node as { name?: unknown }
  return typeof n.name === "string" ? n.name : undefined
}

function resolveImgUrl($: CheerioAPI, el: DomNode, baseUrl: string): string | undefined {
  const srcset = $(el).attr("srcset") || $(el).attr("data-srcset")
  const bestFromSrcset = typeof srcset === "string" ? pickBestFromSrcset(srcset) : undefined
  const src = bestFromSrcset
    || $(el).attr("data-src")
    || $(el).attr("data-original")
    || $(el).attr("data-lazyload")
    || $(el).attr("data-actualsrc")
    || $(el).attr("data-lazy-src")
    || $(el).attr("data-url")
    || $(el).attr("src")
  if (!src) return undefined

  const u = resolveUrl(baseUrl, src)
  if (!u || !isHttpUrl(u)) return undefined
  return stripImageTransformUrl(u)
}

export function extractGenericBlocks(params: {
  $: CheerioAPI
  container: { find: (selector: string) => { toArray: () => DomNode[] } }
  baseUrl: string
  maxBlocks?: number
}): GenericDetailBlock[] {
  const { $, container, baseUrl } = params
  const maxBlocks = typeof params.maxBlocks === "number" ? params.maxBlocks : 160

  const blocks: GenericDetailBlock[] = []
  const push = (b: GenericDetailBlock) => {
    const prev = blocks[blocks.length - 1]
    if (b.type === "img" && prev?.type === "img" && prev.src === b.src) return
    blocks.push(b)
  }

  const elements = container.find("h2,h3,h4,p,blockquote,ul,ol,img,figcaption").toArray()
  for (const el of elements) {
    if (blocks.length >= maxBlocks) break
    const tag = getTagName(el)
    if (!tag) continue

    if (tag === "img") {
      const src = resolveImgUrl($, el, baseUrl)
      if (src) {
        const alt = $(el).attr("alt")
        push({ type: "img", src, alt: typeof alt === "string" ? alt : undefined })
      }
      continue
    }

    if (tag === "figcaption") {
      const text = normalizeText($(el).text())
      if (text) push({ type: "caption", text })
      continue
    }

    if (tag === "ul" || tag === "ol") {
      const items = $(el)
        .find("li")
        .toArray()
        .map(li => normalizeText($(li).text()))
        .filter(Boolean)
      if (items.length >= 2) push({ type: "ul", items })
      else if (items.length === 1) push({ type: "p", text: items[0]! })
      continue
    }

    if (tag === "blockquote") {
      const text = normalizeText($(el).text())
      if (text) push({ type: "quote", text })
      continue
    }

    if (tag === "h2" || tag === "h3" || tag === "h4") {
      const text = normalizeText($(el).text())
      if (text) push({ type: "h2", text })
      continue
    }

    if (tag === "p") {
      const text = normalizeText($(el).text())
      if (text) push({ type: "p", text })
      continue
    }
  }

  return blocks
}

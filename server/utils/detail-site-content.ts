import { load } from "cheerio"
import type { CheerioAPI } from "cheerio"

import { extractAssignedJsonObject } from "./detail-extract"

export type DetailBlock =
  | { type: "h2", text: string }
  | { type: "p", text: string }
  | { type: "ul", items: string[] }
  | { type: "quote", text: string }
  | { type: "img", src: string, alt?: string }
  | { type: "caption", text: string }

export interface ExtractedSiteContent {
  title?: string
  text: string
  images: string[]
  blocks?: DetailBlock[]
}

function isHttpUrl(url: string) {
  return /^https?:\/\//.test(url)
}

function cleanBlocks(blocks: string[]) {
  return blocks
    .map(s => String(s)
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim())
    .filter(Boolean)
}

function normalizeText(raw: string) {
  return raw
    .replace(/\s+/g, " ")
    .trim()
}

function getImgSrc($: CheerioAPI, el: any) {
  const src = $(el).attr("data-src")
    || $(el).attr("data-original")
    || $(el).attr("data-lazyload")
    || $(el).attr("src")
  if (typeof src !== "string") return undefined
  const trimmed = src.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith("//")) return `https:${trimmed}`
  if (!isHttpUrl(trimmed)) return undefined
  return trimmed
}

function blocksToText(blocks: DetailBlock[]) {
  const out: string[] = []
  for (const b of blocks) {
    if (b.type === "p" || b.type === "h2" || b.type === "quote") {
      if (b.text) out.push(b.text)
      continue
    }
    if (b.type === "ul") {
      const items = b.items.map(x => `- ${x}`).join("\n")
      if (items.trim()) out.push(items)
      continue
    }
  }
  return out.join("\n\n").trim()
}

export function extractFromHtmlContent(contentHtml: string) {
  const $ = load(contentHtml)
  $("script,style,noscript").remove()
  $("br").replaceWith("\n")

  const blocks: DetailBlock[] = []
  const elements = $("p,h2,h3,h4,blockquote,ul,ol,pre,img,figcaption").toArray()
  for (const el of elements) {
    const tag = (el as any).name as string | undefined
    if (tag === "img") {
      const src = getImgSrc($, el)
      if (src) {
        const alt = $(el).attr("alt")
        blocks.push({ type: "img", src, alt: typeof alt === "string" ? alt : undefined })
      }
      continue
    }

    if (tag === "figcaption") {
      const text = normalizeText($(el).text())
      if (text) blocks.push({ type: "caption", text })
      continue
    }

    if (tag === "ul" || tag === "ol") {
      const items = $(el)
        .find("li")
        .toArray()
        .map(li => normalizeText($(li).text()))
        .filter(Boolean)
      if (items.length >= 2) blocks.push({ type: "ul", items })
      else if (items.length === 1) blocks.push({ type: "p", text: items[0]! })
      continue
    }

    if (tag === "blockquote") {
      const text = normalizeText($(el).text())
      if (text) blocks.push({ type: "quote", text })
      continue
    }

    if (tag === "h2" || tag === "h3" || tag === "h4") {
      const text = normalizeText($(el).text())
      if (text) blocks.push({ type: "h2", text })
      continue
    }

    if (tag === "p" || tag === "pre") {
      // Keep paragraph text; images are handled by the standalone <img> elements.
      const text = normalizeText($(el).text())
      if (text) blocks.push({ type: "p", text })
      continue
    }
  }

  const hasTextLike = blocks.some(b => b.type !== "img")
  if (!hasTextLike) {
    const text = normalizeText($.root().text())
    if (text) blocks.push({ type: "p", text })
  }

  // Deduplicate consecutive images to avoid double-counting when HTML wraps <img> inside a <p>.
  const deduped: DetailBlock[] = []
  for (const b of blocks) {
    const prev = deduped[deduped.length - 1]
    if (b.type === "img" && prev?.type === "img" && prev.src === b.src) continue
    deduped.push(b)
  }

  const images = Array.from(new Set(deduped.filter(b => b.type === "img").map(b => b.src)))

  const text = blocksToText(deduped)
  return {
    blocks: deduped,
    text,
    images,
  }
}

function extractNextDataJson(html: string) {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/)
  if (!m?.[1]) return undefined
  try {
    return JSON.parse(m[1])
  } catch {
    return undefined
  }
}

export function extractSiteContent(params: {
  html: string
  finalUrl: string
}): ExtractedSiteContent | undefined {
  let u: URL
  try {
    u = new URL(params.finalUrl)
  } catch {
    return undefined
  }

  const host = u.hostname.toLowerCase()
  const path = u.pathname
  const html = params.html

  // CLS embeds article content inside __NEXT_DATA__ initialState.
  if (host === "www.cls.cn" || host.endsWith(".cls.cn")) {
    const data = extractNextDataJson(html)
    const detail = data?.props?.initialState?.detail?.articleDetail
    const title = typeof detail?.title === "string" ? detail.title.trim() : ""
    const content = typeof detail?.content === "string" ? detail.content.trim() : ""
    const brief = typeof detail?.brief === "string" ? detail.brief.trim() : ""
    const text = content || brief
    if (text) {
      const blocks: DetailBlock[] = []
      if (title) blocks.push({ type: "h2", text: title })
      blocks.push({ type: "p", text })
      return { title: title || undefined, text, images: [], blocks }
    }
  }

  // V2EX renders topic body as HTML under .topic_content.
  if (host === "v2ex.com" || host === "www.v2ex.com" || host.endsWith(".v2ex.com")) {
    const $ = load(html)
    $("script,style,noscript").remove()
    $("br").replaceWith("\n")
    const container = $(".topic_content").first()
    if (container.length) {
      const extracted = extractFromHtmlContent(container.html() || "")
      if (extracted.text) return extracted
    }
  }

  // Tencent News is frequently protected by JS WAF interstitials.
  if ((host.endsWith("qq.com") || host.endsWith("inews.qq.com")) && /waf\.tencent\.com\/501page\.html/.test(html)) {
    return {
      blocks: [{ type: "p", text: "腾讯新闻正文触发拦截（WAF），当前无法在未授权情况下抓取正文。可点击右上角“原文”查看。" }],
      text: "腾讯新闻正文触发拦截（WAF），当前无法在未授权情况下抓取正文。可点击右上角“原文”查看。",
      images: [],
    }
  }

  // 36kr newsflash pages contain good meta description.
  if (host.endsWith("36kr.com") && path.startsWith("/newsflashes/")) {
    const $ = load(html)
    const desc = $("meta[name='description']").attr("content")?.trim()
      || $("meta[property='og:description']").attr("content")?.trim()
    const title = $("meta[property='og:title']").attr("content")?.trim()
    if (desc) {
      const blocks: DetailBlock[] = []
      if (title) blocks.push({ type: "h2", text: title })
      blocks.push({ type: "p", text: desc })
      return {
        title,
        text: desc,
        // 36kr uses a site-level og:image for many newsflashes. Do not treat it as a content image.
        images: [],
        blocks,
      }
    }
  }

  // The Paper embeds full HTML content inside Next.js data.
  if (host.endsWith("thepaper.cn")) {
    const data = extractNextDataJson(html)
    const contentHtml = data?.props?.pageProps?.detailData?.contentDetail?.content
    if (typeof contentHtml === "string" && contentHtml.trim()) {
      const extracted = extractFromHtmlContent(contentHtml)
      if (extracted.text) return extracted
    }
  }

  // Ifeng article page includes JSON blob with content HTML.
  if (host.endsWith("ifeng.com")) {
    const allData = extractAssignedJsonObject(html, "var allData =")
    const list = allData?.docData?.contentData?.contentList
    const blocks: DetailBlock[] = []
    const images: string[] = []
    if (Array.isArray(list)) {
      for (const node of list) {
        if (!node || typeof node !== "object") continue
        const htmlBlock = (node as any).data
        if (typeof htmlBlock !== "string") continue
        const extracted = extractFromHtmlContent(htmlBlock)
        blocks.push(...extracted.blocks)
        images.push(...extracted.images)
      }
    }
    const text = blocksToText(blocks)
    if (text) {
      return {
        blocks,
        text,
        images: Array.from(new Set(images)).slice(0, 9),
      }
    }
  }

  // IT之家: article body is under #paragraph.
  if (host.endsWith("ithome.com")) {
    const $ = load(html)
    $("script,style,noscript").remove()
    $("br").replaceWith("\n")
    const container = $("#paragraph").first()
    if (container.length) {
      const lines = container
        .find("h1,h2,h3,p,li,pre")
        .toArray()
        .map(el => $(el).text().replace(/\s+/g, " ").trim())
        .filter(Boolean)
      const text = cleanBlocks(lines).join("\n\n").trim()
      const imgs = container
        .find("img")
        .toArray()
        .map(el => $(el).attr("src"))
        .filter((x): x is string => typeof x === "string" && isHttpUrl(x))
      const images = Array.from(new Set(imgs)).slice(0, 9)
      if (text) {
        const extracted = extractFromHtmlContent(container.html() || "")
        return { blocks: extracted.blocks, text, images }
      }
    }
  }

  // PCBeta (Discuz): thread body is in the first postmessage cell.
  if (host === "bbs.pcbeta.com" || host.endsWith(".pcbeta.com")) {
    const $ = load(html)
    $("script,style,noscript").remove()

    const post = $("#postlist td.t_f[id^='postmessage_']").first()
    if (post.length) {
      const base = `${u.protocol}//${u.host}`

      const cloned = post.clone()
      // Remove attachment hover/tooltips and other UI-only blocks.
      cloned.find("div.tip,div.aimg_tip,script,style").remove()

      // Discuz often uses a placeholder src with the real url stored in zoomfile/file.
      cloned.find("img").each((_, el) => {
        const zoom = $(el).attr("zoomfile")
          || $(el).attr("file")
          || $(el).attr("data-src")
          || $(el).attr("src")
        if (typeof zoom !== "string" || !zoom.trim()) return
        const resolved = (() => {
          try {
            return new URL(zoom, base).toString()
          } catch {
            return undefined
          }
        })()
        if (!resolved) return
        $(el).attr("src", resolved)
      })

      const cleanedHtml = cloned.html() || ""
      const textLines = cleanedHtml
        .replace(/\r/g, "")
        .replace(/<br\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .split(/\n+/)
        .map(s => s.replace(/\s+/g, " ").trim())
        .filter(Boolean)

      const blocks: DetailBlock[] = textLines.map(text => ({ type: "p", text }))
      const images: string[] = []
      cloned.find("img").each((_, el) => {
        const src = $(el).attr("src")
        if (typeof src !== "string" || !isHttpUrl(src)) return
        images.push(src)
        blocks.push({ type: "img", src })
      })

      const text = blocksToText(blocks)
      if (text || images.length) {
        return {
          text,
          images: Array.from(new Set(images)).slice(0, 9),
          blocks,
        }
      }
    }
  }

  return undefined
}

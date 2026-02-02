import { extractFromHtmlContent } from "./detail-site-content"
import type { DetailBlock, ExtractedSiteContent } from "./detail-site-content"

function isRecord(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object"
}

function getString(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined
}

function getNumber(x: unknown): number | undefined {
  return typeof x === "number" ? x : undefined
}

export interface Jin10Item {
  id: string
  time: string
  data: {
    title?: string
    content?: string
    pic?: string
  }
}

export function parseJin10NewestJs(raw: string): Jin10Item[] | undefined {
  const jsonStr = raw
    .replace(/^var\s+newest\s*=\s*/i, "")
    .replace(/;*\s*$/, "")
    .trim()
  if (!jsonStr.startsWith("[")) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed)) return undefined

  const out: Jin10Item[] = []
  for (const x of parsed) {
    if (!isRecord(x)) continue
    const id = (getString(x.id) || "").trim()
    const time = (getString(x.time) || "").trim()
    const data = x.data
    if (!id || !isRecord(data)) continue
    const title = (getString(data.title) || "").trim()
    const content = (getString(data.content) || "").trim()
    const pic = (getString(data.pic) || "").trim()
    out.push({
      id,
      time,
      data: {
        ...(title ? { title } : {}),
        ...(content ? { content } : {}),
        ...(pic ? { pic } : {}),
      },
    })
  }
  return out
}

export function extractJin10FlashDetail(params: { id: string, newest: Jin10Item[] }): ExtractedSiteContent | undefined {
  const hit = params.newest.find(x => x.id === params.id)
  if (!hit) return undefined
  const raw = (hit.data.content || hit.data.title || "").trim()
  if (!raw) return undefined

  const text = raw.replace(/<\/?b>/g, "").trim()
  const blocks: DetailBlock[] = []
  const m = /^【([^】]+)】(.*)$/.exec(text)
  const title = (m?.[1] || "").trim()
  const body = (m?.[2] || "").trim() || text
  if (title) blocks.push({ type: "h2", text: title })
  blocks.push({ type: "p", text: body })

  const pic = (hit.data.pic || "").trim()
  if (/^https?:\/\//.test(pic)) blocks.push({ type: "img", src: pic })

  return {
    title: title || undefined,
    text: body,
    images: [],
    blocks,
  }
}

export function extractMktnewsFlashDetail(params: { id: string, apiJson: unknown }): ExtractedSiteContent | undefined {
  if (!isRecord(params.apiJson)) return undefined
  const list = params.apiJson.data
  if (!Array.isArray(list)) return undefined

  const hit = list.find((x) => {
    if (!isRecord(x)) return false
    const id = getString(x.id)
    return id === params.id
  })
  if (!hit || !isRecord(hit)) return undefined
  const data = hit.data
  if (!isRecord(data)) return undefined

  const content = (getString(data.content) || "").trim()
  const title = (getString(data.title) || "").trim()
  const pic = (getString(data.pic) || "").trim()

  const text = content || title
  if (!text) return undefined

  const blocks: DetailBlock[] = []
  if (title && title !== content) blocks.push({ type: "h2", text: title })
  blocks.push({ type: "p", text })

  const images = pic && /^https?:\/\//.test(pic) ? [pic] : []
  return {
    title: title || undefined,
    text,
    images,
    blocks,
  }
}

export function extractXueqiuStockDetail(params: { symbol: string, apiJson: unknown }): ExtractedSiteContent | undefined {
  if (!isRecord(params.apiJson)) return undefined
  const data = params.apiJson.data
  if (!isRecord(data)) return undefined
  const quote = data.quote
  if (!isRecord(quote)) return undefined

  const name = (getString(quote.name) || "").trim()
  const symbol = (getString(quote.symbol) || params.symbol).trim()
  const current = getNumber(quote.current)
  const percent = getNumber(quote.percent)
  const exchange = (getString(quote.exchange) || "").trim()

  const title = name ? `${name}（${symbol}）` : symbol
  const parts: string[] = []
  if (current !== undefined) parts.push(`现价：${current}`)
  if (percent !== undefined) parts.push(`涨跌幅：${percent}%`)
  if (exchange) parts.push(`交易所：${exchange}`)

  const text = parts.join("\n") || title
  if (!text.trim()) return undefined

  const blocks: DetailBlock[] = [
    { type: "h2", text: title },
    { type: "p", text },
  ]

  return {
    title,
    text,
    images: [],
    blocks,
  }
}

export function extractZhihuAnswerDetail(params: { apiJson: unknown }): ExtractedSiteContent | undefined {
  if (!isRecord(params.apiJson)) return undefined
  const contentHtml = getString(params.apiJson.content) || ""
  const question = params.apiJson.question
  const questionTitle = isRecord(question) ? (getString(question.title) || "").trim() : ""
  if (!contentHtml.trim()) return undefined
  const extracted = extractFromHtmlContent(contentHtml)
  if (!extracted.text) return undefined
  return {
    title: questionTitle || undefined,
    text: extracted.text,
    images: extracted.images,
    blocks: extracted.blocks,
  }
}

export function extractZhihuQuestionDetail(params: { apiJson: unknown }): ExtractedSiteContent | undefined {
  if (!isRecord(params.apiJson)) return undefined
  const title = (getString(params.apiJson.title) || "").trim()
  const detailHtml = getString(params.apiJson.detail) || ""
  if (!detailHtml.trim()) return undefined
  const extracted = extractFromHtmlContent(detailHtml)
  if (!extracted.text) return undefined
  return {
    title: title || undefined,
    text: extracted.text,
    images: extracted.images,
    blocks: extracted.blocks,
  }
}

export function extractDoubanMovieSubjectDetail(params: { apiJson: unknown }): ExtractedSiteContent | undefined {
  if (!isRecord(params.apiJson)) return undefined

  const title = (getString(params.apiJson.title) || "").trim()
  const intro = (getString(params.apiJson.intro) || "").trim()
  const cardSubtitle = (getString(params.apiJson.card_subtitle) || "").trim()
  const pic = isRecord(params.apiJson.pic) ? (getString(params.apiJson.pic.large) || getString(params.apiJson.pic.normal) || "").trim() : ""

  const rating = isRecord(params.apiJson.rating) ? getNumber(params.apiJson.rating.value) : undefined
  const ratingCount = isRecord(params.apiJson.rating) ? getNumber(params.apiJson.rating.count) : undefined

  const blocks: DetailBlock[] = []
  if (title) blocks.push({ type: "h2", text: title })
  if (cardSubtitle) blocks.push({ type: "p", text: cardSubtitle })
  if (rating !== undefined) {
    const suffix = ratingCount !== undefined ? `（${ratingCount}人评分）` : ""
    blocks.push({ type: "p", text: `豆瓣评分：${rating}${suffix}` })
  }
  if (intro) blocks.push({ type: "p", text: intro })

  const text = blocks
    .filter(b => b.type === "p" || b.type === "h2" || b.type === "quote" || b.type === "caption")
    .map(b => (b as { text: string }).text)
    .join("\n\n")
    .trim()

  const images = pic && /^https?:\/\//.test(pic) ? [pic] : []
  if (!text && !images.length) return undefined
  return {
    title: title || undefined,
    text,
    images,
    blocks,
  }
}

export function extractKaopuNewsListEntryDetail(params: { apiJsonEntry: unknown }): ExtractedSiteContent | undefined {
  if (!isRecord(params.apiJsonEntry)) return undefined
  const title = (getString(params.apiJsonEntry.title) || "").trim()
  const desc = (getString(params.apiJsonEntry.description) || "").trim()
  const publisher = (getString(params.apiJsonEntry.publisher) || "").trim()

  const text = desc
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean)
    .join("\n")
    .trim()

  if (!text) return undefined

  const blocks: DetailBlock[] = []
  const heading = title || publisher
  if (heading) blocks.push({ type: "h2", text: heading })
  for (const line of text.split(/\n+/)) {
    const t = line.trim()
    if (t) blocks.push({ type: "p", text: t })
  }

  return {
    title: title || undefined,
    text,
    images: [],
    blocks,
  }
}

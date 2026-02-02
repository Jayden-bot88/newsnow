import type { PostDetailBlock } from "./detail-blocks-post"

function normalizeTitleLike(s: string) {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s*[-|—–]\s*\S+\s*$/, "")
    .trim()
}

export function preferDescWhenExtractedIsTitle(params: {
  title: string
  desc: string
  extractedText: string
}) {
  const title = params.title.trim()
  const desc = params.desc.trim()
  const extractedText = params.extractedText.trim()

  if (!title || !desc || !extractedText) return extractedText

  // If extraction only captured the title (common on JS-heavy/anti-bot sites),
  // prefer meta description so users see something useful.
  if (normalizeTitleLike(extractedText) === normalizeTitleLike(title)) {
    if (desc.length >= extractedText.length + 20) {
      return desc
    }
  }

  return extractedText
}

export function blocksToText(blocks: PostDetailBlock[]) {
  const out: string[] = []
  for (const b of blocks) {
    if (b.type === "p" || b.type === "h2" || b.type === "quote" || b.type === "caption") {
      const t = b.text.trim()
      if (t) out.push(t)
      continue
    }
    if (b.type === "ul") {
      const items = b.items
        .map(x => x.trim())
        .filter(Boolean)
      if (items.length) out.push(items.map(x => `- ${x}`).join("\n"))
      continue
    }
    // Ignore images in the text output.
  }
  return out.join("\n\n").trim()
}

import type { ReactNode } from "react"
import { useMemo } from "react"

import { SafeImage } from "~/components/common/safe-image"

export type DetailBlock =
  | { type: "h2", text: string }
  | { type: "p", text: string }
  | { type: "ul", items: string[] }
  | { type: "quote", text: string }
  | { type: "img", src: string, alt?: string }
  | { type: "caption", text: string }

const URL_RE = /https?:\/\/\S+/g

function splitTrailingPunctuation(url: string): { url: string, trailing: string } {
  let trimmed = url
  while (trimmed && /[),.;!?，。！？、】【》”'"]$/.test(trimmed)) {
    trimmed = trimmed.slice(0, -1)
  }
  return { url: trimmed, trailing: url.slice(trimmed.length) }
}

function linkify(text: string): ReactNode {
  const matches = [...text.matchAll(URL_RE)]
  if (!matches.length) return text

  const out: ReactNode[] = []
  let lastIndex = 0

  for (const m of matches) {
    const start = m.index ?? 0
    const raw = m[0] ?? ""
    const { url, trailing } = splitTrailingPunctuation(raw)
    if (!url) continue

    if (start > lastIndex) out.push(text.slice(lastIndex, start))
    out.push(
      <a
        key={`${start}:${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="tt-link"
      >
        {url}
      </a>,
    )
    if (trailing) out.push(trailing)
    lastIndex = start + raw.length
  }

  if (lastIndex < text.length) out.push(text.slice(lastIndex))
  return out
}

function blockKey(b: DetailBlock, i: number) {
  if (b.type === "img") return `img:${b.src}`
  if (b.type === "ul") return `ul:${b.items[0] ?? i}`
  return `${b.type}:${b.text}`
}

function clipBlocks(blocks: DetailBlock[], expanded: boolean, limitChars: number) {
  if (expanded) return blocks
  let remaining = limitChars
  const out: DetailBlock[] = []

  for (const b of blocks) {
    if (b.type === "img") {
      out.push(b)
      continue
    }
    if (b.type === "ul") {
      const kept: string[] = []
      for (const item of b.items) {
        if (remaining <= 0) break
        kept.push(item)
        remaining -= item.length
      }
      if (kept.length) out.push({ type: "ul", items: kept })
      if (remaining <= 0) break
      continue
    }

    const text = b.text || ""
    if (text.length <= remaining) {
      out.push(b)
      remaining -= text.length
      continue
    }
    if (remaining > 0) {
      const clippedText = `${text.slice(0, Math.max(0, remaining)).trim()}...`
      if (b.type === "p") out.push({ type: "p", text: clippedText })
      else if (b.type === "h2") out.push({ type: "h2", text: clippedText })
      else if (b.type === "quote") out.push({ type: "quote", text: clippedText })
      else if (b.type === "caption") out.push({ type: "caption", text: clippedText })
    }
    break
  }
  return out
}

export function ArticleBlocks({
  blocks,
  expanded,
  limitChars = 900,
  onImage,
}: {
  blocks: DetailBlock[]
  expanded: boolean
  limitChars?: number
  onImage: (src: string) => void
}) {
  const clipped = useMemo(() => clipBlocks(blocks, expanded, limitChars), [blocks, expanded, limitChars])
  return (
    <div className="text-[17px] leading-[28px] sm:(text-[18px] leading-[30px]) color-[var(--tt-text)] break-words">
      {clipped.map((b, i) => {
        const key = blockKey(b, i)
        const isFirst = i === 0
        const isLast = i === clipped.length - 1
        if (b.type === "h2") {
          return (
            <h2
              key={key}
              className={$(
                isFirst ? "mt-1" : "mt-6",
                "mb-3",
                "text-[20px] leading-[30px] font-semibold",
              )}
            >
              {linkify(b.text)}
            </h2>
          )
        }
        if (b.type === "ul") {
          return (
            <ul
              key={key}
              className={$(
                isFirst ? "mt-1" : "mt-0",
                isLast ? "mb-0" : "mb-5",
                "pl-5 sm:pl-6 list-disc",
              )}
            >
              {b.items.map(x => (
                <li key={x} className="mb-2 last:mb-0">
                  {linkify(x)}
                </li>
              ))}
            </ul>
          )
        }
        if (b.type === "quote") {
          return (
            <blockquote
              key={key}
              className={$(
                isFirst ? "mt-1" : "mt-0",
                isLast ? "mb-0" : "mb-5",
                "pl-3 sm:pl-4 border-l-[3px] border-neutral-200 color-neutral-700",
              )}
            >
              {linkify(b.text)}
            </blockquote>
          )
        }
        if (b.type === "caption") {
          return (
            <div
              key={key}
              className={$(
                isFirst ? "mt-1" : "mt--3",
                isLast ? "mb-0" : "mb-5",
                "text-[13px] leading-[18px] color-[var(--tt-subtext)]",
              )}
            >
              {linkify(b.text)}
            </div>
          )
        }
        if (b.type === "img") {
          return (
            <button
              key={key}
              type="button"
              className={$(
                "block w-full p-0 m-0 border-0 bg-transparent",
                isFirst ? "mt-1" : "mt-0",
                isLast ? "mb-0" : "mb-5",
              )}
              onClick={() => onImage(b.src)}
              aria-label="查看正文图片"
            >
              <SafeImage
                src={b.src}
                alt={b.alt || ""}
                className="w-full max-h-[360px] rounded-[10px] bg-[#f2f3f5] object-contain"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </button>
          )
        }

        return (
          <p
            key={key}
            className={$(
              isFirst ? "mt-1" : "mt-0",
              isLast ? "mb-0" : "mb-5",
              "whitespace-pre-wrap",
            )}
          >
            {linkify(b.text)}
          </p>
        )
      })}
    </div>
  )
}

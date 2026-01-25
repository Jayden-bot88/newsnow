import type { ReactNode } from "react"
import { useMemo } from "react"

type Block =
  | { type: "h2", text: string }
  | { type: "p", text: string }
  | { type: "ul", items: string[] }
  | { type: "quote", text: string }

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

function splitBlocks(raw: string): Block[] {
  const parts = raw
    .split(/\n{2,}/)
    .map(s => s.trim())
    .filter(Boolean)

  const blocks: Block[] = []
  for (const part of parts) {
    // bullet list
    const lines = part.split(/\n/).map(s => s.trim()).filter(Boolean)
    const bulletLines = lines.filter(s => /^[-*•]\s+/.test(s))
    if (bulletLines.length >= 2 && bulletLines.length === lines.length) {
      blocks.push({
        type: "ul",
        items: bulletLines.map(s => s.replace(/^[-*•]\s+/, "")),
      })
      continue
    }

    // quote
    if (part.startsWith("\"") || part.startsWith("“") || part.startsWith(">")) {
      blocks.push({ type: "quote", text: part.replace(/^>\s*/, "").trim() })
      continue
    }

    // heading heuristic
    if (part.length <= 28 && /[：:]/.test(part)) {
      blocks.push({ type: "h2", text: part })
      continue
    }

    blocks.push({ type: "p", text: part })
  }
  return blocks
}

export function ArticleBody({ text, expanded, limitChars = 900 }: { text: string, expanded: boolean, limitChars?: number }) {
  const clipped = useMemo(() => {
    if (expanded) return text
    if (text.length <= limitChars) return text
    return `${text.slice(0, limitChars).trim()}...`
  }, [expanded, limitChars, text])

  const blocks = useMemo(() => splitBlocks(clipped), [clipped])
  return (
    <div className="text-[18px] leading-[30px] color-[var(--tt-text)]">
      {blocks.map((b, i) => {
        const key = `${b.type}:${(b as any).text ?? (b as any).items?.[0] ?? i}`
        const isFirst = i === 0
        const isLast = i === blocks.length - 1
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
                "pl-6 list-disc",
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
                "pl-4 border-l-[3px] border-neutral-200 color-neutral-700",
              )}
            >
              {linkify(b.text)}
            </blockquote>
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

import type { NewsItem } from "./types"

export function normalizeMutedNeedles(keywords: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of keywords) {
    const k = String(raw).trim().toLowerCase()
    if (!k) continue
    if (seen.has(k)) continue
    seen.add(k)
    out.push(k)
    if (out.length >= 200) break
  }
  return out
}

export function isMutedItem(item: NewsItem, mutedNeedles: string[]): boolean {
  if (!mutedNeedles.length) return false
  const hay = `${item.title} ${item.extra?.hover ?? ""}`.toLowerCase()
  return mutedNeedles.some(k => hay.includes(k))
}

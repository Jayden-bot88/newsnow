import { createFileRoute } from "@tanstack/react-router"
import type { NewsItem, SourceID, SourceResponse } from "@shared/types"
import { sources } from "@shared/sources"
import { HOT_WORDS } from "@shared/hot-words"
import { isMutedItem, normalizeMutedNeedles } from "@shared/muted-keywords"
import { useQueries } from "@tanstack/react-query"
import $ from "clsx"
import { useAtomValue } from "jotai"
import { useCallback, useEffect, useMemo, useState } from "react"

import { StatusView } from "~/components/common/status-view"
import { FeedCard } from "~/components/feed/feed-card"
import { apiFetch } from "~/utils/apiFetch"
import { currentColumnIDAtom, currentSourcesAtom, mutedKeywordsAtom } from "~/atoms"
import { readJwt, safeParseString } from "~/utils"
import { cacheSources, refetchSources } from "~/utils/data"

export const Route = createFileRoute("/search")({
  validateSearch: (search) => {
    const q = typeof search.q === "string" ? search.q : ""

    const source = typeof search.source === "string" && sources[search.source as SourceID]
      ? (search.source as SourceID)
      : ""

    const rangeRaw = typeof search.range === "string" ? search.range : "all"
    const range: Range = (rangeRaw === "24h" || rangeRaw === "7d" || rangeRaw === "30d")
      ? rangeRaw
      : "all"

    return { q, source, range }
  },
  component: SearchPage,
})

const HISTORY_KEY = "tt-search-history"
const HISTORY_LIMIT = 12

type Range = "all" | "24h" | "7d" | "30d"

function toTimestamp(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v === "string") {
    const parsed = Date.parse(v)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function itemTimestamp(item: NewsItem): number {
  return toTimestamp(item.pubDate) || toTimestamp(item.extra?.date)
}

function readHistory(): string[] {
  try {
    const raw = safeParseString(localStorage.getItem(HISTORY_KEY))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

function writeHistory(items: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)))
  } catch {
    // best-effort only
  }
}

function pushHistory(term: string) {
  const v = term.trim()
  if (!v) return readHistory()
  const prev = readHistory().filter(x => x !== v)
  const next = [v, ...prev].slice(0, HISTORY_LIMIT)
  writeHistory(next)
  return next
}

function SearchPage() {
  const nav = Route.useNavigate()
  const { q, source: sourceFilter, range } = Route.useSearch()
  const sourceIds = useAtomValue(currentSourcesAtom)
  useAtomValue(currentColumnIDAtom)
  const mutedKeywords = useAtomValue(mutedKeywordsAtom)

  const [input, setInput] = useState(q)
  const [history, setHistory] = useState<string[]>([])
  const [limit, setLimit] = useState(30)
  const trimmedQ = q.trim()
  const enabled = trimmedQ.length > 0

  const mutedNeedles = useMemo(() => {
    return normalizeMutedNeedles(mutedKeywords)
  }, [mutedKeywords])

  const sourceOptions = useMemo(() => {
    const uniq = Array.from(new Set(sourceIds))
    return uniq
      .map((id) => {
        const s = sources[id]
        const label = s?.desc || s?.title || s?.name || id
        return { id, label }
      })
      .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"))
  }, [sourceIds])

  const sinceTs = useMemo(() => {
    const now = Date.now()
    switch (range) {
      case "24h":
        return now - 24 * 60 * 60 * 1000
      case "7d":
        return now - 7 * 24 * 60 * 60 * 1000
      case "30d":
        return now - 30 * 24 * 60 * 60 * 1000
      default:
        return 0
    }
  }, [range])

  useEffect(() => {
    setInput(q)
    setLimit(30)
  }, [q, range, sourceFilter])

  useEffect(() => {
    setHistory(readHistory())
  }, [])

  const results = useQueries({
    queries: sourceIds.map((sourceId: SourceID) => ({
      queryKey: ["source", sourceId],
      enabled,
      queryFn: async () => {
        if (!refetchSources.has(sourceId) && cacheSources.has(sourceId)) {
          return cacheSources.get(sourceId)!
        }

        let url = `/s?id=${sourceId}`
        const headers: Record<string, any> = {}
        if (refetchSources.has(sourceId)) {
          url = `/s?id=${sourceId}&latest`
          const jwt = readJwt()
          if (jwt) headers.Authorization = `Bearer ${jwt}`
          refetchSources.delete(sourceId)
        }

        const res = await apiFetch<SourceResponse>(url, { headers })
        cacheSources.set(sourceId, res as any)
        return res
      },
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
    })),
  })

  const rows = useMemo(() => {
    if (!enabled) return []
    const needle = trimmedQ.toLowerCase()
    const out: Array<{ sourceId: SourceID, item: NewsItem, ts: number }> = []
    results.forEach((r, idx) => {
      const sourceId = sourceIds[idx]
      if (sourceFilter && sourceId !== sourceFilter) return
      const data = r.data as SourceResponse | undefined
      const items = data?.items || []
      items.forEach((item: NewsItem) => {
        const hay = `${item.title} ${item.extra?.hover ?? ""}`.toLowerCase()
        if (!hay.includes(needle)) return
        if (isMutedItem(item, mutedNeedles)) return

        const ts = itemTimestamp(item)
        if (sinceTs && (!ts || ts < sinceTs)) return

        out.push({ sourceId, item, ts })
      })
    })
    out.sort((a, b) => (b.ts || -1) - (a.ts || -1))
    return out
  }, [enabled, mutedNeedles, results, sinceTs, sourceFilter, sourceIds, trimmedQ])

  const loading = enabled && results.some(r => r.isLoading)
  const allError = enabled && results.length > 0 && results.every(r => r.isError)

  const commit = useCallback((raw: string) => {
    const v = raw.trim()
    if (!v) return
    setHistory(pushHistory(v))
    nav({ to: "/search", search: { q: v, source: sourceFilter, range } })
  }, [nav, range, sourceFilter])

  const onSubmit = useCallback(() => {
    const v = input.trim()
    if (!v) return
    commit(v)
  }, [commit, input])

  const setSourceFilter = useCallback((raw: string) => {
    const next = raw && sources[raw as SourceID] ? (raw as SourceID) : ""
    nav({ to: "/search", search: { q, source: next, range } })
  }, [nav, q, range])

  const setRange = useCallback((raw: string) => {
    const next: Range = (raw === "24h" || raw === "7d" || raw === "30d") ? raw : "all"
    nav({ to: "/search", search: { q, source: sourceFilter, range: next } })
  }, [nav, q, sourceFilter])

  const resetFilters = useCallback(() => {
    nav({ to: "/search", search: { q, source: "", range: "all" } })
  }, [nav, q])

  return (
    <div className="min-h-[100vh] bg-[var(--tt-bg)]">
      <header className={$([
        "sticky top-0 z-10",
        "bg-white",
        "border-b border-[var(--tt-border)]",
      ])}
      >
        <div className="px-3 pt-[calc(env(safe-area-inset-top,0px)+4px)] pb-2">
          <div className="flex items-center gap-2 h-11">
            <button
              type="button"
              className="i-ph:caret-left-duotone text-2xl color-neutral-800"
              aria-label="Back"
              onClick={() => {
                if (window.history.length > 1) window.history.back()
                else nav({ to: "/" })
              }}
            />
            <div className={$(
              "flex-1 h-9 rounded-full",
              "bg-[var(--tt-search)]",
              "px-4 flex items-center gap-2",
            )}
            >
              <span className="i-ph:magnifying-glass-duotone text-[16px] color-[var(--tt-subtext)]" />
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    onSubmit()
                  }
                }}
                placeholder="搜你想看"
                className="flex-1 bg-transparent outline-none text-[14px] color-[var(--tt-text)] placeholder:color-[var(--tt-subtext)]"
              />
              {!!input.trim() && (
                <button
                  type="button"
                  className="i-ph:x-circle-fill text-[18px] color-neutral-400/80 active:color-neutral-600"
                  aria-label="Clear"
                  onClick={() => setInput("")}
                />
              )}
            </div>
            <button
              type="button"
              className="text-[15px] font-semibold color-[var(--tt-red)]"
              onClick={onSubmit}
            >
              搜索
            </button>
          </div>
        </div>
      </header>

      <main className="px-[var(--tt-gap)] pt-3 pb-6">
        {!enabled && (
          <>
            {!!history.length && (
              <section className="bg-white rounded-[10px] px-[var(--tt-gap)] py-3">
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-semibold color-[var(--tt-text)]">搜索历史</div>
                  <button
                    type="button"
                    className="text-[13px] color-[var(--tt-subtext)] active:color-neutral-700"
                    onClick={() => {
                      writeHistory([])
                      setHistory([])
                    }}
                  >
                    清空
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {history.map(x => (
                    <button
                      key={x}
                      type="button"
                      className="h-8 px-3 rounded-full bg-[var(--tt-search)] text-[13px] color-[var(--tt-text)] active:bg-neutral-200"
                      onClick={() => commit(x)}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className={$("mt-3", "bg-white rounded-[10px] px-[var(--tt-gap)] py-3")}>
              <div className="text-[15px] font-semibold color-[var(--tt-text)]">热搜</div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                {HOT_WORDS.slice(0, 10).map((w, i) => (
                  <button
                    key={w}
                    type="button"
                    className="flex items-center gap-2 text-left"
                    onClick={() => commit(w)}
                  >
                    <span className={$(
                      "w-5 text-[13px] leading-[16px] font-semibold",
                      i < 3 ? "color-[var(--tt-red)]" : "color-neutral-500",
                    )}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[14px] leading-[18px] color-[var(--tt-text)] line-clamp-1">
                      {w}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <div className="mt-3" />
          </>
        )}

        {enabled && (
          <>
            <div className="mb-3 bg-white rounded-[10px] border border-[var(--tt-border)] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] color-neutral-500 shrink-0">来源</span>
                <select
                  value={sourceFilter}
                  onChange={e => setSourceFilter(e.target.value)}
                  className="h-8 rounded-[10px] bg-[var(--tt-search)] px-2 text-[12px] outline-none flex-1"
                >
                  <option value="">全部来源</option>
                  {sourceOptions.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>

                <span className="text-[12px] color-neutral-500 shrink-0">时间</span>
                <select
                  value={range}
                  onChange={e => setRange(e.target.value)}
                  className="h-8 rounded-[10px] bg-[var(--tt-search)] px-2 text-[12px] outline-none"
                >
                  <option value="all">不限</option>
                  <option value="24h">24小时</option>
                  <option value="7d">7天</option>
                  <option value="30d">30天</option>
                </select>

                {(sourceFilter || range !== "all") && (
                  <button
                    type="button"
                    className="h-8 px-2 rounded-[10px] bg-neutral-100 text-[12px] color-neutral-700 active:bg-neutral-200"
                    onClick={resetFilters}
                  >
                    清空
                  </button>
                )}

                <span className="ml-auto text-[12px] color-neutral-500 shrink-0">
                  {rows.length}
                  条
                </span>
              </div>
            </div>

            {loading && !rows.length && (
              <StatusView title="加载中..." />
            )}

            {!loading && !rows.length && (
              allError
                ? (
                    <StatusView
                      tone="error"
                      title="所有来源加载失败"
                      desc="可稍后重试，或到设置里停用异常来源。"
                      action={(
                        <a
                          href="/settings"
                          className="inline-flex items-center h-9 px-4 rounded-full bg-white border border-red-200 text-[13px] font-semibold"
                        >
                          去设置
                        </a>
                      )}
                    />
                  )
                : (
                    <StatusView
                      title="没有找到相关内容"
                      desc={sourceFilter || range !== "all" ? "可尝试清空筛选条件后再试。" : "可尝试换个关键词再试。"}
                      action={(sourceFilter || range !== "all")
                        ? (
                            <button
                              type="button"
                              className="inline-flex items-center h-9 px-4 rounded-full bg-neutral-100 text-[13px] font-semibold color-[var(--tt-text)] active:bg-neutral-200"
                              onClick={resetFilters}
                            >
                              清空筛选
                            </button>
                          )
                        : undefined}
                    />
                  )
            )}

            {!!rows.length && (
              <ul className="bg-white rounded-[10px] overflow-hidden">
                {rows.slice(0, limit).map((row, idx) => (
                  <div key={`${row.sourceId}:${row.item.id}`}>
                    <FeedCard item={row.item} sourceId={row.sourceId} showDismiss={false} highlightQuery={trimmedQ} />
                    {idx !== Math.min(limit, rows.length) - 1 && <div className="tt-divider mx-[var(--tt-gap)]" />}
                  </div>
                ))}
              </ul>
            )}

            {!!rows.length && limit < rows.length && (
              <div className="py-4 flex justify-center">
                <button
                  type="button"
                  className="h-9 px-5 rounded-full bg-white border border-[var(--tt-border)] text-[14px] color-[var(--tt-text)] active:bg-neutral-100"
                  onClick={() => setLimit(v => v + 30)}
                >
                  加载更多
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

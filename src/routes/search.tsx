import { createFileRoute } from "@tanstack/react-router"
import type { NewsItem, SourceID, SourceResponse } from "@shared/types"
import { useQueries } from "@tanstack/react-query"

import { StatusView } from "~/components/common/status-view"
import { FeedCard } from "~/components/feed/feed-card"
import { apiFetch } from "~/utils/apiFetch"
import { currentColumnIDAtom, currentSourcesAtom } from "~/atoms"
import { safeParseString } from "~/utils"
import { cacheSources, refetchSources } from "~/utils/data"

export const Route = createFileRoute("/search")({
  validateSearch: (search) => {
    const q = typeof search.q === "string" ? search.q : ""
    return { q }
  },
  component: SearchPage,
})

const HISTORY_KEY = "tt-search-history"
const HISTORY_LIMIT = 12

const HOT_WORDS = [
  "美国爆发集会要求ICE撤离",
  "“10万亿之省”再扩容",
  "U23国足决赛首发名单",
  "英国首相要求特朗普道歉",
  "黄景瑜将成太空旅客",
  "出口商品清单看外贸变化",
  "土耳其外长：以寻求攻击伊朗",
  "学者：美退群充斥功利算计",
  "我国有望开发极限密度器件",
  "中方回应特朗普涉华言论",
]

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
  const { q } = Route.useSearch()
  const sourceIds = useAtomValue(currentSourcesAtom)
  useAtomValue(currentColumnIDAtom)

  const [input, setInput] = useState(q)
  const [history, setHistory] = useState<string[]>([])
  const [limit, setLimit] = useState(30)
  const trimmedQ = q.trim()
  const enabled = trimmedQ.length > 0

  useEffect(() => {
    setInput(q)
    setLimit(30)
  }, [q])

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
          const jwt = safeParseString(localStorage.getItem("jwt"))
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
      const items = r.data?.items || []
      items.forEach((item) => {
        const hay = `${item.title} ${item.extra?.hover ?? ""}`.toLowerCase()
        if (!hay.includes(needle)) return
        out.push({ sourceId, item, ts: itemTimestamp(item) })
      })
    })
    out.sort((a, b) => (b.ts || -1) - (a.ts || -1))
    return out
  }, [enabled, results, sourceIds, trimmedQ])

  const loading = enabled && results.some(r => r.isLoading)
  const allError = enabled && results.length > 0 && results.every(r => r.isError)

  const commit = useCallback((raw: string) => {
    const v = raw.trim()
    if (!v) return
    setHistory(pushHistory(v))
    nav({ to: "/search", search: { q: v } })
  }, [nav])

  const onSubmit = useCallback(() => {
    const v = input.trim()
    if (!v) return
    commit(v)
  }, [commit, input])

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
                    <StatusView title="没有找到相关内容" />
                  )
            )}

            {!!rows.length && (
              <ul className="bg-white rounded-[10px] overflow-hidden">
                {rows.slice(0, limit).map((row, idx) => (
                  <div key={`${row.sourceId}:${row.item.id}`}>
                    <FeedCard item={row.item} sourceId={row.sourceId} showDismiss={false} />
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

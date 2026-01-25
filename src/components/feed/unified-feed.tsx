import type { NewsItem, SourceID } from "@shared/types"
import { useQueries } from "@tanstack/react-query"
import { FeedCard } from "~/components/feed/feed-card"

import { currentSourcesAtom, dismissedSetAtom, makeDismissKey } from "~/atoms"
import { useEntireQuery, useUpdateQuery } from "~/hooks/query"
import { cacheSources, refetchSources } from "~/utils/data"
import { safeParseString } from "~/utils"
import { useIsMobile } from "~/hooks/useIsMobile"

interface FeedRow {
  sourceId: SourceID
  item: NewsItem
  ts: number
}

const MAX_SOURCE_STREAK = 2

const ESTIMATED_ROW_HEIGHT = 118
const WINDOW_OVERSCAN = 8
const WINDOW_THRESHOLD = 80

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    u.hash = ""
    return u.toString()
  } catch {
    return raw
  }
}

function dedupeKey(item: NewsItem): string {
  const u = item.mobileUrl || item.url
  if (typeof u === "string" && u) return `url:${normalizeUrl(u)}`
  return `title:${item.title}`
}

const SKELETON_KEYS = [
  "sk-0",
  "sk-1",
  "sk-2",
  "sk-3",
  "sk-4",
  "sk-5",
  "sk-6",
  "sk-7",
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

function FeedItem({ row }: { row: FeedRow }) {
  return (
    <FeedCard
      item={row.item}
      sourceId={row.sourceId}
      showDismiss
    />
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="py-4 flex items-center justify-center gap-2 color-[var(--tt-subtext)]">
      <span className="i-ph:circle-notch text-[18px] animate-spin" />
      <span className="text-[13px]">{label}</span>
    </div>
  )
}

function SkeletonRow() {
  return (
    <li className="bg-white px-[var(--tt-gap)] py-[12px]">
      <div className="h-[22px] w-[92%] bg-neutral-200 rounded animate-pulse" />
      <div className="mt-2 h-[22px] w-[76%] bg-neutral-200 rounded animate-pulse" />
      <div className="mt-2 h-[16px] w-[45%] bg-neutral-100 rounded" />
    </li>
  )
}

export function UnifiedFeed() {
  const sourceIds = useAtomValue(currentSourcesAtom)
  const dismissed = useAtomValue(dismissedSetAtom)
  const update = useUpdateQuery()
  const isMobile = useIsMobile()
  const sourceKey = sourceIds.join("|")

  const [limit, setLimit] = useState(36)
  const [refreshing, setRefreshing] = useState(false)
  const [pullY, setPullY] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollerHeight, setScrollerHeight] = useState(0)
  const pullingRef = useRef(false)
  const startYRef = useRef(0)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const restoredKeyRef = useRef<string>("")
  const saveRafRef = useRef<number | null>(null)

  const scrollKey = useMemo(() => `feed-scroll:${sourceKey}`, [sourceKey])

  useEffect(() => {
    // reset when channel changes
    setLimit(36)
  }, [sourceKey])

  const onScroll = useCallback(() => {
    if (!isMobile) return
    const scroller = scrollerRef.current
    if (!scroller) return
    if (saveRafRef.current) cancelAnimationFrame(saveRafRef.current)
    saveRafRef.current = requestAnimationFrame(() => {
      const top = scroller.scrollTop || 0
      sessionStorage.setItem(scrollKey, String(top))
      setScrollTop(top)
      saveRafRef.current = null
    })
  }, [isMobile, scrollKey])

  useEffect(() => {
    if (!isMobile) return
    const el = scrollerRef.current
    if (!el) return

    const updateSize = () => {
      setScrollerHeight(el.clientHeight || 0)
    }

    updateSize()
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateSize)
      ro.observe(el)
      return () => ro.disconnect()
    } else {
      window.addEventListener("resize", updateSize)
      return () => window.removeEventListener("resize", updateSize)
    }
  }, [isMobile])

  // Batch warmup; also keeps cacheSources up to date.
  useEntireQuery(sourceIds)

  const results = useQueries({
    queries: sourceIds.map(sourceId => ({
      queryKey: ["source", sourceId],
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

        const res = await myFetch(url, { headers }) as { items: NewsItem[], updatedTime: number | string, id: SourceID }
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

  const computedRows = useMemo(() => {
    const queues = new Map<SourceID, FeedRow[]>()
    results.forEach((r, idx) => {
      const sourceId = sourceIds[idx]
      const items = r.data?.items || []
      const rows: FeedRow[] = []
      items.forEach((item) => {
        if (dismissed.has(makeDismissKey(sourceId, item.id))) return
        rows.push({ sourceId, item, ts: itemTimestamp(item) })
      })
      // Newer first. Items without timestamp go to the end.
      rows.sort((a, b) => (b.ts || -1) - (a.ts || -1))
      queues.set(sourceId, rows)
    })

    // Merge sources with:
    // 1) cross-source dedupe by url/title
    // 2) limit consecutive items from same source
    const seen = new Set<string>()
    const merged: FeedRow[] = []
    let lastSource: SourceID | undefined
    let streak = 0

    while (true) {
      const candidates: Array<{ sourceId: SourceID, head: FeedRow }> = []
      for (const [sourceId, q] of queues) {
        const head = q[0]
        if (head) candidates.push({ sourceId, head })
      }
      if (!candidates.length) break

      candidates.sort((a, b) => (b.head.ts || -1) - (a.head.ts || -1))

      const pick = (() => {
        if (lastSource && streak >= MAX_SOURCE_STREAK) {
          const alt = candidates.find(c => c.sourceId !== lastSource)
          return alt || candidates[0]
        }
        return candidates[0]
      })()

      const q = queues.get(pick.sourceId)!
      let row: FeedRow | undefined
      while (q.length) {
        const next = q.shift()!
        const k = dedupeKey(next.item)
        if (seen.has(k)) continue
        seen.add(k)
        row = next
        break
      }

      if (!q.length) queues.delete(pick.sourceId)
      if (!row) continue

      merged.push(row)
      if (row.sourceId === lastSource) {
        streak += 1
      } else {
        lastSource = row.sourceId
        streak = 1
      }
    }

    return merged
  }, [dismissed, results, sourceIds])

  // Keep list order stable while sources are still loading.
  // Otherwise new sources arriving can insert items near the top and cause jarring jumps.
  const [renderRows, setRenderRows] = useState<FeedRow[]>([])

  const loading = results.some(r => r.isLoading)
  const allError = results.length > 0 && results.every(r => r.isError)

  const rows = renderRows

  useEffect(() => {
    // Reset when channel changes.
    setRenderRows([])
  }, [sourceKey])

  useEffect(() => {
    if (!computedRows.length) {
      if (!loading) setRenderRows([])
      return
    }

    setRenderRows((prev) => {
      if (!prev.length) return computedRows

      const nextByKey = new Map(computedRows.map(r => [`${r.sourceId}:${r.item.id}`, r] as const))
      const existing = prev
        .map(r => nextByKey.get(`${r.sourceId}:${r.item.id}`))
        .filter((x): x is FeedRow => Boolean(x))

      const existingKeys = new Set(existing.map(r => `${r.sourceId}:${r.item.id}`))
      const appended = computedRows.filter(r => !existingKeys.has(`${r.sourceId}:${r.item.id}`))

      // Only append new items to keep order stable.
      // Otherwise new sources arriving can insert items near the top and cause jarring jumps.
      return [...existing, ...appended]
    })
  }, [computedRows, loading])

  useEffect(() => {
    if (!sentinelRef.current) return
    const el = sentinelRef.current
    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first?.isIntersecting) {
          setLimit(prev => Math.min(prev + 24, rows.length))
        }
      },
      { root: scrollerRef.current, rootMargin: "600px 0px", threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rows.length])

  useEffect(() => {
    if (!isMobile) return
    const scroller = scrollerRef.current
    if (!scroller) return
    if (restoredKeyRef.current === scrollKey) return

    const saved = sessionStorage.getItem(scrollKey)
    const top = saved ? Number(saved) : 0
    if (Number.isFinite(top) && top > 0) {
      requestAnimationFrame(() => {
        scroller.scrollTop = top
        setScrollTop(top)
      })
    }
    restoredKeyRef.current = scrollKey
  }, [isMobile, rows.length, scrollKey])

  const totalCount = Math.min(limit, rows.length)
  const windowed = isMobile && totalCount > WINDOW_THRESHOLD
  const { start, topPad, bottomPad, windowRows } = useMemo(() => {
    if (!windowed || scrollerHeight <= 0) {
      const start = 0
      const end = totalCount
      return {
        start,
        end,
        topPad: 0,
        bottomPad: 0,
        windowRows: rows.slice(start, end),
      }
    }

    const first = Math.floor(scrollTop / ESTIMATED_ROW_HEIGHT)
    const visible = Math.ceil(scrollerHeight / ESTIMATED_ROW_HEIGHT)
    const start = Math.max(0, first - WINDOW_OVERSCAN)
    const end = Math.min(totalCount, first + visible + WINDOW_OVERSCAN)
    return {
      start,
      topPad: start * ESTIMATED_ROW_HEIGHT,
      bottomPad: (totalCount - end) * ESTIMATED_ROW_HEIGHT,
      windowRows: rows.slice(start, end),
    }
  }, [rows, scrollerHeight, scrollTop, totalCount, windowed])

  const refresh = useCallback(async () => {
    if (refreshing || sourceIds.length === 0) return
    setRefreshing(true)
    try {
      sourceIds.forEach(id => refetchSources.add(id))
      // Force re-run each source query.
      await update(...sourceIds)
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, sourceIds, update])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return
    const scroller = e.currentTarget
    if (scroller.scrollTop !== 0) return
    pullingRef.current = true
    startYRef.current = e.touches[0]?.clientY ?? 0
    setPullY(0)
  }, [isMobile])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return
    if (!pullingRef.current) return
    const scroller = e.currentTarget
    if (scroller.scrollTop !== 0) {
      pullingRef.current = false
      setPullY(0)
      return
    }
    const y = e.touches[0]?.clientY ?? 0
    const dy = y - startYRef.current
    if (dy <= 0) {
      setPullY(0)
      return
    }
    // Prevent browser overscroll while we render a native-like pull.
    e.preventDefault()
    // Dampening for a more native feel.
    setPullY(Math.min(90, Math.round(dy * 0.45)))
  }, [isMobile])

  const onTouchEnd = useCallback(() => {
    if (!isMobile) return
    const shouldRefresh = pullY >= 60
    pullingRef.current = false
    setPullY(0)
    if (shouldRefresh) void refresh()
  }, [isMobile, pullY, refresh])

  return (
    <div className="bg-[var(--tt-bg)]">
      {allError && !loading && (
        <div className="px-3 py-2 text-[12px] color-red-600">所有来源加载失败</div>
      )}

      <div
        ref={scrollerRef}
        className={$(
          isMobile
            ? "h-[calc(100vh-104px)] overflow-y-auto overscroll-y-contain"
            : "min-h-[calc(100vh-120px)]",
        )}
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {isMobile && (
          <div className="sticky top-0 z-10 bg-[var(--tt-bg)]">
            <div
              className={$([
                "h-0 overflow-hidden transition-[height] duration-150",
                pullY > 0 && "h-[52px]",
              ])}
            >
              <div className="h-[52px] flex items-center justify-center gap-2">
                <span
                  className={$(
                    "i-ph:arrow-down text-[16px] color-[var(--tt-subtext)]",
                    pullY >= 60 && "rotate-180",
                    "transition-transform duration-150",
                  )}
                />
                <span className="text-[12px] color-[var(--tt-subtext)]">
                  {refreshing ? "刷新中..." : pullY >= 60 ? "松开刷新" : "下拉刷新"}
                </span>
              </div>
            </div>
          </div>
        )}

        <div
          style={isMobile && pullY ? { transform: `translate3d(0, ${pullY}px, 0)` } : undefined}
          className={$(isMobile && pullY ? "will-change-transform" : undefined)}
        >
          <div>
            {loading && !rows.length && SKELETON_KEYS.map(k => <SkeletonRow key={k} />)}
            {topPad > 0 && (
              <div style={{ height: topPad }} />
            )}
            {windowRows.map((row, idx) => {
              const globalIndex = start + idx
              return (
                <div key={`${row.sourceId}:${row.item.id}`}>
                  <FeedItem row={row} />
                  {globalIndex !== totalCount - 1 && <div className="tt-divider mx-[var(--tt-gap)]" />}
                </div>
              )
            })}
            {bottomPad > 0 && (
              <div style={{ height: bottomPad }} />
            )}
          </div>

          {rows.length > 0 && limit < rows.length && (
            <div ref={sentinelRef}>
              <Spinner label="加载更多..." />
            </div>
          )}

          {rows.length > 0 && limit >= rows.length && (
            <div className="py-4 text-center text-[12px] color-[var(--tt-subtext)]">没有更多了</div>
          )}

          {!loading && rows.length === 0 && (
            <div className="py-10 text-center text-[13px] color-[var(--tt-subtext)]">
              暂无内容
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

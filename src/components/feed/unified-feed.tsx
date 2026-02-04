import type { NewsItem, SourceID, SourceResponse } from "@shared/types"
import { useQueries, useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect, useMemo, useRef, useState } from "react"

import { StatusView } from "~/components/common/status-view"
import { FeedCard } from "~/components/feed/feed-card"
import { apiFetch } from "~/utils/apiFetch"
import { useToast } from "~/hooks/useToast"
import { useScrollContainerEl } from "~/components/common/scroll-container"

import { currentColumnIDAtom, currentSourcesAtom, dismissedSetAtom, makeDismissKey } from "~/atoms"
import { useEntireQuery, useUpdateQuery } from "~/hooks/query"
import { cacheSources, refetchSources } from "~/utils/data"
import { safeParseString } from "~/utils"
import { useIsMobile } from "~/hooks/useIsMobile"

interface FeedRow {
  sourceId: SourceID
  item: NewsItem
  ts: number
}

interface CachedRows {
  updated: number | string
  rows: FeedRow[]
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

function FeedItem({ row, showDismiss }: { row: FeedRow, showDismiss: boolean }) {
  return (
    <FeedCard
      item={row.item}
      sourceId={row.sourceId}
      showDismiss={showDismiss}
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
  const columnId = useAtomValue(currentColumnIDAtom)
  const dismissed = useAtomValue(dismissedSetAtom)
  const update = useUpdateQuery()
  const toast = useToast()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const sourceKey = sourceIds.join("|")

  const [limit, setLimit] = useState(36)
  const [refreshing, setRefreshing] = useState(false)
  const [pullY, setPullY] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollerHeight, setScrollerHeight] = useState(0)
  const pullingRef = useRef(false)
  const startYRef = useRef(0)
  const scroller = useScrollContainerEl()
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const restoredKeyRef = useRef<string>("")
  const restoringRef = useRef(false)
  const navigatingAwayRef = useRef(false)
  const saveRafRef = useRef<number | null>(null)
  const rowCacheRef = useRef(new Map<SourceID, CachedRows>())

  // Persist scroll per column (sources list can change over time).
  const scrollKey = useMemo(() => `feed-scroll:${String(columnId)}`, [columnId])
  const legacyScrollKey = useMemo(() => `feed-scroll:${sourceKey}`, [sourceKey])

  useEffect(() => {
    // reset when channel changes
    setLimit(36)
  }, [sourceKey])

  useEffect(() => {
    const cache = rowCacheRef.current
    const keep = new Set(sourceIds)
    for (const key of cache.keys()) {
      if (!keep.has(key)) cache.delete(key)
    }
  }, [sourceIds])

  const onScroll = useCallback(() => {
    if (!isMobile) return
    if (!scroller) return

    if (saveRafRef.current) cancelAnimationFrame(saveRafRef.current)
    saveRafRef.current = requestAnimationFrame(() => {
      const top = scroller.scrollTop || 0

      // Never persist 0, it can clobber a valid saved position
      // during route transitions.
      if (top <= 0) {
        setScrollTop(0)
        saveRafRef.current = null
        return
      }

      // Avoid clobbering a saved scroll position with an initial 0
      // during route transitions (some browsers can fire a scroll event on mount).
      if (restoringRef.current || navigatingAwayRef.current) {
        saveRafRef.current = null
        return
      }

      sessionStorage.setItem(scrollKey, String(top))
      setScrollTop(top)
      saveRafRef.current = null
    })
  }, [isMobile, scrollKey, scroller])

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!isMobile) return
    if (!scroller) return
    const target = e.target as HTMLElement | null
    const link = target?.closest("a") as HTMLAnchorElement | null
    if (!link) return
    if (!link.getAttribute("href")?.startsWith("/detail")) return
    const top = scroller.scrollTop || 0
    if (top > 0) {
      sessionStorage.setItem(scrollKey, String(top))
    }
    navigatingAwayRef.current = true
  }, [isMobile, scrollKey, scroller])

  useEffect(() => {
    if (!isMobile) return
    const el = scroller
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
  }, [isMobile, scroller])

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

  const computedRows = useMemo(() => {
    const queues = new Map<SourceID, FeedRow[]>()
    const cache = rowCacheRef.current
    results.forEach((r, idx) => {
      const sourceId = sourceIds[idx]
      const data = r.data
      const items = data?.items || []
      const updated = data?.updatedTime ?? 0

      let baseRows = cache.get(sourceId)
      if (!baseRows || baseRows.updated !== updated) {
        const nextRows: FeedRow[] = items.map(item => ({
          sourceId,
          item,
          ts: itemTimestamp(item),
        }))
        // Newer first. Items without timestamp go to the end.
        nextRows.sort((a, b) => (b.ts || -1) - (a.ts || -1))
        baseRows = { updated, rows: nextRows }
        cache.set(sourceId, baseRows)
      }

      const rows = baseRows.rows.filter(row => !dismissed.has(makeDismissKey(sourceId, row.item.id)))
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
  const noSources = sourceIds.length === 0

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
    if (!scroller) return
    const el = sentinelRef.current
    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first?.isIntersecting) {
          setLimit(prev => Math.min(prev + 24, rows.length))
        }
      },
      { root: scroller, rootMargin: "600px 0px", threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rows.length, scroller])

  useEffect(() => {
    if (!isMobile) return
    if (!scroller) return
    if (restoredKeyRef.current === scrollKey) return

    const saved = sessionStorage.getItem(scrollKey)
      || sessionStorage.getItem(legacyScrollKey)
    const top = saved ? Number(saved) : 0
    if (Number.isFinite(top) && top > 0) {
      restoringRef.current = true
      requestAnimationFrame(() => {
        scroller.scrollTop = top
        setScrollTop(top)
        restoredKeyRef.current = scrollKey
        restoringRef.current = false
      })
      return
    }
    restoredKeyRef.current = scrollKey
  }, [isMobile, legacyScrollKey, rows.length, scrollKey, scroller])

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

      const counts = {
        success: 0,
        cache: 0,
        fail: 0,
      }
      for (const id of sourceIds) {
        const state: any = queryClient.getQueryState(["source", id])
        if (state?.status === "error") {
          counts.fail += 1
          continue
        }
        const data = queryClient.getQueryData<SourceResponse>(["source", id])
        if (data?.status === "success") counts.success += 1
        else if (data?.status === "cache") counts.cache += 1
      }
      toast(`刷新完成：成功 ${counts.success} · 缓存 ${counts.cache} · 失败 ${counts.fail}`)
    } finally {
      setRefreshing(false)
    }
  }, [queryClient, refreshing, sourceIds, toast, update])

  useEffect(() => {
    const onForceRefresh = () => {
      void refresh()
    }
    window.addEventListener("tt-refresh", onForceRefresh)
    return () => {
      window.removeEventListener("tt-refresh", onForceRefresh)
    }
  }, [refresh])

  useEffect(() => {
    if (!isMobile) return
    if (!scroller) return

    scroller.addEventListener("scroll", onScroll, { passive: true })

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return
      if (scroller.scrollTop !== 0) return
      pullingRef.current = true
      startYRef.current = e.touches[0]?.clientY ?? 0
      setPullY(0)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current) return
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
      e.preventDefault()
      setPullY(Math.min(90, Math.round(dy * 0.45)))
    }

    const onTouchEnd = () => {
      const shouldRefresh = pullY >= 60
      pullingRef.current = false
      setPullY(0)
      if (shouldRefresh) void refresh()
    }

    scroller.addEventListener("touchstart", onTouchStart, { passive: true })
    scroller.addEventListener("touchmove", onTouchMove, { passive: false })
    scroller.addEventListener("touchend", onTouchEnd, { passive: true })
    scroller.addEventListener("touchcancel", onTouchEnd, { passive: true })
    return () => {
      scroller.removeEventListener("scroll", onScroll)
      scroller.removeEventListener("touchstart", onTouchStart)
      scroller.removeEventListener("touchmove", onTouchMove)
      scroller.removeEventListener("touchend", onTouchEnd)
      scroller.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [isMobile, onScroll, pullY, refresh, refreshing, scroller])

  return (
    <div className="bg-[var(--tt-bg)]" onClickCapture={onClickCapture}>
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
                <FeedItem row={row} showDismiss={!isMobile} />
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
                  title={noSources ? "该频道暂无启用来源" : "暂无内容"}
                  desc={noSources ? "请到设置启用来源后再试。" : undefined}
                  action={noSources
                    ? (
                        <a
                          href="/settings"
                          className="inline-flex items-center h-9 px-4 rounded-full bg-neutral-100 text-[13px] font-semibold color-[var(--tt-text)] active:bg-neutral-200"
                        >
                          去设置
                        </a>
                      )
                    : undefined}
                />
              )
        )}
      </div>
    </div>
  )
}

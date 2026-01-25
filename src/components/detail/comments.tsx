import type { ForwardedRef } from "react"
import { forwardRef, useEffect, useMemo, useState } from "react"
import { useToast } from "~/hooks/useToast"

export interface DetailComment {
  id: string
  author: string
  content: string
  time?: string
  likes?: number
}

function initialFromName(name: string) {
  const s = name.trim()
  if (!s) return ""
  return s.slice(0, 1).toUpperCase()
}

function CommentSkeleton() {
  return (
    <div className="flex gap-3 py-3">
      <div className="h-9 w-9 rounded-full bg-neutral-200 animate-pulse shrink-0" />
      <div className="flex-1">
        <div className="h-[14px] w-24 bg-neutral-200 rounded animate-pulse" />
        <div className="mt-2 h-[18px] w-[92%] bg-neutral-200 rounded animate-pulse" />
        <div className="mt-2 h-[18px] w-[78%] bg-neutral-100 rounded" />
      </div>
    </div>
  )
}

function CommentRow({ c }: { c: DetailComment }) {
  return (
    <div className="flex gap-3 py-3">
      <div
        className="h-9 w-9 rounded-full bg-[var(--tt-search)] color-neutral-800/80 text-[14px] font-semibold flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        {initialFromName(c.author) || "评"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] leading-[18px] color-[var(--tt-text)] font-medium truncate">{c.author}</span>
          {!!c.time && <span className="text-[12px] leading-[16px] color-[var(--tt-subtext)] shrink-0">{c.time}</span>}
          <div className="flex-1" />
          <button
            type="button"
            className="flex items-center gap-1 text-[12px] leading-[16px] color-neutral-800/60 active:color-neutral-800/80"
            aria-label="点赞"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <span className="i-ph:thumbs-up text-[16px]" />
            <span>{c.likes ?? 0}</span>
          </button>
        </div>
        <div className="mt-1 text-[16px] leading-[24px] color-[var(--tt-text)] break-words">
          {c.content}
        </div>
      </div>
    </div>
  )
}

export const DetailComments = forwardRef((
  {
    url,
  }: {
    url: string
  },
  ref: ForwardedRef<HTMLDivElement>,
) => {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<DetailComment[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!url) return
    setLoading(true)
    myFetch(`/api/comments?url=${encodeURIComponent(url)}`)
      .then((res: any) => {
        if (cancelled) return
        const xs = Array.isArray(res?.comments) ? res.comments : []
        setComments(xs)
        setTotal(typeof res?.total === "number" ? res.total : xs.length)
      })
      .catch(() => {
        if (!cancelled) setTotal(0)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  const skeletonKeys = useMemo(() => ["csk-0", "csk-1", "csk-2"], [])

  return (
    <section ref={ref} className="mt-5">
      <div className="flex items-center justify-between">
        <div className="text-[16px] leading-[20px] font-semibold color-[var(--tt-text)]">
          <span>评论</span>
          <span className="ml-1">
            {total}
          </span>
        </div>
        <button
          type="button"
          className="text-[13px] color-[var(--tt-subtext)] active:color-neutral-700"
          onClick={() => toast("评论功能待接入")}
        >
          查看全部
        </button>
      </div>

      <button
        type="button"
        className={$([
          "mt-3 w-full",
          "h-9 rounded-full",
          "bg-[var(--tt-search)]",
          "px-4 text-left",
          "text-[14px] color-[var(--tt-subtext)]",
          "active:bg-neutral-200 transition-colors",
        ])}
        onClick={() => toast("评论功能待接入")}
      >
        写评论...
      </button>

      <div className="mt-2">
        {loading && !comments.length && (
          <div className="divide-y divide-[var(--tt-border)]">
            {skeletonKeys.map(k => <CommentSkeleton key={k} />)}
          </div>
        )}

        {!loading && !comments.length && (
          <div className="py-8 text-center text-[13px] color-[var(--tt-subtext)]">
            暂无评论
          </div>
        )}

        {!!comments.length && (
          <div className="divide-y divide-[var(--tt-border)]">
            {comments.slice(0, 3).map(c => (
              <CommentRow key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
})

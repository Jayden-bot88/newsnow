import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import type { NewsItem, SourceID } from "@shared/types"
import { useToast } from "~/hooks/useToast"
import { cacheSources } from "~/utils/data"
import { ArticleBody } from "~/components/detail/article-body"
import { FeedCard } from "~/components/feed/feed-card"
import { goToTopAtom } from "~/atoms"
import { useIsMobile } from "~/hooks/useIsMobile"
import { DetailComments } from "~/components/detail/comments"
import { ImageViewer } from "~/components/detail/image-viewer"
import { getVideoFromApi, getVideoFromDetailUrl, isVideoDetailUrl } from "~/utils/video"

export const Route = createFileRoute("/detail")({
  component: DetailPage,
  validateSearch: (search) => {
    const url = typeof search.url === "string" ? search.url : ""
    const title = typeof search.title === "string" ? search.title : ""
    const source = typeof search.source === "string" ? search.source : ""
    const timeRaw = typeof search.time === "string" ? search.time : ""
    const time = timeRaw.replace(/^"|"$/g, "")
    const sid = typeof search.sid === "string" ? (search.sid as SourceID) : undefined
    const iid = typeof search.iid === "string" ? search.iid : undefined
    return { url, title, source, time, sid, iid }
  },
})

function extractImages(item?: NewsItem): string[] {
  const xs = Array.isArray(item?.extra?.images) ? item!.extra!.images! : []
  const filtered = xs.filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x))
  return Array.from(new Set(filtered)).slice(0, 3)
}

function DetailPage() {
  const { url, title, source, time, sid, iid } = Route.useSearch()
  const nav = Route.useNavigate()
  const timeForRelative = /^\d{10,13}$/.test(time) ? Number(time) : time
  const relative = useRelativeTime(timeForRelative || "")
  const toast = useToast()
  const isMobile = useIsMobile()
  const { ok: canGoToTop, fn: goToTop } = useAtomValue(goToTopAtom)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const commentsRef = useRef<HTMLDivElement | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)

  const [contentLoading, setContentLoading] = useState(false)
  const [contentText, setContentText] = useState<string>("")
  const [contentDesc, setContentDesc] = useState<string>("")
  const [contentImages, setContentImages] = useState<string[]>([])
  const [contentVideo, setContentVideo] = useState<{ kind: "iframe" | "video", src: string } | undefined>(undefined)
  const [slowFallback, setSlowFallback] = useState(false)

  const item = useMemo(() => {
    if (!sid || !iid) return undefined
    const items = cacheSources.get(sid)?.items
    if (!items?.length) return undefined
    return items.find(x => String(x.id) === iid)
  }, [sid, iid])

  const images = useMemo(() => extractImages(item), [item])
  const detailImages = useMemo(
    () => {
      const raw = (contentImages.length ? contentImages : images)
        .filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x))
      return Array.from(new Set(raw))
    },
    [contentImages, images],
  )
  const summary = item?.extra?.hover || ""

  const video = useMemo(
    () => contentVideo || (url ? getVideoFromDetailUrl(url) : undefined),
    [contentVideo, url],
  )

  useEffect(() => {
    let cancelled = false
    if (!url) return

    // On weak networks, never block the UI on a long-running extraction.
    setSlowFallback(false)
    // Use a small safety margin so the UI reliably flips within the 3s SLA.
    const slowTimer = setTimeout(() => {
      if (!cancelled) setSlowFallback(true)
    }, 2500)

    setContentLoading(true)
    myFetch(`/api/detail?url=${encodeURIComponent(url)}`)
      .then((res: any) => {
        if (cancelled) return
        setContentText(typeof res?.text === "string" ? res.text : "")
        setContentDesc(typeof res?.desc === "string" ? res.desc : "")
        setContentImages(Array.isArray(res?.images) ? res.images : [])
        setContentVideo(getVideoFromApi(res))
      })
      .catch(() => {
        // Best-effort only.
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false)
      })
    return () => {
      cancelled = true
      clearTimeout(slowTimer)
    }
  }, [url])

  const canExpand = contentText.length > 900
  const isVideoDetail = !!video || (url ? isVideoDetailUrl(url) : false)
  const videoIntro = contentDesc || summary

  return (
    <div className="min-h-[100vh] bg-white flex flex-col">
      <div className={$([
        "sticky top-0 z-10",
        "bg-white/95 backdrop-blur-md",
        "border-b border-[var(--tt-border)]",
        "h-12 px-3",
        "flex items-center gap-2",
      ])}
      >
        <button
          type="button"
          className="i-ph:caret-left-duotone text-2xl color-neutral-800"
          onClick={() => nav({ to: "/" })}
          aria-label="Back"
        />
        <button
          type="button"
          className="text-lg font-extrabold color-primary"
          onClick={() => nav({ to: "/" })}
          aria-label="Home"
        >
          头条
        </button>
        <div className="flex-1" />
        {url && (
          <a
            className="text-sm color-primary font-semibold"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            原文
          </a>
        )}
      </div>

      {!url && (
        <div className="p-4 text-sm color-neutral-600">
          缺少链接参数。
        </div>
      )}

      {!!title && (
        <div className="px-[var(--tt-gap)] pt-3">
          <h1 className="text-[26px] leading-[34px] font-extrabold color-[var(--tt-text)]">
            {title}
          </h1>
          <div className="mt-2 text-[13px] color-[var(--tt-subtext)] flex items-center gap-1">
            {source && (
              <>
                <span className="font-medium color-[var(--tt-text)] op-85">{source}</span>
                <button
                  type="button"
                  className="ml-1 h-6 px-2 rounded-full border border-[var(--tt-red)] color-[var(--tt-red)] text-[12px] leading-[14px] font-semibold"
                  onClick={() => toast("已关注")}
                >
                  关注
                </button>
              </>
            )}
            {source && (relative || time) && <span className="op-60">·</span>}
            {(relative || time) && <span>{relative || time}</span>}
          </div>
        </div>
      )}

      <div className="flex-1 pb-20">
        <span data-testid="video-kind" className="hidden">{video?.kind || ""}</span>

        {video?.kind === "iframe" && (
          <div className="px-[var(--tt-gap)] mt-3">
            <div
              className="relative w-full rounded-[10px] overflow-hidden bg-black"
              style={{ paddingTop: "56.25%" }}
            >
              <iframe
                title="video"
                src={video.src}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                // Bilibili player reads cookies; without allow-same-origin the sandboxed iframe becomes an opaque origin.
                // eslint-disable-next-line react-dom/no-unsafe-iframe-sandbox
                sandbox="allow-same-origin allow-scripts allow-presentation"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        )}

        {video?.kind === "video" && (
          <div className="px-[var(--tt-gap)] mt-3">
            <video
              className="w-full rounded-[10px] bg-black"
              src={video.src}
              controls
              playsInline
              preload="metadata"
            />
          </div>
        )}

        {isVideoDetail && !video && (
          <div className="px-[var(--tt-gap)] mt-3">
            <div className="w-full rounded-[10px] border border-[var(--tt-border)] bg-[var(--tt-search)] p-4">
              <div className="flex items-center gap-2 text-[14px] font-semibold color-[var(--tt-text)]">
                <span className="i-ph:play-circle text-[18px] color-primary" />
                该平台暂不支持站内播放
              </div>
              <div className="mt-1 text-[13px] color-[var(--tt-subtext)]">
                请点击右上角“原文”观看。
              </div>
            </div>
          </div>
        )}

        {!!detailImages.length && !isVideoDetail && (
          <div className="px-[var(--tt-gap)] mt-3">
            {detailImages.length >= 3
              ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {detailImages.slice(0, 3).map((src, idx) => (
                      <button
                        key={src}
                        type="button"
                        className="p-0 m-0 border-0 bg-transparent"
                        onClick={() => {
                          setViewerIndex(idx)
                          setViewerOpen(true)
                        }}
                        aria-label="查看图片"
                      >
                        <img
                          src={src}
                          alt=""
                          className="w-full h-[86px] rounded-[6px] bg-[#f2f3f5] object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    ))}
                  </div>
                )
              : (
                  <button
                    type="button"
                    className="block w-full p-0 m-0 border-0 bg-transparent"
                    onClick={() => {
                      setViewerIndex(0)
                      setViewerOpen(true)
                    }}
                    aria-label="查看图片"
                  >
                    <img
                      src={detailImages[0]}
                      alt=""
                      className="w-full h-[190px] rounded-[10px] bg-[#f2f3f5] object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                )}
          </div>
        )}

        <div className="px-[var(--tt-gap)] mt-3">
          {contentLoading && !contentText && !slowFallback && (
            <div className="space-y-2">
              <div className="h-[18px] w-[92%] bg-neutral-200 rounded animate-pulse" />
              <div className="h-[18px] w-[86%] bg-neutral-200 rounded animate-pulse" />
              <div className="h-[18px] w-[78%] bg-neutral-200 rounded animate-pulse" />
              <div className="h-[18px] w-[90%] bg-neutral-100 rounded" />
            </div>
          )}

          {contentLoading && !contentText && slowFallback && (
            <div className="text-[13px] color-neutral-500">
              加载较慢，可点击右上角“原文”直接阅读。
            </div>
          )}

          {!!contentText && !isVideoDetail && (
            <div className="relative">
              <ArticleBody text={contentText} expanded={expanded} />
              {!expanded && canExpand && (
                <div
                  className="pointer-events-none absolute left-0 right-0 bottom-0 h-16"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 75%)",
                  }}
                />
              )}
            </div>
          )}

          {!!contentText && !isVideoDetail && canExpand && (
            <button
              type="button"
              className="mt-3 text-[14px] color-primary font-semibold"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? "收起" : "展开全文"}
            </button>
          )}

          {isVideoDetail && !!videoIntro && (
            <div className="mt-3 text-[13px] leading-[20px] color-[var(--tt-subtext)] whitespace-pre-wrap">
              {videoIntro}
            </div>
          )}

          {isVideoDetail && !videoIntro && (!contentLoading || slowFallback) && (
            <div className="mt-3 text-[13px] color-neutral-500">
              暂无视频简介，可点击右上角“原文”查看。
            </div>
          )}

          {!isVideoDetail && !contentText && !!summary && (!contentLoading || slowFallback) && (
            <div className="text-[18px] leading-[30px] color-[var(--tt-text)]">
              {summary}
            </div>
          )}

          {!isVideoDetail && !contentText && !summary && (!contentLoading || slowFallback) && (
            <div className="text-[13px] color-neutral-500">
              暂不支持正文展示，请点击右上角“原文”。
            </div>
          )}

          {url && <DetailComments ref={commentsRef} url={url} />}
        </div>

        {sid && iid && (
          <div className="px-[var(--tt-gap)] mt-5">
            <div className="text-[14px] font-extrabold color-neutral-900">相关推荐</div>
            <ul className="mt-2 divide-y divide-[var(--tt-border)] bg-white rounded-[10px] overflow-hidden">
              {(cacheSources.get(sid)?.items || [])
                .filter(x => String(x.id) !== iid)
                .slice(0, 6)
                .map(x => (
                  <FeedCard
                    key={String(x.id)}
                    item={x}
                    sourceId={sid}
                    compact
                    showDismiss={false}
                  />
                ))}
            </ul>
          </div>
        )}
      </div>

      <ImageViewer
        open={viewerOpen}
        images={detailImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />

      {isMobile && (
        <button
          type="button"
          aria-label="回到顶部"
          className={$([
            "fixed z-20 right-[var(--tt-gap)]",
            "h-10 w-10 rounded-full",
            "bg-white/96 backdrop-blur-md",
            "border border-[var(--tt-border)]",
            "shadow-sm",
            "flex items-center justify-center",
            "transition-all duration-200",
            canGoToTop ? "op-100 translate-y-0" : "op-0 translate-y-2 pointer-events-none",
          ])}
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
          }}
          onClick={goToTop}
        >
          <span className="i-ph:arrow-up text-[18px] color-neutral-800/80" />
        </button>
      )}

      {/* Toutiao-like bottom action bar */}
      <div className={$([
        "sticky bottom-0 z-10",
        "bg-white/98 backdrop-blur-md",
        "border-t border-[var(--tt-border)]",
      ])}
      >
        <div className="px-[var(--tt-gap)] py-2 flex items-center gap-2">
          <button
            type="button"
            className={$([
              "flex-1 h-9 rounded-full",
              "bg-[var(--tt-search)]",
              "px-4 text-left",
              "text-[14px] color-[var(--tt-subtext)]",
              "active:bg-neutral-200 transition-colors",
            ])}
            onClick={() => {
              const el = commentsRef.current
              if (el) {
                el.scrollIntoView({ block: "start", behavior: "smooth" })
              } else {
                toast("评论功能待接入")
              }
            }}
          >
            写评论...
          </button>

          <button
            type="button"
            className={$([
              liked ? "i-ph:thumbs-up-fill" : "i-ph:thumbs-up",
              "text-[22px]",
              liked ? "color-primary" : "color-neutral-800/80",
              "btn",
            ])}
            aria-label="Like"
            onClick={() => setLiked(v => !v)}
          />
          <button
            type="button"
            className={$([
              saved ? "i-ph:star-fill" : "i-ph:star",
              "text-[22px]",
              saved ? "color-primary" : "color-neutral-800/80",
              "btn",
            ])}
            aria-label="Save"
            onClick={() => setSaved(v => !v)}
          />
          <button
            type="button"
            className={$([
              "i-ph:share-network",
              "text-[22px] color-neutral-800/80",
              "btn",
            ])}
            aria-label="Share"
            onClick={async () => {
              try {
                if (url && "share" in navigator) {
                  await (navigator as any).share({ title: title || "", url })
                } else if (url && navigator.clipboard) {
                  await navigator.clipboard.writeText(url)
                  toast("链接已复制")
                } else {
                  toast("分享不可用")
                }
              } catch {
                toast("分享已取消")
              }
            }}
          />
        </div>

        <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
    </div>
  )
}

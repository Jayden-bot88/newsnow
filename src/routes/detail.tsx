import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SourceID } from "@shared/types"
import { formatDetailError } from "@shared/detail-error"
import { upgradeImageUrl } from "@shared/image-url"
import { useAtom, useAtomValue } from "jotai"
import $ from "clsx"
import { useToast } from "~/hooks/useToast"
import { useRelativeTime } from "~/hooks/useRelativeTime"
import { cacheSources } from "~/utils/data"
import { ArticleBody } from "~/components/detail/article-body"
import type { DetailBlock } from "~/components/detail/article-blocks"
import { ArticleBlocks } from "~/components/detail/article-blocks"
import { FeedCard } from "~/components/feed/feed-card"
import { focusSourcesAtom, goToTopAtom } from "~/atoms"
import { useIsMobile } from "~/hooks/useIsMobile"
import { useScrollContainerEl } from "~/components/common/scroll-container"
import { DetailComments } from "~/components/detail/comments"
import { ImageViewer } from "~/components/detail/image-viewer"
import { SmartImage } from "~/components/common/smart-image"
import { StatusView } from "~/components/common/status-view"
import { getVideoFromApi, getVideoFromDetailUrl, isVideoDetailUrl } from "~/utils/video"
import { apiFetch } from "~/utils/apiFetch"
import { getDetailToken } from "~/utils/detailToken"

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

function parseDetailBlocks(raw: unknown): DetailBlock[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: DetailBlock[] = []
  for (const v of arr) {
    if (!v || typeof v !== "object") continue
    const obj = v as Record<string, unknown>
    const type = obj.type
    if (typeof type !== "string") continue

    if (type === "img") {
      const src = obj.src
      if (typeof src === "string" && /^https?:\/\//.test(src)) {
        out.push({ type: "img", src, alt: typeof obj.alt === "string" ? obj.alt : undefined })
      }
      continue
    }

    if (type === "ul") {
      const rawItems = Array.isArray(obj.items) ? obj.items : []
      const items = rawItems.filter((x): x is string => typeof x === "string")
      if (items.length) out.push({ type: "ul", items })
      continue
    }

    const text = obj.text
    if (typeof text !== "string" || !text.trim()) continue
    if (type === "h2") out.push({ type: "h2", text })
    else if (type === "quote") out.push({ type: "quote", text })
    else if (type === "caption") out.push({ type: "caption", text })
    else out.push({ type: "p", text })
  }
  return out
}

function DetailPage() {
  const { url, title, source, time, sid, iid } = Route.useSearch()
  const nav = Route.useNavigate()
  const scroller = useScrollContainerEl()
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

  const [focusSources, setFocusSources] = useAtom(focusSourcesAtom)
  const isFocused = !!sid && focusSources.includes(sid)

  const goBack = useCallback(() => {
    if (typeof window === "undefined") {
      nav({ to: "/" })
      return
    }
    // Prefer history back so the feed scroll position is preserved.
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    nav({ to: "/" })
  }, [nav])

  const [contentLoading, setContentLoading] = useState(false)
  const [contentText, setContentText] = useState<string>("")
  const [contentDesc, setContentDesc] = useState<string>("")
  const [contentImages, setContentImages] = useState<string[]>([])
  const [contentBlocks, setContentBlocks] = useState<DetailBlock[]>([])
  const [contentVideo, setContentVideo] = useState<{ kind: "iframe" | "video", src: string } | undefined>(undefined)
  const [slowFallback, setSlowFallback] = useState(false)
  const [contentError, setContentError] = useState<string>("")
  const [reloadKey, setReloadKey] = useState(0)

  const cacheKey = useMemo(() => (url ? `tt-detail:${url}` : ""), [url])

  const item = useMemo(() => {
    if (!sid || !iid) return undefined
    const items = cacheSources.get(sid)?.items
    if (!items?.length) return undefined
    return items.find(x => String(x.id) === iid)
  }, [sid, iid])

  const inlineImages = useMemo(
    () => {
      const out: string[] = []
      for (const b of contentBlocks) {
        if (b.type !== "img") continue
        if (typeof b.src === "string" && /^https?:\/\//.test(b.src)) out.push(b.src)
      }
      return Array.from(new Set(out))
    },
    [contentBlocks],
  )

  const normalizeCoverImages = useCallback((imgs: unknown) => {
    const raw = Array.isArray(imgs) ? imgs : []
    const out: string[] = []
    const seen = new Set<string>()
    for (const x of raw) {
      if (typeof x !== "string" || !/^https?:\/\//.test(x)) continue
      if (seen.has(x)) continue
      seen.add(x)
      out.push(upgradeImageUrl(x))
      if (out.length >= 3) break
    }
    return out
  }, [])

  const [coverImages, setCoverImages] = useState<string[]>([])
  const coverFetchedRef = useRef(false)
  const detailImages = useMemo(
    () => {
      // Policy A: only use images returned by /api/detail (or inline img blocks).
      // Do not fall back to feed item images, as they can be inferred/guessed and become false positives.
      const raw = (inlineImages.length ? inlineImages : contentImages)
        .filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x))
      return Array.from(new Set(raw))
    },
    [contentImages, inlineImages],
  )

  const viewerImages = detailImages.length ? detailImages : coverImages
  const summary = item?.extra?.hover || ""

  const video = useMemo(
    () => contentVideo || (url ? getVideoFromDetailUrl(url) : undefined),
    [contentVideo, url],
  )

  useEffect(() => {
    // With a global scroll container, ensure detail always opens at top.
    if (scroller) scroller.scrollTop = 0
  }, [scroller, url])

  useEffect(() => {
    let cancelled = false
    if (!url) return

    setContentError("")

    // Use cached content (best-effort) to improve perceived performance.
    if (cacheKey) {
      try {
        const raw = sessionStorage.getItem(cacheKey)
        if (raw) {
          const parsed = JSON.parse(raw) as unknown
          if (parsed && typeof parsed === "object") {
            const p = parsed as {
              text?: unknown
              desc?: unknown
              images?: unknown
              blocks?: unknown
              video?: unknown
            }
            const t = typeof p.text === "string" ? p.text : ""
            const d = typeof p.desc === "string" ? p.desc : ""
            const imgs = Array.isArray(p.images) ? p.images : []
            const safeImgs = imgs.filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x))

            const safeBlocks = parseDetailBlocks(p.blocks)

            if (t && !contentText) setContentText(t)
            if (d && !contentDesc) setContentDesc(d)
            if (safeImgs.length && contentImages.length === 0) setContentImages(safeImgs)
            if (safeBlocks.length && contentBlocks.length === 0) setContentBlocks(safeBlocks)
          }
        }
      } catch {
        // ignore
      }
    }

    // On weak networks, never block the UI on a long-running extraction.
    setSlowFallback(false)
    // Use a small safety margin so the UI reliably flips within the 3s SLA.
    const slowTimer = setTimeout(() => {
      if (!cancelled) setSlowFallback(true)
    }, 2500)

    setContentLoading(true)
    Promise.resolve()
      .then(async () => {
        const token = await getDetailToken()
        return await apiFetch(`/api/detail?url=${encodeURIComponent(url)}`, {
          headers: token ? { "X-Detail-Token": token } : undefined,
        })
      })
      .then((res: any) => {
        if (cancelled) return
        const nextText = typeof res?.text === "string" ? res.text : ""
        const nextDesc = typeof res?.desc === "string" ? res.desc : ""
        const nextImages = Array.isArray(res?.images) ? res.images : []
        const nextBlocks = parseDetailBlocks(res?.blocks)
        const nextVideo = getVideoFromApi(res)
        setContentText(nextText)
        setContentDesc(nextDesc)
        setContentImages(nextImages)
        setContentBlocks(nextBlocks)
        setContentVideo(nextVideo)

        if (cacheKey) {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              text: nextText,
              desc: nextDesc,
              images: nextImages,
              blocks: nextBlocks,
              video: nextVideo,
            }))
          } catch {
            // ignore
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const offline = typeof navigator !== "undefined" && "onLine" in navigator && navigator.onLine === false
        if (offline) {
          setContentError("网络不可用")
          return
        }
        setContentError(formatDetailError(err))
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false)
      })
    return () => {
      cancelled = true
      clearTimeout(slowTimer)
    }
  }, [cacheKey, contentBlocks.length, contentDesc, contentImages.length, contentText, reloadKey, url])

  const canExpand = contentText.length > 900
  const isVideoDetail = !!video || (url ? isVideoDetailUrl(url) : false)
  const videoIntro = contentDesc || summary

  useEffect(() => {
    const next = normalizeCoverImages(item?.extra?.images)
    if (next.length) {
      setCoverImages(next)
    }
  }, [item, normalizeCoverImages])

  useEffect(() => {
    if (coverFetchedRef.current) return
    if (coverImages.length) return
    if (!sid || !iid) return

    coverFetchedRef.current = true
    const cleanIid = iid.replace(/^"|"$/g, "")

    void apiFetch(`/s?id=${sid}`)
      .then((data) => {
        const items = Array.isArray((data as any)?.items) ? (data as any).items : []
        const hit = items.find((x: any) => String(x?.id) === cleanIid)
        const imgs = normalizeCoverImages(hit?.extra?.images)
        if (imgs.length) setCoverImages(imgs)
      })
      .catch(() => {
        // ignore
      })
  }, [coverImages.length, iid, normalizeCoverImages, sid])

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
          onClick={goBack}
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
                  onClick={() => {
                    if (!sid) return
                    setFocusSources((prev) => {
                      return prev.includes(sid)
                        ? prev.filter(x => x !== sid)
                        : [sid, ...prev]
                    })
                    toast(isFocused ? "已取消关注" : "已关注")
                  }}
                >
                  {isFocused ? "已关注" : "关注"}
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

        {!!detailImages.length && !isVideoDetail && inlineImages.length === 0 && (
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
                        <SmartImage
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
                    <SmartImage
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

        {!detailImages.length && !isVideoDetail && coverImages.length > 0 && (
          <div className="px-[var(--tt-gap)] mt-3">
            <div className="mb-2 text-[12px] color-neutral-400">封面图（来自列表）</div>
            {coverImages.length >= 3
              ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {coverImages.slice(0, 3).map((src, idx) => (
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
                        <SmartImage
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
                    <SmartImage
                      src={coverImages[0]}
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

          {!contentLoading && !contentText && !isVideoDetail && contentError && (
            <StatusView
              tone="error"
              title="正文加载失败"
              desc={contentError}
              action={(
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-9 px-4 rounded-full bg-neutral-100 text-[13px] font-semibold color-[var(--tt-text)] active:bg-neutral-200"
                    onClick={() => setReloadKey(x => x + 1)}
                  >
                    重试
                  </button>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-4 rounded-full bg-white border border-[var(--tt-border)] text-[13px] font-semibold color-[var(--tt-text)] active:bg-neutral-100 inline-flex items-center"
                    >
                      打开原文
                    </a>
                  )}
                </div>
              )}
            />
          )}

          {!contentLoading && !contentText && !isVideoDetail && !contentError && !!contentDesc && (
            <StatusView
              tone="warning"
              title="暂无正文"
              desc={contentDesc}
              action={url
                ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center h-9 px-4 rounded-full bg-neutral-100 text-[13px] font-semibold color-[var(--tt-text)] active:bg-neutral-200"
                    >
                      打开原文
                    </a>
                  )
                : undefined}
            />
          )}

          {!!contentText && !isVideoDetail && (
            <div className="relative">
              {contentBlocks.length
                ? (
                    <ArticleBlocks
                      blocks={contentBlocks}
                      expanded={expanded}
                      onImage={(src) => {
                        const idx = detailImages.indexOf(src)
                        setViewerIndex(Math.max(0, idx))
                        setViewerOpen(true)
                      }}
                    />
                  )
                : (
                    <ArticleBody text={contentText} expanded={expanded} />
                  )}
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

          {isVideoDetail && !videoIntro && !contentLoading && contentError && (
            <StatusView
              tone="warning"
              title="视频信息加载失败"
              desc={contentError}
              action={url
                ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center h-9 px-4 rounded-full bg-neutral-100 text-[13px] font-semibold color-[var(--tt-text)] active:bg-neutral-200"
                    >
                      打开原文
                    </a>
                  )
                : undefined}
            />
          )}

          {isVideoDetail && !videoIntro && !contentError && (!contentLoading || slowFallback) && (
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
        images={viewerImages}
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

import type { NewsItem, SourceID } from "@shared/types"
import { sources } from "@shared/sources"
import { Link } from "@tanstack/react-router"
import { Fragment, memo, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { dismissItemAtom, makeDismissKey } from "~/atoms"
import { isVideoDetailUrl } from "~/utils/video"
import { SafeImage } from "~/components/common/safe-image"

type ImageLayout = "none" | "right" | "three"

type MixedLayout = ImageLayout | "left" | "large"

function normalizeTime(raw: unknown): string {
  if (raw === undefined || raw === null) return ""
  if (typeof raw === "string") return raw.replace(/^"|"$/g, "")
  return String(raw)
}

function extractImages(item: NewsItem): string[] {
  const imgs = Array.isArray(item.extra?.images) ? item.extra!.images! : []
  const seen = new Set<string>()
  return imgs
    .filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x))
    .filter((x) => {
      // Some sources provide the same image in multiple variants (e.g. resized via query).
      // Dedupe by a best-effort "base" key to avoid showing repeated thumbs.
      const key = (() => {
        try {
          const u = new URL(x)
          const q = u.search
          if (u.searchParams.has("x-oss-process") || /imageMogr2/i.test(q)) {
            return `${u.origin}${u.pathname}`
          }
          return x
        } catch {
          return x
        }
      })()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 3)
}

const ICON_AS_THUMB_SOURCES = new Set<SourceID>([])

function extractThumb(item: NewsItem, sourceId: SourceID, images: string[]): string | undefined {
  if (images.length) return images[0]

  // Some sources historically store cover in extra.icon.
  if (!ICON_AS_THUMB_SOURCES.has(sourceId)) return
  const icon = item.extra?.icon
  const url = typeof icon === "string"
    ? icon
    : (icon && typeof icon === "object" ? icon.url : undefined)
  if (url && /^https?:\/\//.test(url)) return url
}

function stableHash(s: string): number {
  // Simple deterministic hash for stable layout mixing.
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickMixedLayout({
  sourceId,
  itemId,
  imagesCount,
  hasThumb,
}: {
  sourceId: SourceID
  itemId: string
  imagesCount: number
  hasThumb: boolean
}): MixedLayout {
  // Multi-image content: show below-title grid.
  if (imagesCount >= 2) return "three"

  if (!hasThumb) return "none"

  // Single-image content: emulate Toutiao-like variety.
  // Keep deterministic so layout doesn't jump between refreshes.
  const mod = stableHash(`${sourceId}:${itemId}`) % 10

  // ~60% right, ~20% left, ~10% large, ~10% no-image
  if (mod <= 5) return "right"
  if (mod <= 7) return "left"
  if (mod === 8) return "large"
  return "none"
}

function FeedCardInner({
  item,
  sourceId,
  compact = false,
  showDismiss = true,
}: {
  item: NewsItem
  sourceId: SourceID
  compact?: boolean
  showDismiss?: boolean
}) {
  const dismiss = useSetAtom(dismissItemAtom)
  const toast = useToast()
  // On mobile we hide the inline "x" to avoid accidental dismisses.
  // Expose it via an overflow menu instead (per acceptance requirements).
  const showOverflowMenu = !showDismiss
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDownCapture = (e: PointerEvent) => {
      const el = menuRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      setMenuOpen(false)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false)
    }

    document.addEventListener("pointerdown", onPointerDownCapture, true)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDownCapture, true)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [menuOpen])

  const sourceName = sources[sourceId]?.name || ""
  const url = item.mobileUrl || item.url
  const time = normalizeTime(item.pubDate || item.extra?.date)
  const timeForRelative = /^\d{10,13}$/.test(time) ? Number(time) : time
  const relative = useRelativeTime(timeForRelative || "")
  const images = extractImages(item)
  const thumb = extractThumb(item, sourceId, images)
  const layout = pickMixedLayout({
    sourceId,
    itemId: String(item.id),
    imagesCount: images.length,
    hasThumb: Boolean(thumb),
  })
  const isVideo = typeof url === "string" && url ? isVideoDetailUrl(url) : false

  const metaNodes: Array<{ key: string, node: ReactNode }> = []
  if (relative) {
    metaNodes.push(
      { key: "time", node: <span className="shrink-0">{relative}</span> },
    )
  }
  if (item.extra?.info) {
    metaNodes.push(
      { key: "info", node: <span className="truncate max-w-[55%]">{item.extra.info}</span> },
    )
  }
  if (typeof item.extra?.diff === "number" && item.extra.diff) {
    const diff = item.extra.diff
    metaNodes.push(
      {
        key: "diff",
        node: (
          <span
            className={$(
              "shrink-0",
              diff < 0 ? "text-green-600" : "text-red-600",
            )}
          >
            {diff > 0 ? `+${diff}` : diff}
          </span>
        ),
      },
    )
  }

  return (
    <li className="bg-[var(--tt-card)]">
      <Link
        to="/detail"
        search={{
          url,
          title: item.title,
          source: sourceName,
          time,
          sid: sourceId,
          iid: String(item.id),
        }}
        className={$(
          "block",
          "px-[var(--tt-gap)]",
          compact ? "py-[10px]" : "py-[12px]",
          "active:bg-neutral-100 transition-colors",
        )}
      >
        <div className={$(layout === "right" || layout === "left" ? "flex gap-3" : "block")}>
          {layout === "left" && thumb && (
            <SafeImage
              src={thumb}
              alt=""
              className={$(
                compact
                  ? (isVideo ? "w-[112px] h-[74px]" : "w-[96px] h-[64px]")
                  : (isVideo ? "w-[132px] h-[86px]" : "w-[120px] h-[80px]"),
                "rounded-[8px] bg-[var(--tt-search)] object-cover shrink-0",
              )}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className={$([
              "color-[var(--tt-text)] font-semibold",
              compact
                ? "text-[15px] leading-[22px]"
                : "text-[length:var(--tt-title-size)] leading-[length:var(--tt-title-line)]",
              "line-clamp-2",
            ])}
            >
              {item.title}
            </div>

            {layout === "three" && (thumb || images.length) && !compact && (
              <div
                className={$([
                  "mt-2 grid gap-1.5",
                  images.length >= 3 ? "grid-cols-3" : images.length === 2 ? "grid-cols-2" : "grid-cols-1",
                ])}
              >
                {(images.length ? images : [thumb!]).slice(0, 3).map(src => (
                  <SafeImage
                    key={src}
                    src={src}
                    alt=""
                    className={$(
                      "w-full rounded-[8px] bg-[var(--tt-search)] object-cover",
                      isVideo ? "h-[86px]" : "h-[80px]",
                    )}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
            )}

            {layout === "large" && thumb && !compact && (
              <SafeImage
                src={thumb}
                alt=""
                className="mt-2 w-full h-[190px] rounded-[10px] bg-[var(--tt-search)] object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            )}

            <div className={$(
              compact ? "mt-1" : "mt-[6px]",
              "flex items-center gap-2",
            )}
            >
              <div className={$(
                "flex-1 min-w-0 flex items-center",
                "text-[length:var(--tt-meta-size)] leading-[length:var(--tt-meta-line)]",
                "color-[var(--tt-subtext)]",
              )}
              >
                <span className="truncate max-w-[40%]">{sourceName}</span>
                {metaNodes.map(({ key, node }) => (
                  <Fragment key={key}>
                    <span className="mx-1 op-70">·</span>
                    {node}
                  </Fragment>
                ))}
              </div>

              {showDismiss && (
                <button
                  type="button"
                  className="i-ph:x text-[16px] color-neutral-400/80 active:color-neutral-700"
                  aria-label="不感兴趣"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    dismiss(makeDismissKey(sourceId, item.id))
                    toast("将减少此类内容")
                  }}
                />
              )}

              {showOverflowMenu && (
                <span ref={menuRef} className="relative">
                  <button
                    type="button"
                    className="i-ph:dots-three-vertical-bold text-[16px] color-neutral-500/80 active:color-neutral-700"
                    aria-label="更多操作"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setMenuOpen(v => !v)
                    }}
                  />

                  {menuOpen && (
                    <div
                      className={$([
                        "absolute right-0 top-[calc(100%+6px)] z-50",
                        "min-w-[132px]",
                        "rounded-[12px]",
                        "bg-[var(--tt-card)]",
                        "border border-[var(--tt-border)]",
                        "shadow-lg",
                        "overflow-hidden",
                      ])}
                      role="menu"
                      aria-label="卡片操作菜单"
                    >
                      <button
                        type="button"
                        className={$([
                          "w-full px-3 py-2",
                          "flex items-center gap-2",
                          "text-[13px] color-[var(--tt-text)]",
                          "active:bg-neutral-100",
                        ])}
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          dismiss(makeDismissKey(sourceId, item.id))
                          toast("将减少此类内容")
                          setMenuOpen(false)
                        }}
                      >
                        <span className="i-ph:x text-[14px] color-neutral-500/90" />
                        <span>不感兴趣</span>
                      </button>
                      <button
                        type="button"
                        className={$([
                          "w-full px-3 py-2",
                          "flex items-center gap-2",
                          "text-[13px] color-[var(--tt-subtext)]",
                          "active:bg-neutral-100",
                        ])}
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setMenuOpen(false)
                        }}
                      >
                        <span className="i-ph:x text-[14px] opacity-0" aria-hidden="true" />
                        <span>取消</span>
                      </button>
                    </div>
                  )}
                </span>
              )}
            </div>
          </div>

          {layout === "right" && thumb && (
            <SafeImage
              src={thumb}
              alt=""
              className={$(
                compact
                  ? (isVideo ? "w-[112px] h-[74px]" : "w-[96px] h-[64px]")
                  : (isVideo ? "w-[132px] h-[86px]" : "w-[120px] h-[80px]"),
                "rounded-[8px] bg-[var(--tt-search)] object-cover shrink-0",
              )}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </Link>
    </li>
  )
}

export const FeedCard = memo(FeedCardInner)

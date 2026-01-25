import type { NewsItem, SourceID } from "@shared/types"
import { sources } from "@shared/sources"
import { Link } from "@tanstack/react-router"
import { memo } from "react"
import { dismissItemAtom, makeDismissKey } from "~/atoms"
import { isVideoDetailUrl } from "~/utils/video"

type ImageLayout = "none" | "right" | "three"

function normalizeTime(raw: unknown): string {
  if (raw === undefined || raw === null) return ""
  if (typeof raw === "string") return raw.replace(/^"|"$/g, "")
  return String(raw)
}

function extractImages(item: NewsItem): string[] {
  const imgs = Array.isArray(item.extra?.images) ? item.extra!.images! : []
  return imgs
    .filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x))
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .slice(0, 3)
}

function extractThumb(item: NewsItem): string | undefined {
  const imgs = extractImages(item)
  if (imgs.length) return imgs[0]

  const icon = item.extra?.icon
  const url = typeof icon === "string"
    ? icon
    : (icon && typeof icon === "object" ? icon.url : undefined)
  if (url && /^https?:\/\//.test(url)) return url
  return undefined
}

function pickImageLayout(title: string, imagesCount: number, thumb?: string): ImageLayout {
  if (imagesCount >= 3) return "three"
  if (!thumb) return "none"
  if (title.length <= 16) return "three"
  return "right"
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
  const sourceName = sources[sourceId]?.name || ""
  const url = item.mobileUrl || item.url
  const time = normalizeTime(item.pubDate || item.extra?.date)
  const timeForRelative = /^\d{10,13}$/.test(time) ? Number(time) : time
  const relative = useRelativeTime(timeForRelative || "")
  const images = extractImages(item)
  const thumb = extractThumb(item)
  const layout = pickImageLayout(item.title, images.length, thumb)
  const isVideo = typeof url === "string" && url ? isVideoDetailUrl(url) : false

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
        <div className={$(layout === "right" ? "flex gap-3" : "block")}>
          <div className="flex-1 min-w-0">
            <div className={$([
              "color-[var(--tt-text)] font-medium",
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
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className={$(
                      "w-full rounded-[6px] bg-[var(--tt-search)] object-cover",
                      isVideo ? "h-[86px]" : "h-[74px]",
                    )}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = "none"
                    }}
                  />
                ))}
              </div>
            )}

            <div className={$(
              "mt-2 flex items-center gap-2",
              compact && "mt-1",
            )}
            >
              <div className={$(
                "flex-1 min-w-0 flex items-center gap-1",
                "text-[length:var(--tt-meta-size)] leading-[length:var(--tt-meta-line)]",
                "color-[var(--tt-subtext)]",
              )}
              >
                <span className="truncate max-w-[45%]">{sourceName}</span>
                {relative && (
                  <>
                    <span className="op-70">·</span>
                    <span className="shrink-0">{relative}</span>
                  </>
                )}
                {!!item.extra?.info && (
                  <>
                    <span className="op-70">·</span>
                    <span className="truncate max-w-[45%]">{item.extra.info}</span>
                  </>
                )}
              </div>

              {showDismiss && (
                <button
                  type="button"
                  className="i-ph:x text-[18px] color-neutral-500/60 active:color-neutral-700"
                  aria-label="不感兴趣"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    dismiss(makeDismissKey(sourceId, item.id))
                    toast("将减少此类内容")
                  }}
                />
              )}
            </div>
          </div>

          {layout === "right" && thumb && (
            <img
              src={thumb}
              alt=""
              className={$(
                compact
                  ? (isVideo ? "w-[104px] h-[70px]" : "w-[90px] h-[60px]")
                  : (isVideo ? "w-[132px] h-[86px]" : "w-[112px] h-[74px]"),
                "rounded-[6px] bg-[var(--tt-search)] object-cover shrink-0",
              )}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          )}
        </div>
      </Link>
    </li>
  )
}

export const FeedCard = memo(FeedCardInner)

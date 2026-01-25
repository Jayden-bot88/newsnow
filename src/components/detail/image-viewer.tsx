import { useCallback, useEffect, useMemo, useRef, useState } from "react"

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function ImageViewer({
  open,
  images,
  initialIndex,
  onClose,
}: {
  open: boolean
  images: string[]
  initialIndex: number
  onClose: () => void
}) {
  const safeImages = useMemo(
    () => Array.from(new Set(images.filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x)))),
    [images],
  )
  const [active, setActive] = useState(0)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.documentElement.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = scrollerRef.current
    if (!el) return

    const next = clamp(initialIndex, 0, Math.max(0, safeImages.length - 1))
    setActive(next)
    requestAnimationFrame(() => {
      el.scrollTo({
        left: next * el.clientWidth,
        behavior: "instant" as any,
      })
    })
  }, [initialIndex, open, safeImages.length])

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const w = el.clientWidth || 1
    const idx = Math.round(el.scrollLeft / w)
    setActive(clamp(idx, 0, Math.max(0, safeImages.length - 1)))
  }, [safeImages.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, open])

  if (!open || safeImages.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="absolute left-0 right-0 top-0 z-10"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="h-12 px-3 flex items-center">
          <button
            type="button"
            className="h-9 w-9 -ml-1 rounded-full flex items-center justify-center active:bg-white/10"
            aria-label="关闭"
            onClick={onClose}
          >
            <span className="i-ph:x text-[22px] color-white" />
          </button>
          <div className="flex-1 text-center">
            <span className="text-[13px] color-white/80">
              {`${active + 1}/${safeImages.length}`}
            </span>
          </div>
          <div className="w-9" />
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="h-full w-full overflow-x-auto overflow-y-hidden flex snap-x snap-mandatory overscroll-contain"
        onScroll={onScroll}
        style={{
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {safeImages.map(src => (
          <div
            key={src}
            className="w-full h-full shrink-0 snap-center flex items-center justify-center"
            style={{
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            }}
          >
            <img
              src={src}
              alt=""
              className="max-w-full max-h-full object-contain"
              referrerPolicy="no-referrer"
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

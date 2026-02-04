import type { HTMLProps, PropsWithChildren } from "react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { defu } from "defu"
import { useSetAtom } from "jotai"
import { useMount } from "react-use"
import $ from "clsx"
import { useOverlayScrollbars } from "./useOverlayScrollbars"
import type { UseOverlayScrollbarsParams } from "./useOverlayScrollbars"
import { goToTopAtom } from "~/atoms"
import "./style.css"

type Props = HTMLProps<HTMLDivElement> & UseOverlayScrollbarsParams
const defaultScrollbarParams: UseOverlayScrollbarsParams = {
  options: {
    scrollbars: {
      autoHide: "scroll",
    },
  },
  defer: true,
}

export function OverlayScrollbar({ disabled, children, options, events, defer, className, ...props }: PropsWithChildren<Props>) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollbarParams = useMemo(() => defu<UseOverlayScrollbarsParams, Array<UseOverlayScrollbarsParams> >({
    options,
    events,
    defer,
  }, defaultScrollbarParams), [options, events, defer])

  const [initialize, instance] = useOverlayScrollbars(scrollbarParams)

  useMount(() => {
    if (!disabled) {
      initialize({
        target: ref.current!,
        cancel: {
          // 如果浏览器原生滚动条是覆盖在元素上的，则取消初始化
          nativeScrollbarsOverlaid: true,
        },
      })
    }
  })

  useEffect(() => {
    if (ref.current) {
      if (instance && instance?.state().destroyed) {
        ref.current.classList.remove("scrollbar-hidden")
      } else {
        ref.current.classList.add("scrollbar-hidden")
      }
    }
  }, [instance])

  return (
    <div ref={ref} {...props} className={$("overflow-auto scrollbar-hidden", className)}>
      {/* 只能有一个 element */}
      <div>{children}</div>
    </div>
  )
}

export function GlobalOverlayScrollbar({ children, className, ...props }: PropsWithChildren<HTMLProps<HTMLDivElement>>) {
  const ref = useRef<HTMLDivElement>(null)
  const lastTrigger = useRef(0)
  const timer = useRef<any>(null)
  const scrollBarTimerRef = useRef<number | null>(null)
  const setGoToTop = useSetAtom(goToTopAtom)
  const onScroll = useCallback((e: Event) => {
    const el = ref.current
    if (el) {
      // Keep native scrollbar hidden unless actively scrolling.
      el.classList.add("tt-scrolling")
      if (scrollBarTimerRef.current) window.clearTimeout(scrollBarTimerRef.current)
      scrollBarTimerRef.current = window.setTimeout(() => {
        el.classList.remove("tt-scrolling")
        scrollBarTimerRef.current = null
      }, 700)
    }

    const now = Date.now()
    if (now - lastTrigger.current > 50) {
      lastTrigger.current = now
      clearTimeout(timer.current)
      timer.current = setTimeout(
        () => {
          const el = e.target as HTMLElement
          setGoToTop({
            ok: el.scrollTop > 100,
            el,
            fn: () => el.scrollTo({ top: 0, behavior: "smooth" }),
          })
        },
        500,
      )
    }
  }, [setGoToTop])
  useMount(() => {
    const el = ref.current
    if (!el) return

    el.addEventListener("scroll", onScroll)
    return () => {
      el.removeEventListener("scroll", onScroll)
      if (scrollBarTimerRef.current) window.clearTimeout(scrollBarTimerRef.current)
    }
  })

  return (
    <div ref={ref} {...props} className={$("overflow-auto tt-scrollbar", className)}>
      <div>{children}</div>
    </div>
  )
}

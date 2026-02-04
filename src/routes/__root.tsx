import "~/styles/globals.css"
import "virtual:uno.css"
import { Link, Outlet, createRootRouteWithContext, useRouterState } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useSetAtom } from "jotai"
import { ErrorBoundary } from "~/components/common/error-boundary"
import { Toast } from "~/components/common/toast"
import { SearchBar } from "~/components/common/search-bar"
import { NavBar } from "~/components/navbar"
import { useToast } from "~/hooks/useToast"
import { goToTopAtom } from "~/atoms"
import { ScrollContainerContext } from "~/components/common/scroll-container"
import { useOverlayScrollbars } from "~/components/common/overlay-scrollbar/useOverlayScrollbars"
import { usePWA } from "~/hooks/usePWA"
import { useSync } from "~/hooks/useSync"

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
})

function NotFoundComponent() {
  const nav = Route.useNavigate()
  useEffect(() => {
    nav({ to: "/" })
  }, [nav])
  return (
    <div className="min-h-[50vh] flex items-center justify-center px-4">
      <div className="text-[13px] color-[var(--tt-subtext)]">页面不存在，正在返回首页…</div>
    </div>
  )
}

function RootComponent() {
  useOnReload()
  useSync()
  usePWA()

  const toast = useToast()

  // Reset UI error boundary on navigation.
  const resetKey = useRouterState({ select: s => s.location.href })

  useEffect(() => {
    const onOffline = () => toast("网络已断开", { type: "warning" })
    const onOnline = () => toast("网络已恢复", { type: "success" })
    window.addEventListener("offline", onOffline)
    window.addEventListener("online", onOnline)
    return () => {
      window.removeEventListener("offline", onOffline)
      window.removeEventListener("online", onOnline)
    }
  }, [toast])

  useEffect(() => {
    let timer: number | null = null

    const onAnyScroll = () => {
      document.body.classList.add("tt-scrolling")
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        document.body.classList.remove("tt-scrolling")
        timer = null
      }, 700)
    }

    // Capture scroll events from scroll containers (not just window).
    document.addEventListener("scroll", onAnyScroll, { passive: true, capture: true })
    return () => {
      document.removeEventListener("scroll", onAnyScroll, true)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  const nav = Route.useNavigate()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const setGoToTop = useSetAtom(goToTopAtom)
  const [initialize, instance] = useOverlayScrollbars({
    options: {
      scrollbars: {
        autoHide: "scroll",
      },
    },
    events: {
      scroll: (_, e) => {
        const el = e.target as HTMLElement
        setGoToTop({
          ok: el.scrollTop > 100,
          el,
          fn: () => el.scrollTo({ top: 0, behavior: "smooth" }),
        })
      },
    },
    defer: false,
  })

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    initialize({
      target: el,
    })
  }, [initialize])

  useEffect(() => {
    const host = scrollerRef.current
    if (!host) return

    const viewport = instance?.elements().viewport
    const next = viewport || host
    setScrollEl(next)

    // Ensure tests and code target the actual scroll element.
    // Ensure tests and code target the actual scroll element.
    host.removeAttribute("data-testid")
    next.setAttribute("data-testid", "feed-scroller")

    // Initialize goToTop target even before the first scroll.
    setGoToTop({
      ok: false,
      el: next,
      fn: () => next.scrollTo({ top: 0, behavior: "smooth" }),
    })
  }, [instance, setGoToTop])

  return (
    <ErrorBoundary resetKey={resetKey}>
      <ScrollContainerContext.Provider value={scrollEl}>
        <div className={$([
          "h-full",
          "w-full max-w-[560px] mx-auto",
          "flex flex-col",
        ])}
        >
          <header className={$([
            "shrink-0",
            "bg-white",
            "border-b border-[var(--tt-border)]",
          ])}
          >
            <div className="px-[var(--tt-gap)] pt-[calc(env(safe-area-inset-top,0px)+4px)]">
              <div className="flex items-center gap-3 h-11">
                <button
                  type="button"
                  className="text-[20px] leading-[24px] font-extrabold color-[var(--tt-red)]"
                  onClick={() => scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                  aria-label="NewsNow"
                >
                  头条
                </button>
                <button
                  type="button"
                  className={$([
                    "flex-1 h-9 rounded-full",
                    "bg-[var(--tt-search)] text-neutral-500",
                    "px-4 flex items-center gap-2",
                    "active:bg-neutral-200 transition-colors",
                  ])}
                  onClick={() => nav({ to: "/search", search: { q: "" } })}
                >
                  <span className="i-ph:magnifying-glass-duotone text-[16px] color-[var(--tt-subtext)]" />
                  <span className="text-[14px] color-[var(--tt-subtext)]">搜你想看</span>
                </button>
                <Link
                  to="/settings"
                  className="i-ph:gear-six-duotone text-[22px] color-neutral-700/75 btn"
                  title="Settings"
                  aria-label="Settings"
                />
              </div>
              <div className="mt-1 pb-1">
                <NavBar />
              </div>
            </div>
          </header>

          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto overscroll-y-contain scrollbar-hidden"
          >
            <main className={$([
              "min-h-[calc(100vh-180px)]",
              "md:(min-h-[calc(100vh-175px)])",
              "lg:(min-h-[calc(100vh-194px)])",
            ])}
            >
              <Outlet />
            </main>
          </div>
        </div>

        <Toast />
        <SearchBar />
        {import.meta.env.DEV && (
          <>
            <ReactQueryDevtools buttonPosition="bottom-left" />
            <TanStackRouterDevtools position="bottom-right" />
          </>
        )}
      </ScrollContainerContext.Provider>
    </ErrorBoundary>
  )
}

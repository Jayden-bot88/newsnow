import "~/styles/globals.css"
import "virtual:uno.css"
import { Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { fixedColumnIds } from "@shared/metadata"
import { useIsMobile } from "~/hooks/useIsMobile"
import { Header } from "~/components/header"
import { GlobalOverlayScrollbar } from "~/components/common/overlay-scrollbar"
import { Footer } from "~/components/footer"
import { Toast } from "~/components/common/toast"
import { SearchBar } from "~/components/common/search-bar"
import { NavBar } from "~/components/navbar"
import { currentColumnIDAtom } from "~/atoms"

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
})

function NotFoundComponent() {
  const nav = Route.useNavigate()
  nav({
    to: "/",
  })
}

function RootComponent() {
  useOnReload()
  useSync()
  usePWA()
  const nav = Route.useNavigate()
  const isMobile = useIsMobile()
  const currentId = useAtomValue(currentColumnIDAtom)
  const manageId = fixedColumnIds.includes(currentId as any) ? (currentId as any) : "hottest"
  return (
    <>
      <GlobalOverlayScrollbar
        className={$([
          !isMobile && "px-4",
          "h-full overflow-x-auto",
          "md:(px-10)",
          "lg:(px-24)",
        ])}
      >
        <header className={$([
          "sticky top-0 z-10",
          "bg-white",
          "border-b border-[var(--tt-border)]",
        ])}
        >
          {!isMobile && (
            <div
              className={$([
                "grid items-center py-4 px-5",
                "lg:(py-6)",
              ])}
              style={{
                gridTemplateColumns: "50px auto 50px",
              }}
            >
              <Header />
            </div>
          )}

          {isMobile && (
            <div className="px-3 pt-[calc(env(safe-area-inset-top,0px)+4px)]">
              <div className="flex items-center gap-3 h-11">
                <button
                  type="button"
                  className="text-[20px] leading-[24px] font-extrabold color-[var(--tt-red)]"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
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
                  to="/manage/$column"
                  params={{ column: manageId }}
                  className="i-ph:dots-three-vertical-duotone text-[22px] color-neutral-700/75 btn"
                  title="Manage"
                  aria-label="Manage"
                />
              </div>
              <div className="mt-1 pb-1">
                <NavBar />
              </div>
            </div>
          )}
        </header>
        <main className={$([
          !isMobile && "mt-2",
          "min-h-[calc(100vh-180px)]",
          "md:(min-h-[calc(100vh-175px)])",
          "lg:(min-h-[calc(100vh-194px)])",
        ])}
        >
          <Outlet />
        </main>
        {!isMobile && (
          <footer className="py-6 flex flex-col items-center justify-center text-sm text-neutral-500 font-mono">
            <Footer />
          </footer>
        )}
      </GlobalOverlayScrollbar>
      <Toast />
      <SearchBar />
      {import.meta.env.DEV && !isMobile && (
        <>
          <ReactQueryDevtools buttonPosition="bottom-left" />
          <TanStackRouterDevtools position="bottom-right" />
        </>
      )}
    </>
  )
}

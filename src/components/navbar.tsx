import type { ColumnID } from "@shared/types"
import { fixedColumnIds, metadata } from "@shared/metadata"
import { Link, useNavigate } from "@tanstack/react-router"
import { useIsMobile } from "~/hooks/useIsMobile"
import { currentColumnIDAtom } from "~/atoms"

export function NavBar() {
  const currentId = useAtomValue(currentColumnIDAtom)
  const { toggle } = useSearchBar()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const manageId = fixedColumnIds.includes(currentId as any) ? (currentId as any) : "hottest"
  const navRef = useRef<HTMLElement | null>(null)
  const tabClass = (active: boolean) => $(
    "px-[10px] pt-2 pb-3 text-[15px] leading-[20px] whitespace-nowrap relative",
    active
      ? [
          "color-[var(--tt-red)] font-semibold",
          "after:(content-[''] absolute left-1/2 bottom-0.5 w-5 h-0.5 bg-[var(--tt-red)] -translate-x-1/2 rounded-full)",
        ]
      : "color-neutral-800 op-70",
  )

  const mobileTabs: ColumnID[] = [
    "focus",
    "hottest",
    "china",
    "tech",
    "finance",
    "world",
    "realtime",
  ].filter(k => Object.prototype.hasOwnProperty.call(metadata, k)) as ColumnID[]

  const desktopTabs = fixedColumnIds

  const tabs = (isMobile ? mobileTabs : desktopTabs) as readonly ColumnID[]

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!isMobile) return
    const nav = navRef.current
    if (!nav) return
    const target = e.target as HTMLElement | null
    const link = target?.closest("a") as HTMLAnchorElement | null
    if (!link) return

    const navRect = nav.getBoundingClientRect()
    const linkRect = link.getBoundingClientRect()
    const delta = (linkRect.left - navRect.left) - (navRect.width / 2 - linkRect.width / 2)
    nav.scrollBy({ left: delta, behavior: "smooth" })
  }, [isMobile])

  return (
    <nav
      ref={navRef}
      className={$(
        isMobile
          ? "relative flex items-end gap-1 overflow-x-auto no-scrollbar"
          : [
              "flex p-3 rounded-2xl bg-primary/1 text-sm",
              "shadow shadow-primary/20 hover:shadow-primary/50 transition-shadow-500",
            ],
      )}
      aria-label="Channels"
      onClickCapture={onClickCapture}
    >
      {tabs.map(columnId => (
        <Link
          key={columnId}
          to={columnId === "hottest" ? "/" : "/c/$column"}
          params={columnId === "hottest" ? undefined : { column: columnId }}
          className={isMobile
            ? tabClass(currentId === columnId)
            : $(
                "px-2 hover:(bg-primary/10 rounded-md) cursor-pointer transition-all",
                currentId === columnId ? "color-primary font-bold" : "op-70 dark:op-90",
              )}
        >
          {isMobile && columnId === "hottest" ? "推荐" : metadata[columnId].name}
        </Link>
      ))}

      {isMobile && (
        <span
          className="pointer-events-none absolute right-9 top-0 bottom-0 w-8"
          style={{
            background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, var(--tt-card) 80%)",
          }}
        />
      )}

      {isMobile && (
        <span className="sticky right-0 flex items-end bg-[var(--tt-card)] pl-1">
          <button
            type="button"
            onClick={() => navigate({ to: "/manage/$column", params: { column: manageId } })}
            className={$([
              "h-8 w-8 rounded-full bg-[var(--tt-search)]",
              "flex items-center justify-center",
              "active:bg-neutral-200 transition-colors",
            ])}
            aria-label="更多"
          >
            <span className="i-ph:dots-three-outline-vertical-fill text-[18px] color-neutral-800/80" />
          </button>
        </span>
      )}
      {!isMobile && (
        <button
          type="button"
          onClick={() => toggle(true)}
          className={$(
            "px-2 hover:(bg-primary/10 rounded-md) op-70 dark:op-90",
            "cursor-pointer transition-all",
          )}
        >
          更多
        </button>
      )}
    </nav>
  )
}

import type { ColumnID } from "@shared/types"
import { metadata } from "@shared/metadata"
import { Link } from "@tanstack/react-router"
import { useIsMobile } from "~/hooks/useIsMobile"
import { currentColumnIDAtom, enabledColumnsAtom } from "~/atoms"

export function NavBar() {
  const currentId = useAtomValue(currentColumnIDAtom)
  const isMobile = useIsMobile()
  const enabledColumns = useAtomValue(enabledColumnsAtom)
  const navRef = useRef<HTMLElement | null>(null)
  const tabClass = (active: boolean) => $(
    "px-2 pt-2 pb-[10px] text-[14px] leading-[20px] whitespace-nowrap relative",
    active
      ? [
          "color-[var(--tt-red)] font-semibold",
          "after:(content-[''] absolute left-1/2 bottom-1 w-4 h-0.5 bg-[var(--tt-red)] -translate-x-1/2 rounded-full)",
        ]
      : "color-neutral-800 op-70",
  )

  const mobileTabs = useMemo(() => {
    const seen = new Set<ColumnID>()
    const list = enabledColumns
      .filter(k => Object.prototype.hasOwnProperty.call(metadata, k))
      .filter((k) => {
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    if (!list.includes("hottest")) list.unshift("hottest")
    return list
  }, [enabledColumns])

  const tabs = mobileTabs as readonly ColumnID[]

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
          <Link
            to="/channels"
            className={$([
              "h-8 w-8 rounded-full bg-[var(--tt-search)]",
              "flex items-center justify-center",
              "active:bg-neutral-200 transition-colors",
            ])}
            aria-label="频道管理"
          >
            <span className="i-ph:dots-three-outline-vertical-fill text-[18px] color-neutral-800/80" />
          </Link>
        </span>
      )}

    </nav>
  )
}

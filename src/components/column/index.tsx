import type { ColumnID } from "@shared/types"
import { useTitle } from "react-use"
import { Dnd } from "./dnd"
import { currentColumnIDAtom } from "~/atoms"
import { useIsMobile } from "~/hooks/useIsMobile"
import { UnifiedFeed } from "~/components/feed/unified-feed"

export function Column({ id, variant }: { id: ColumnID, variant?: "feed" | "manage" }) {
  const [currentColumnID, setCurrentColumnID] = useAtom(currentColumnIDAtom)
  const isMobile = useIsMobile()
  useEffect(() => {
    setCurrentColumnID(id)
  }, [id, setCurrentColumnID])

  useTitle(`NewsNow | ${metadata[id].name}`)

  if (id !== currentColumnID) return null

  // Mobile: Toutiao-style unified feed.
  if (variant !== "manage" && isMobile) return <UnifiedFeed />

  // Desktop (and mobile manage page): legacy source cards + drag reorder.
  // Only fixed columns support drag reorder.
  if (fixedColumnIds.includes(id as any)) return <Dnd />
  return <UnifiedFeed />
}

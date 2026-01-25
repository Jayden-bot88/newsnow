import type { ColumnID, FixedColumnID, SourceID } from "@shared/types"
import type { Update } from "./types"

export const focusSourcesAtom = atom((get) => {
  return get(primitiveMetadataAtom).data.focus
}, (get, set, update: Update<SourceID[]>) => {
  const _ = update instanceof Function ? update(get(focusSourcesAtom)) : update
  set(primitiveMetadataAtom, {
    updatedTime: Date.now(),
    action: "manual",
    data: {
      ...get(primitiveMetadataAtom).data,
      focus: _,
    },
  })
})

export const currentColumnIDAtom = atom<ColumnID>("hottest")

export const currentSourcesAtom = atom((get) => {
  const id = get(currentColumnIDAtom)
  if (fixedColumnIds.includes(id as any)) {
    return get(primitiveMetadataAtom).data[id as FixedColumnID]
  }
  return metadata[id as keyof typeof metadata].sources
}, (get, set, update: Update<SourceID[]>) => {
  const id = get(currentColumnIDAtom)
  // Only fixed columns are user-configurable.
  if (!fixedColumnIds.includes(id as any)) return

  const _ = update instanceof Function ? update(get(currentSourcesAtom)) : update
  set(primitiveMetadataAtom, {
    updatedTime: Date.now(),
    action: "manual",
    data: {
      ...get(primitiveMetadataAtom).data,
      [id as FixedColumnID]: _,
    },
  })
})

export const goToTopAtom = atom({
  ok: false,
  el: undefined as HTMLElement | undefined,
  fn: undefined as (() => void) | undefined,
})

const dismissedItemsAtom = atomWithStorage<string[]>("tt-dismissed-items", [])

export function makeDismissKey(sourceId: SourceID, itemId: string | number) {
  return `${sourceId}:${String(itemId)}`
}

export const dismissedSetAtom = atom((get) => {
  return new Set(get(dismissedItemsAtom))
})

export const dismissItemAtom = atom(null, (get, set, key: string) => {
  const prev = get(dismissedItemsAtom)
  if (prev.includes(key)) return
  // Cap growth to avoid unbounded localStorage.
  const next = [key, ...prev].slice(0, 3000)
  set(dismissedItemsAtom, next)
})

export const clearDismissedAtom = atom(null, (_get, set) => {
  set(dismissedItemsAtom, [])
})

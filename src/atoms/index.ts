import type { ColumnID, FixedColumnID, SourceID } from "@shared/types"
import { fixedColumnIds, metadata } from "@shared/metadata"
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

import { primitiveMetadataAtom } from "./primitiveMetadataAtom"
import type { Update } from "./types"

// Global kill-switch for problematic sources.
// We filter at read-time so re-enabling preserves per-column ordering.
export const disabledSourcesAtom = atomWithStorage<SourceID[]>("tt-disabled-sources", [])

export const focusSourcesAtom = atom((get) => {
  const disabled = new Set(get(disabledSourcesAtom))
  return get(primitiveMetadataAtom).data.focus.filter(id => !disabled.has(id))
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

const DEFAULT_ENABLED_COLUMNS: ColumnID[] = [
  "focus",
  "hottest",
  "china",
  "tech",
  "finance",
  "world",
  "realtime",
].filter(k => Object.prototype.hasOwnProperty.call(metadata, k)) as ColumnID[]

export const enabledColumnsAtom = atomWithStorage<ColumnID[]>("tt-enabled-columns", DEFAULT_ENABLED_COLUMNS)

export const currentSourcesAtom = atom((get) => {
  const id = get(currentColumnIDAtom)
  const disabled = new Set(get(disabledSourcesAtom))
  const list = fixedColumnIds.includes(id as any)
    ? get(primitiveMetadataAtom).data[id as FixedColumnID]
    : metadata[id as keyof typeof metadata].sources
  return list.filter(k => !disabled.has(k))
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

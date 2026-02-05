import type { ColumnID, FixedColumnID, SourceID } from "@shared/types"
import { fixedColumnIds, metadata } from "@shared/metadata"
import { sources } from "@shared/sources"
import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

import { primitiveMetadataAtom } from "./primitiveMetadataAtom"
import type { Update } from "./types"

// Personal source disable.
// Stored inside synced PrimitiveMetadata so it can follow the user across devices.
export const disabledSourcesAtom = atom(
  get => (get(primitiveMetadataAtom).data.disabledSources || []).filter(id => sources[id]),
  (get, set, update: Update<SourceID[]>) => {
    const prev = get(disabledSourcesAtom)
    const nextRaw = update instanceof Function ? update(prev) : update
    const next = Array.from(new Set(nextRaw.filter(id => sources[id]).map(id => sources[id].redirect ?? id)))
    set(primitiveMetadataAtom, {
      updatedTime: Date.now(),
      action: "manual",
      data: {
        ...get(primitiveMetadataAtom).data,
        disabledSources: next,
      },
    })
  },
)

export const mutedKeywordsAtom = atom(
  get => (get(primitiveMetadataAtom).data.mutedKeywords || []).filter(k => typeof k === "string"),
  (get, set, update: Update<string[]>) => {
    const prev = get(mutedKeywordsAtom)
    const nextRaw = update instanceof Function ? update(prev) : update
    const next: string[] = []
    const seen = new Set<string>()
    for (const s of nextRaw) {
      const k = String(s).trim()
      if (!k) continue
      const d = k.toLowerCase()
      if (seen.has(d)) continue
      seen.add(d)
      next.push(k)
      if (next.length >= 200) break
    }
    set(primitiveMetadataAtom, {
      updatedTime: Date.now(),
      action: "manual",
      data: {
        ...get(primitiveMetadataAtom).data,
        mutedKeywords: next,
      },
    })
  },
)

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

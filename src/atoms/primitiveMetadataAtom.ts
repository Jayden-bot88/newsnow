import { atom } from "jotai"
import type { PrimitiveAtom } from "jotai"

import { fixedColumnIds, metadata } from "@shared/metadata"
import { sources } from "@shared/sources"
import { typeSafeObjectEntries, typeSafeObjectFromEntries } from "@shared/type.util"
import type { FixedColumnID, PrimitiveMetadata, PrimitiveMetadataData, SourceID } from "@shared/types"

import { verifyPrimitiveMetadata } from "@shared/verify"
import type { Update } from "./types"

function createPrimitiveMetadataAtom(
  key: string,
  initialValue: PrimitiveMetadata,
  preprocess: ((stored: PrimitiveMetadata) => PrimitiveMetadata),
): PrimitiveAtom<PrimitiveMetadata> {
  const getInitialValue = (): PrimitiveMetadata => {
    const item = localStorage.getItem(key)
    try {
      if (item) {
        const stored = JSON.parse(item) as PrimitiveMetadata
        verifyPrimitiveMetadata(stored)
        return preprocess({
          ...stored,
          action: "init",
        })
      }
    } catch { }
    return initialValue
  }
  const baseAtom = atom(getInitialValue())
  const derivedAtom = atom(
    get => get(baseAtom),
    (get, set, update: Update<PrimitiveMetadata>) => {
      const nextValue = update instanceof Function ? update(get(baseAtom)) : update
      if (nextValue.updatedTime > get(baseAtom).updatedTime) {
        set(baseAtom, nextValue)
        localStorage.setItem(key, JSON.stringify(nextValue))
      }
    },
  )
  return derivedAtom
}

const initialMetadata = typeSafeObjectFromEntries(typeSafeObjectEntries(metadata)
  .filter(([id]) => fixedColumnIds.includes(id as any))
  .map(([id, val]) => [id, val.sources] as [FixedColumnID, SourceID[]]))

const initialData: PrimitiveMetadataData = {
  ...initialMetadata,
  disabledSources: [],
  mutedKeywords: [],
}

function isSourceId(v: string): v is SourceID {
  return Boolean((sources as unknown as Record<string, unknown>)[v])
}

function resolveSourceId(id: SourceID): SourceID {
  return (sources[id].redirect || id) as SourceID
}

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === "string")
}

function normalizeMutedKeywords(v: unknown): string[] {
  const raw = coerceStringArray(v)
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of raw) {
    const k = s.trim()
    if (!k) continue
    const dedupe = k.toLowerCase()
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push(k)
    if (out.length >= 200) break
  }
  return out
}

function normalizeSourceIds(v: unknown): SourceID[] {
  const raw = coerceStringArray(v)
  const out: SourceID[] = []
  const seen = new Set<string>()
  for (const s of raw) {
    const id = s.trim() as SourceID
    const src = sources[id]
    if (!src) continue
    const resolved = (src.redirect || id) as SourceID
    if (!sources[resolved]) continue
    if (seen.has(resolved)) continue
    seen.add(resolved)
    out.push(resolved)
    if (out.length >= 300) break
  }
  return out
}

function readLegacyDisabledSources(): SourceID[] {
  try {
    const raw = localStorage.getItem("tt-disabled-sources")
    if (!raw) return []
    return normalizeSourceIds(JSON.parse(raw))
  } catch {
    return []
  }
}

function mergeUniqueSourceIds(...groups: SourceID[][]): SourceID[] {
  const out: SourceID[] = []
  const seen = new Set<string>()
  for (const g of groups) {
    for (const id of g) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }
  return out
}
export function preprocessMetadata(target: PrimitiveMetadata) {
  const data = (target.data || {}) as unknown as Record<string, unknown>

  const reservedKeys = new Set<string>([
    ...fixedColumnIds,
    "disabledSources",
    "mutedKeywords",
  ])

  const passthrough = typeSafeObjectFromEntries(
    Object.entries(data)
      .filter(([k]) => !reservedKeys.has(k))
      .map(([k, v]) => [k, coerceStringArray(v)] as [string, string[]]),
  )

  const storedDisabled = normalizeSourceIds(data.disabledSources)
  const legacyDisabled = readLegacyDisabledSources()
  const disabledSources = mergeUniqueSourceIds(storedDisabled, legacyDisabled)

  const mutedKeywords = normalizeMutedKeywords(data.mutedKeywords)

  const fixedEntries: Array<[FixedColumnID, SourceID[]]> = fixedColumnIds.map((id) => {
    const raw = coerceStringArray(data[id])
    const resolved = raw
      .map(s => s.trim())
      .filter(Boolean)
      .filter(isSourceId)
      .map(resolveSourceId)

    if (id === "focus") {
      return [id, resolved]
    }

    const allow = initialMetadata[id]
    const oldS = resolved.filter(k => allow.includes(k))
    const newS = allow.filter(k => !oldS.includes(k))
    return [id, [...oldS, ...newS]]
  })
  const fixedData = typeSafeObjectFromEntries(fixedEntries)

  return {
    data: {
      ...initialData,
      ...fixedData,

      disabledSources,
      mutedKeywords,
      ...passthrough,
    },
    action: target.action,
    updatedTime: target.updatedTime,
  } as PrimitiveMetadata
}

export const primitiveMetadataAtom = createPrimitiveMetadataAtom("metadata", {
  updatedTime: 0,
  data: initialData,
  action: "init",
}, preprocessMetadata)

import type { SourceID } from "@shared/types"
import { sources } from "@shared/sources"
import { createError, defineEventHandler, readBody } from "h3"
import { getters } from "#/getters"

type SourceHealthStatus = "ok" | "empty" | "fail" | "unknown"

interface SourceHealthEntry {
  id: SourceID
  status: SourceHealthStatus
  count?: number
  httpStatus?: number
  message?: string
  checkedAt: number
}

interface SourceHealthState {
  checkedAt: number
  byId: Partial<Record<SourceID, SourceHealthEntry>>
}

interface ReqBody {
  sources?: SourceID[]
  concurrency?: number
  timeoutMs?: number
  force?: boolean
}

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number, value: SourceHealthState }>()

function getCacheKey(ids: SourceID[]) {
  return ids.slice().sort().join(",")
}

function toHttpStatus(err: any): number | undefined {
  const statusCode = err?.statusCode
  if (typeof statusCode === "number") return statusCode
  const status = err?.response?.status
  if (typeof status === "number") return status
}

function toMessage(err: any): string {
  const msg = err?.data?.message || err?.message
  return typeof msg === "string" && msg ? msg : "fetch failed"
}

function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return p
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(createError({ statusCode: 504, message: "Upstream timeout" })), timeoutMs)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

export default defineEventHandler(async (event) => {
  const checkedAt = Date.now()
  const body = (await readBody(event).catch(() => ({}))) as ReqBody
  const ids = (Array.isArray(body.sources) ? body.sources : [])
    .filter((id): id is SourceID => typeof id === "string" && Boolean(sources[id]))

  const key = getCacheKey(ids)
  if (key && !body.force) {
    const hit = cache.get(key)
    if (hit && checkedAt - hit.at < CACHE_TTL_MS) return hit.value
  }

  const concurrency = Math.max(1, Math.min(12, Number(body.concurrency || 8)))
  const timeoutMs = Math.max(1000, Math.min(20_000, Number(body.timeoutMs || 6000)))

  const next: SourceHealthState = {
    checkedAt,
    byId: {},
  }

  let idx = 0
  const worker = async () => {
    while (true) {
      const i = idx
      idx += 1
      if (i >= ids.length) break

      const id = ids[i]!
      const resolved = sources[id]?.redirect || id
      const getter = getters[resolved]

      if (typeof getter !== "function") {
        next.byId[id] = {
          id,
          status: "fail",
          httpStatus: 400,
          message: "Invalid source id",
          checkedAt,
        }
        continue
      }

      try {
        const items = await withTimeout(Promise.resolve(getter()), timeoutMs)
        const count = Array.isArray(items) ? items.length : 0
        next.byId[id] = {
          id,
          status: count ? "ok" : "empty",
          count,
          checkedAt,
        }
      } catch (e: any) {
        next.byId[id] = {
          id,
          status: "fail",
          httpStatus: toHttpStatus(e),
          message: toMessage(e),
          checkedAt,
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))

  if (key) cache.set(key, { at: checkedAt, value: next })
  return next
})

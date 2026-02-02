import { myFetch } from "./index"

interface TokenCache {
  token: string
  expiresAt: number
}

const STORAGE_KEY = "tt-detail-token"

function readCache(): TokenCache | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return
    const p = parsed as { token?: unknown, expiresAt?: unknown }
    if (typeof p.token !== "string") return
    if (typeof p.expiresAt !== "number") return
    return { token: p.token, expiresAt: p.expiresAt }
  } catch {
    return undefined
  }
}

function writeCache(v: TokenCache) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v))
  } catch {
    // ignore
  }
}

let inFlight: Promise<string> | undefined

export async function getDetailToken(): Promise<string> {
  const now = Date.now()
  const cached = readCache()
  // Refresh 30s before expiry.
  if (cached && cached.token && cached.expiresAt - now > 30_000) {
    return cached.token
  }

  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const res = await myFetch("/detail-token") as unknown
      const token = typeof (res as any)?.token === "string" ? (res as any).token : ""
      const expiresAt = typeof (res as any)?.expiresAt === "number" ? (res as any).expiresAt : 0
      if (token && expiresAt) {
        writeCache({ token, expiresAt })
        return token
      }
      return ""
    } catch {
      return ""
    } finally {
      inFlight = undefined
    }
  })()

  return inFlight
}

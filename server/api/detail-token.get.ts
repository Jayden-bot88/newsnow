import process from "node:process"

import { getRateLimitTable } from "#/database/rate-limit"
import { signDetailPublicToken } from "#/utils/detail-public-token"

function getClientIp(event: any): string {
  const h = getHeaders(event)
  const direct = h["cf-connecting-ip"]
    || h["true-client-ip"]
    || h["x-real-ip"]
  if (typeof direct === "string" && direct.trim()) return direct.trim()

  const forwarded = h["x-forwarded-for"]
  if (typeof forwarded === "string" && forwarded.trim()) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return "unknown"
}

export default defineEventHandler(async (event) => {
  const secret = process.env.DETAIL_PUBLIC_JWT_SECRET
  if (!secret) {
    throw createError({ statusCode: 501, message: "Detail token not configured" })
  }

  const ttlSeconds = Number(process.env.DETAIL_PUBLIC_TOKEN_TTL_SECONDS || "900")
  const limitPerMin = Number(process.env.DETAIL_PUBLIC_TOKEN_RATE_LIMIT_PER_MIN || "30")

  if (Number.isFinite(limitPerMin) && limitPerMin > 0) {
    const ip = getClientIp(event)
    const table = await getRateLimitTable()
    if (table) {
      await table.consume({
        key: `detail-token:${ip}`,
        limit: limitPerMin,
        windowMs: 60_000,
      })
    }
  }

  return await signDetailPublicToken({ secret, ttlSeconds })
})

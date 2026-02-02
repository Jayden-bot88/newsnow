import process from "node:process"
import { jwtVerify } from "jose"

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith("/api")) return

  const missingLoginEnv = ["JWT_SECRET", "G_CLIENT_ID", "G_CLIENT_SECRET"].some(k => !process.env[k])
  if (missingLoginEnv) {
    event.context.disabledLogin = true

    // When login isn't configured, most API routes are still allowed.
    const allowWhenLoginDisabled = [
      "/api/s",
      "/api/proxy",
      "/api/latest",
      "/api/mcp",
      "/api/detail",
      "/api/detail-token",
      "/api/enable-login",
      "/api/comments",
      "/api/source-health",
    ]
    if (allowWhenLoginDisabled.every(p => !url.pathname.startsWith(p))) {
      throw createError({ statusCode: 506, message: "Server not configured, disable login" })
    }
    return
  }

  // If login is configured, attach user context for selected routes.
  if (["/api/s", "/api/me", "/api/detail"].some(p => url.pathname.startsWith(p))) {
    const token = getHeader(event, "Authorization")?.replace(/Bearer\s*/, "")?.trim()
    if (token) {
      try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET)) as { payload?: { id: string, type: string } }
        if (payload?.id) {
          event.context.user = {
            id: payload.id,
            type: payload.type,
          }
        }
      } catch {
        if (url.pathname.startsWith("/api/me")) {
          throw createError({ statusCode: 401, message: "JWT verification failed" })
        }
        logger.warn("JWT verification failed")
      }
    } else if (url.pathname.startsWith("/api/me")) {
      throw createError({ statusCode: 401, message: "JWT verification failed" })
    }
  }
})

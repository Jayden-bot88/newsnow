// Type-only shims for Nitro/h3 auto-imported helpers.
//
// In production builds, Nitro can auto-import these at transform time, but
// `tsc` in CI runs before a Nitro build, so we need stable declarations.

import type { Database } from "db0"

declare global {
  const createError: typeof import("h3").createError
  const defineEventHandler: typeof import("h3").defineEventHandler
  const getHeader: typeof import("h3").getHeader
  const getHeaders: typeof import("h3").getHeaders
  const getQuery: typeof import("h3").getQuery
  const readBody: typeof import("h3").readBody
  const getRequestURL: typeof import("h3").getRequestURL
  const sendRedirect: typeof import("h3").sendRedirect
  const setResponseHeader: typeof import("h3").setResponseHeader

  // Nitro provides a global $fetch.
  const $fetch: typeof import("ofetch").$fetch

  // Provided by Nitro database integration (db0).
  const useDatabase: () => Database

  // Our server logger is commonly used without explicit import.
  const logger: typeof import("./utils/logger").logger
}

export {}

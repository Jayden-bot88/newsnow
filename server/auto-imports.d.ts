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

  // Server auto-imports from `server/utils/*`.
  const defineSource: typeof import("./utils/source").defineSource
  const myFetch: typeof import("./utils/fetch").myFetch
  const parseRelativeDate: typeof import("./utils/date").parseRelativeDate
  const tranformToUTC: typeof import("./utils/date").tranformToUTC
  const md5: typeof import("./utils/crypto").md5
  const myCrypto: typeof import("./utils/crypto").myCrypto
  const rss2json: typeof import("./utils/rss2json").rss2json
  const defineRSSSource: typeof import("./utils/source").defineRSSSource

  // Provided by Nitro database integration (db0).
  const useDatabase: () => Database

  // Our server logger is commonly used without explicit import.
  const logger: typeof import("./utils/logger").logger
}

export {}

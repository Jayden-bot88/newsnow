import process from "node:process"
import type { Database } from "db0"

interface RateLimitRow {
  key: string
  resetAt: number
  count: number
}

export class RateLimitTable {
  private db
  constructor(db: Database) {
    this.db = db
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS rate_limit (
        key TEXT PRIMARY KEY,
        resetAt INTEGER,
        count INTEGER
      );
    `).run()
    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_rate_limit_resetAt ON rate_limit(resetAt);
    `).run()
    logger.success("init rate_limit table")
  }

  async consume(params: { key: string, limit: number, windowMs: number, now?: number }) {
    const now = params.now ?? Date.now()
    const { key, limit, windowMs } = params
    if (!Number.isFinite(limit) || limit <= 0) return
    if (!Number.isFinite(windowMs) || windowMs <= 0) return

    // Use a transaction to keep correctness on sqlite.
    await this.db.prepare("BEGIN IMMEDIATE").run()
    try {
      const row = (await this.db
        .prepare("SELECT key, resetAt, count FROM rate_limit WHERE key = ?")
        .get(key)) as RateLimitRow | undefined

      if (!row || now >= row.resetAt) {
        await this.db
          .prepare("INSERT OR REPLACE INTO rate_limit (key, resetAt, count) VALUES (?, ?, ?)")
          .run(key, now + windowMs, 1)
        await this.db.prepare("COMMIT").run()
        return
      }

      const nextCount = (row.count ?? 0) + 1
      await this.db
        .prepare("UPDATE rate_limit SET count = ? WHERE key = ?")
        .run(nextCount, key)
      await this.db.prepare("COMMIT").run()

      if (nextCount > limit) {
        throw createError({ statusCode: 429, message: "Too many requests" })
      }
    } catch (e) {
      try {
        await this.db.prepare("ROLLBACK").run()
      } catch {
        // ignore
      }
      throw e
    }
  }
}

export async function getRateLimitTable() {
  try {
    const db = useDatabase()
    const table = new RateLimitTable(db)
    if (process.env.INIT_TABLE !== "false") await table.init()
    return table
  } catch (e) {
    logger.error("failed to init rate_limit table", e)
  }
}

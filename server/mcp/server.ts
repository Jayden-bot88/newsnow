import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { SourceResponse } from "@shared/types"
import { sources } from "@shared/sources"
import packageJSON from "../../package.json"
import { description } from "./desc.js"

export function getServer() {
  const server = new McpServer(
    {
      name: "NewsNow",
      version: packageJSON.version,
    },
    { capabilities: { logging: {} } },
  )

  server.tool(
    "list_source_ids",
    "List supported source IDs (stable, no network).",
    {
      limit: z.any().default(50).describe("Max number of source IDs to return."),
    },
    async ({ limit }): Promise<CallToolResult> => {
      let n = Number(limit)
      if (!Number.isFinite(n) || n < 1) n = 50
      n = Math.min(200, Math.floor(n))

      const ids = Object.keys(sources)
        .filter(id => !sources[id as keyof typeof sources]?.redirect)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, n)

      return {
        content: ids.map(id => ({ type: "text", text: id })),
      }
    },
  )

  server.tool(
    "get_hotest_latest_news",
    `get hotest or latest news from source by {id}, return {count: 10} news.`,
    {
      id: z.string().describe(`source id. e.g. ${description}`),
      count: z.any().default(10).describe("count of news to return."),
    },
    async ({ id, count }): Promise<CallToolResult> => {
      let n = Number(count)
      if (Number.isNaN(n) || n < 1) {
        n = 10
      }

      const res: SourceResponse = await $fetch(`/api/s?id=${id}`)
      return {
        content: res.items.slice(0, count).map((item) => {
          return {
            text: `[${item.title}](${item.url})`,
            type: "text",
          }
        }),
      }
    },
  )

  server.server.onerror = console.error.bind(console)

  return server
}

import { expect, test } from "@playwright/test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

test("mcp e2e: initialize -> tools/list -> tools/call", async () => {
  const url = new URL("/api/mcp", test.info().project.use.baseURL)
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        // Ensure we're talking to the MCP endpoint and not cached.
        "cache-control": "no-cache",
      },
    },
  })

  const client = new Client({ name: "newsnow-e2e", version: "0.0.0" })
  await client.connect(transport)

  const tools = await client.listTools()
  const names = tools?.tools?.map(t => t.name) || []
  expect(names).toContain("list_source_ids")
  expect(names).toContain("get_hotest_latest_news")

  const res = await client.callTool({
    name: "list_source_ids",
    arguments: { limit: 5 },
  })
  const content = Array.isArray((res as any)?.content) ? (res as any).content as Array<{ type?: unknown, text?: unknown }> : []
  const texts = content
    .filter(c => c.type === "text")
    .map(c => typeof c.text === "string" ? c.text : "")
    .filter(Boolean)
  expect(texts.length).toBeGreaterThan(0)

  await client.close()
  await transport.close()
})

import { Buffer } from "node:buffer"
import { expect, test } from "@playwright/test"

function sourceResponse(id: string, now: number) {
  const old = now - 3 * 24 * 60 * 60 * 1000
  const pubDate = id.startsWith("github") ? old : now
  return {
    status: "success",
    id,
    updatedTime: now,
    items: [
      {
        id: `${id}-1`,
        title: `Demo item from ${id}`,
        url: `https://example.com/${id}/1`,
        pubDate,
        extra: {
          hover: "summary",
        },
      },
    ],
  }
}

async function mockSearchApi(page: any, opts?: { mutedKeywords?: string[] }) {
  const png = Buffer.from(
    // 1x1 transparent png
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2wC0QAAAAASUVORK5CYII=",
    "base64",
  )

  await page.route("https://img.test/**", (route: any) => {
    route.fulfill({
      status: 200,
      headers: { "content-type": "image/png" },
      body: png,
    })
  })

  await page.addInitScript(({ mutedKeywords }: any) => {
    localStorage.setItem("metadata", JSON.stringify({
      updatedTime: 1700000000000,
      action: "init",
      data: {
        hottest: ["hackernews", "github-trending-today"],
        focus: ["hackernews", "github-trending-today"],
        mutedKeywords: mutedKeywords || [],
      },
    }))
  }, { mutedKeywords: opts?.mutedKeywords || [] })

  await page.route("**/api/s/entire", (route: any) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  })

  await page.route(/.*\/api\/s\?id=.*/, (route: any) => {
    const url = new URL(route.request().url())
    const id = url.searchParams.get("id") || "unknown"
    const now = Date.now()
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sourceResponse(id, now)),
    })
  })
}

test("search filters + highlight", async ({ page }) => {
  await mockSearchApi(page)
  await page.goto("/search?q=demo", { waitUntil: "domcontentloaded" })

  await expect(page.getByText("Demo item from hackernews")).toBeVisible()
  await expect(page.getByText("Demo item from github-trending-today")).toBeVisible()

  // Highlight query
  await expect(page.locator("mark").first()).toBeVisible()

  // Filter by source
  await page.locator("select").first().selectOption("github-trending-today")
  await expect(page.getByText("Demo item from github-trending-today")).toBeVisible()
  await expect(page.getByText("Demo item from hackernews")).not.toBeVisible()

  // Filter by time (github item is intentionally old)
  await page.locator("select").nth(1).selectOption("24h")
  await expect(page.getByText("没有找到相关内容")).toBeVisible()
})

test("search respects muted keywords", async ({ page }) => {
  await mockSearchApi(page, { mutedKeywords: ["demo"] })
  await page.goto("/search?q=demo", { waitUntil: "domcontentloaded" })
  await expect(page.getByText("没有找到相关内容")).toBeVisible()
})

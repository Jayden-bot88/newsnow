import { Buffer } from "node:buffer"
import { expect, test } from "@playwright/test"

function mkSourceResponse(id: string, titles: string[], baseTs: number) {
  return {
    status: "success",
    id,
    updatedTime: 1700000000000,
    items: titles.map((t, idx) => ({
      id: `${id}-${idx + 1}`,
      title: t,
      url: `https://example.com/${id}/${idx + 1}`,
      pubDate: baseTs - idx * 1000,
      extra: {
        icon: "https://img.test/237.jpg",
        info: "demo",
        hover: "summary",
      },
    })),
  }
}

test("home feed: keep order stable while sources load", async ({ page }) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2wC0QAAAAASUVORK5CYII=",
    "base64",
  )

  await page.route("https://img.test/**", (route) => {
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=31536000",
      },
      body: png,
    })
  })

  await page.addInitScript(() => {
    localStorage.setItem("metadata", JSON.stringify({
      updatedTime: 1700000000000,
      action: "init",
      data: {
        hottest: ["qqvideo-tv-hotsearch", "steam"],
        focus: ["qqvideo-tv-hotsearch", "steam"],
        daily: ["qqvideo-tv-hotsearch", "steam"],
      },
    }))
  })

  await page.route("**/api/s/entire", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  })

  await page.route(/.*\/api\/s\?id=.*/, (route) => {
    const url = new URL(route.request().url())
    const id = url.searchParams.get("id") || "unknown"

    if (id === "steam") {
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mkSourceResponse("steam", ["Steam 1", "Steam 2"], 1700000000000)),
        })
      }, 1500)
      return
    }

    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mkSourceResponse(id, ["Video 1", "Video 2"], 1700000005000)),
    })
  })

  await page.goto("/", { waitUntil: "domcontentloaded" })

  // First render should show the fast source.
  const first = (await page.locator("main a[href^='/detail']").allTextContents())
    .map(s => s.trim())
    .filter(Boolean)
  expect(first.join("\n")).toContain("Video 1")

  await page.waitForTimeout(2200)
  const later = (await page.locator("main a[href^='/detail']").allTextContents())
    .map(s => s.trim())
    .filter(Boolean)

  // Previously rendered items should keep their relative order.
  const idxV1 = later.findIndex(t => t.includes("Video 1"))
  const idxV2 = later.findIndex(t => t.includes("Video 2"))
  expect(idxV1).toBeGreaterThanOrEqual(0)
  expect(idxV2).toBeGreaterThan(idxV1)
})

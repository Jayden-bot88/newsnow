import { Buffer } from "node:buffer"
import { expect, test } from "@playwright/test"

function mkItems(id: string, count: number) {
  const base = 1700000000000
  return Array.from({ length: count }).map((_, idx) => ({
    id: `${id}-${idx + 1}`,
    title: `Scroll item ${idx + 1}`,
    url: `https://example.com/${id}/${idx + 1}`,
    pubDate: base - idx * 1000,
    extra: {
      icon: "https://img.test/237.jpg",
      info: "demo",
      hover: "summary",
    },
  }))
}

test("home: back from detail restores scroll position", async ({ page }) => {
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
        hottest: ["hackernews"],
        focus: ["hackernews"],
        daily: ["hackernews"],
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
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "success",
        id,
        updatedTime: 1700000000000,
        items: mkItems(id, 70),
      }),
    })
  })

  await page.route(/.*\/api\/detail\?url=.*/, (route) => {
    const reqUrl = new URL(route.request().url())
    const raw = reqUrl.searchParams.get("url") || ""
    let target = raw
    try {
      target = decodeURIComponent(raw)
    } catch {
      // ignore
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: target,
        site: "example.com",
        title: "Detail",
        desc: "",
        text: "正文",
        images: [],
      }),
    })
  })

  await page.goto("/", { waitUntil: "domcontentloaded" })
  const scroller = page.getByTestId("feed-scroller")
  await expect(scroller).toBeVisible()

  await scroller.evaluate((el) => {
    ;(el as any).scrollTop = 900
  })

  const saved = await scroller.evaluate(el => (el as any).scrollTop as number)
  expect(saved).toBeGreaterThan(0)

  // Click an item and then go back.
  await page.getByRole("link", { name: /Scroll item 20/ }).click()
  await expect(page.getByText("正文")).toBeVisible()
  await page.getByRole("button", { name: "Back" }).click()

  await expect(scroller).toBeVisible()

  await expect.poll(async () => {
    return scroller.evaluate(el => (el as any).scrollTop as number)
  }, { timeout: 10_000 }).toBeGreaterThanOrEqual(saved - 10)
})

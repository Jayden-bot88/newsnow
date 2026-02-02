import { Buffer } from "node:buffer"
import { expect, test } from "@playwright/test"

function sourceResponse(id: string) {
  return {
    status: "success",
    id,
    updatedTime: 1700000000000,
    items: [
      {
        id: `${id}-1`,
        title: `Dismiss me from ${id}`,
        url: `https://example.com/${id}/1`,
        mobileUrl: `https://m.example.com/${id}/1`,
        extra: {
          images: [
            "https://img.test/237.jpg",
          ],
          info: "demo",
          hover: "summary",
        },
      },
      {
        id: `${id}-2`,
        title: `Keep me from ${id}`,
        url: `https://example.com/${id}/2`,
        mobileUrl: `https://m.example.com/${id}/2`,
        extra: {
          images: [
            "https://img.test/238.jpg",
          ],
          info: "demo",
          hover: "summary",
        },
      },
    ],
  }
}

async function mockApi(page: any) {
  const png = Buffer.from(
    // 1x1 transparent png
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2wC0QAAAAASUVORK5CYII=",
    "base64",
  )

  await page.route("https://img.test/**", (route: any) => {
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=31536000",
      },
      body: png,
    })
  })

  // Keep rendering stable.
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
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sourceResponse(id)),
    })
  })
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test("dismiss via overflow menu: persists and can be cleared", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })

  await expect(page.getByText("Dismiss me from hackernews")).toBeVisible()
  await expect(page.getByText("Keep me from hackernews")).toBeVisible()

  // Open overflow menu on the first card.
  await page.getByRole("button", { name: "更多操作" }).first().click()
  await page.getByRole("menuitem", { name: "不感兴趣" }).click()
  await expect(page.getByText("Dismiss me from hackernews")).not.toBeVisible()

  // Persisted after reload.
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.getByText("Dismiss me from hackernews")).not.toBeVisible()

  // Settings shows hidden count.
  await page.getByRole("link", { name: "Settings" }).click()
  await expect(page.getByText(/已隐藏\s*1\s*条/)).toBeVisible()

  // Clear and restore.
  await page.getByRole("button", { name: "清空隐藏" }).click()
  await expect(page.getByText(/已隐藏\s*0\s*条/)).toBeVisible()

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await expect(page.getByText("Dismiss me from hackernews")).toBeVisible()
})

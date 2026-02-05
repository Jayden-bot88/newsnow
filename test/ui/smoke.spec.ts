import { Buffer } from "node:buffer"
import { expect, test } from "@playwright/test"

// Screenshots are sensitive to OS/font rendering. In CI we only assert functional behavior.
// Opt-in to snapshot comparisons via: PW_SNAPSHOTS=1 pnpm test:ui
const ENABLE_SNAPSHOTS = process.env.PW_SNAPSHOTS === "1"

async function maybeScreenshot(page: any, name: string, options?: any) {
  if (!ENABLE_SNAPSHOTS) return
  await expect(page).toHaveScreenshot(name, options)
}

function sourceResponse(id: string) {
  return {
    status: "success",
    id,
    updatedTime: 1700000000000,
    items: [
      {
        id: `${id}-1`,
        title: `Demo item from ${id}`,
        url: `https://example.com/${id}/1`,
        mobileUrl: `https://m.example.com/${id}/1`,
        extra: {
          images: [
            "https://img.test/237.jpg",
            "https://img.test/238.jpg",
            "https://img.test/239.jpg",
          ],
          info: "demo",
          hover: "summary",
        },
      },
      {
        id: `${id}-2`,
        title: `Another item from ${id}`,
        url: `https://example.com/${id}/2`,
        mobileUrl: `https://m.example.com/${id}/2`,
        extra: {
          images: [
            "https://img.test/240.jpg",
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
        hottest: ["hackernews", "github"],
        focus: ["hackernews", "github"],
        daily: ["hackernews", "github"],
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

  await page.route(/.*\/api\/detail\?url=.*/, (route: any) => {
    const reqUrl = new URL(route.request().url())
    const raw = reqUrl.searchParams.get("url") || ""
    let target = raw
    try {
      target = decodeURIComponent(raw)
    } catch {
      // ignore
    }

    // Simulate a slow extractor for the 3s fallback guarantee.
    if (target.includes("/slow")) {
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            url: target,
            site: "example.com",
            title: "Demo detail (slow)",
            desc: "",
            text: "第一段\n\n第二段\n\n第三段",
            images: [
              "https://img.test/241.jpg",
              "https://img.test/242.jpg",
              "https://img.test/243.jpg",
            ],
          }),
        })
      }, 5000)
      return
    }

    if (target.includes("bilibili.com/video/")) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: target,
          site: "www.bilibili.com",
          title: "Demo bilibili",
          desc: "视频简介：这是一个 demo bilibili 视频。",
          text: "第一段",
          images: [],
          video: {
            type: "iframe",
            url: "https://player.bilibili.com/player.html?bvid=BV1Hz4y1k7ae&page=1&high_quality=1&autoplay=0",
          },
        }),
      })
      return
    }

    if (target.includes("iqiyi.com/")) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: target,
          site: "www.iqiyi.com",
          title: "Demo iqiyi",
          desc: "爱奇艺视频简介：这是一个 demo iqiyi 视频。",
          text: "这段正文不应展示",
          images: [],
        }),
      })
      return
    }

    if (target.includes("youku.com/")) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: target,
          site: "v.youku.com",
          title: "Demo youku",
          desc: "优酷视频简介：这是一个 demo youku 视频。",
          text: "这段正文不应展示",
          images: [],
        }),
      })
      return
    }

    if (target.includes("/dupimg")) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: target,
          site: "example.com",
          title: "Demo dupimg",
          desc: "",
          text: "第一段",
          images: [
            "https://img.test/241.jpg",
            "https://img.test/241.jpg",
            "https://img.test/241.jpg",
          ],
        }),
      })
      return
    }

    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "https://example.com",
        site: "example.com",
        title: "Demo detail",
        desc: "",
        text: "第一段\n\n第二段\n\n第三段",
        images: [
          "https://img.test/241.jpg",
          "https://img.test/242.jpg",
          "https://img.test/243.jpg",
        ],
      }),
    })
  })

  await page.route(/.*\/api\/comments\?url=.*/, (route: any) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total: 0, comments: [] }),
    })
  })
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test("home feed", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await expect(page.getByText("推荐")).toBeVisible()
  await expect(page.getByText("所有来源加载失败")).not.toBeVisible()
  await expect(page.getByText("Demo item from hackernews")).toBeVisible()
  await maybeScreenshot(page, "home.png", { timeout: 15000 })
})

test("search default", async ({ page }) => {
  await page.goto("/search?q=", { waitUntil: "domcontentloaded" })
  await expect(page.getByText("热搜")).toBeVisible()
  await maybeScreenshot(page, "search.png", { timeout: 15000 })
})

test("detail + image viewer", async ({ page }) => {
  await page.goto("/detail?url=https%3A%2F%2Fexample.com&title=%E6%B5%8B%E8%AF%95&source=%E6%9D%A5%E6%BA%90&time=", { waitUntil: "domcontentloaded" })
  // Wait for extracted content to show.
  await expect(page.getByText("第一段")).toBeVisible()
  await maybeScreenshot(page, "detail.png", { timeout: 15000 })

  // Open image viewer.
  await page.getByRole("button", { name: "查看图片" }).first().click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await maybeScreenshot(page, "detail-image-viewer.png", { timeout: 15000, maxDiffPixels: 20 })
})

test("detail slow fallback within 3s", async ({ page }) => {
  await page.goto("/detail?url=https%3A%2F%2Fexample.com%2Fslow&title=%E6%B5%8B%E8%AF%95&source=%E6%9D%A5%E6%BA%90&time=", { waitUntil: "domcontentloaded" })

  // Must never white-screen: original link exists.
  await expect(page.getByRole("link", { name: "原文" })).toBeVisible()

  // Under weak network, UI must show a readable fallback within 3 seconds.
  await expect(page.getByText("加载较慢，可点击右上角“原文”直接阅读。"))
    .toBeVisible({ timeout: 3500 })
})

test("detail video embed", async ({ page }) => {
  await page.goto("/detail?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV1Hz4y1k7ae&title=%E8%A7%86%E9%A2%91&source=%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9&time=", { waitUntil: "domcontentloaded" })

  const resp = await page.waitForResponse(r => r.url().includes("/api/detail?url=") && r.status() === 200)
  const json = await resp.json()
  expect(json?.video?.type).toBe("iframe")

  // Ensure the client applied API payload.
  await expect(page.getByText("视频简介：这是一个 demo bilibili 视频。"))
    .toBeVisible()
  await expect(page.getByText("第一段")).not.toBeVisible()

  await expect(page.getByTestId("video-kind")).toHaveText("iframe")

  const iframe = page.locator("iframe")
  await expect(iframe).toBeVisible()
  await expect(iframe).toHaveAttribute("src", /player\.bilibili\.com\/player\.html\?bvid=BV1Hz4y1k7ae/)

  const sandbox = await iframe.getAttribute("sandbox")
  expect(sandbox).toContain("allow-same-origin")
})

test("detail iqiyi video fallback", async ({ page }) => {
  await page.goto("/detail?url=https%3A%2F%2Fwww.iqiyi.com%2Fv_demo.html&title=%E7%88%B1%E5%A5%87%E8%89%BA&source=%E7%88%B1%E5%A5%87%E8%89%BA&time=", { waitUntil: "domcontentloaded" })

  // No playable embed, but still treated as video detail.
  await expect(page.getByText("该平台暂不支持站内播放")).toBeVisible()
  await expect(page.getByText("爱奇艺视频简介：这是一个 demo iqiyi 视频。"))
    .toBeVisible()
  await expect(page.getByText("这段正文不应展示")).not.toBeVisible()
})

test("detail youku video fallback", async ({ page }) => {
  await page.goto("/detail?url=https%3A%2F%2Fv.youku.com%2Fv_show%2Fid_demo.html&title=%E4%BC%98%E9%85%B7&source=%E4%BC%98%E9%85%B7&time=", { waitUntil: "domcontentloaded" })

  await expect(page.getByText("该平台暂不支持站内播放")).toBeVisible()
  await expect(page.getByText("优酷视频简介：这是一个 demo youku 视频。"))
    .toBeVisible()
  await expect(page.getByText("这段正文不应展示")).not.toBeVisible()
})

test("detail should dedupe images", async ({ page }) => {
  await page.goto("/detail?url=https%3A%2F%2Fexample.com%2Fdupimg&title=%E5%9B%BE%E7%89%87&source=%E6%9D%A5%E6%BA%90&time=", { waitUntil: "domcontentloaded" })
  await expect(page.getByText("第一段")).toBeVisible()
  await expect(page.getByRole("button", { name: "查看图片" })).toHaveCount(1)
})

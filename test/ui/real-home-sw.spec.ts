import { expect, test } from "@playwright/test"

test("real home: no partial-source error + no SW cache on localhost", async ({ page }) => {
  test.skip(Boolean(process.env.CI) && process.env.PW_REAL_SMOKE !== "1", "real upstream smoke is disabled in CI")

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await expect(page.getByText("推荐")).toBeVisible()

  // This message should never be shown. The app should only warn when *all* sources fail.
  await expect(page.getByText("部分来源加载失败")).not.toBeVisible()

  // In local production preview we intentionally do not keep a service worker cache,
  // otherwise it's easy to get stuck on an old bundle.
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const g = globalThis as unknown as {
        navigator?: {
          serviceWorker?: {
            getRegistrations?: () => Promise<unknown[]>
          }
        }
        caches?: {
          keys?: () => Promise<unknown[]>
        }
      }

      const regs = await g.navigator?.serviceWorker?.getRegistrations?.() ?? []
      const keys = await g.caches?.keys?.() ?? []

      return regs.length + keys.length
    })
  }, { timeout: 10_000 }).toBe(0)
})

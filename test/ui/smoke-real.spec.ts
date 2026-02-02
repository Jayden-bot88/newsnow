import { expect, test } from "@playwright/test"

test.describe("smoke (real pages)", () => {
  test("home -> refresh -> settings actions", async ({ page }) => {
    test.setTimeout(240_000)

    await page.goto("/")
    await expect(page.getByRole("button", { name: "NewsNow" })).toBeVisible()

    // Trigger refresh using a dedicated event (no network mocking).
    await page.evaluate("window.dispatchEvent(new Event('tt-refresh'))")
    await page.waitForTimeout(1200)
    // Toast is transient; just ensure no crash and page still interactive.
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible()

    await page.getByRole("link", { name: "Settings" }).click()
    await expect(page.getByText("API 频道设置（启用/禁用来源）")).toBeVisible()

    // Dismiss recovery control exists.
    await expect(page.getByText(/已隐藏 \d+ 条/)).toBeVisible()

    // Run health check so action buttons are rendered.
    await page.getByRole("button", { name: "检查所有来源" }).click()
    await expect(page.getByText("上次检查")).toBeVisible({ timeout: 180_000 })

    await expect(page.getByRole("button", { name: "一键停用异常" })).toBeVisible()
    await expect(page.getByRole("button", { name: "仅启用正常" })).toBeVisible()
    await expect(page.getByRole("button", { name: "复制诊断" })).toBeVisible()
  })
})

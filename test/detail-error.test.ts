import { describe, expect, it } from "vitest"

import { formatDetailError } from "@shared/detail-error"

describe("formatDetailError", () => {
  it("maps common status codes", () => {
    expect(formatDetailError({ statusCode: 429 })).toContain("频繁")
    expect(formatDetailError({ statusCode: 504 })).toContain("超时")
    expect(formatDetailError({ statusCode: 401 })).toContain("未授权")
  })

  it("maps blocked detail", () => {
    expect(formatDetailError({ statusCode: 400, data: { message: "Detail blocked" } })).toContain("不支持")
    expect(formatDetailError({ statusCode: 400, message: "Blocked host" })).toContain("不支持")
  })

  it("falls back to message", () => {
    expect(formatDetailError(new Error("boom"))).toBe("boom")
  })
})

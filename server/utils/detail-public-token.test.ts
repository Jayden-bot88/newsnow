import { describe, expect, it } from "vitest"

import { signDetailPublicToken, verifyDetailPublicToken } from "./detail-public-token"

describe("detail-public-token", () => {
  it("signs and verifies a token", async () => {
    const { token, expiresAt } = await signDetailPublicToken({ secret: "s", ttlSeconds: 60 })
    expect(typeof token).toBe("string")
    expect(expiresAt).toBeGreaterThan(Date.now())
    await expect(verifyDetailPublicToken({ secret: "s", token })).resolves.toBeUndefined()
  })
})

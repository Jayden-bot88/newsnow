import { describe, expect, it, vi } from "vitest"

// Mock DNS so tests are deterministic and offline-safe.
vi.mock("node:dns/promises", () => {
  return {
    lookup: vi.fn(),
  }
})

describe("/api/detail SSRF guard", async () => {
  const dns = await import("node:dns/promises")
  const { assertSafeDetailUrl } = await import("../server/utils/detail-ssrf")

  it("blocks obvious localhost/private IP targets", async () => {
    await expect(assertSafeDetailUrl("http://localhost/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(assertSafeDetailUrl("http://localhost.localdomain/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(assertSafeDetailUrl("http://127.0.0.1/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(assertSafeDetailUrl("http://0.0.0.0/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(assertSafeDetailUrl("http://10.0.0.1/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(assertSafeDetailUrl("http://192.168.1.1/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(assertSafeDetailUrl("http://172.16.0.1/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(assertSafeDetailUrl("http://169.254.169.254/latest/meta-data/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(assertSafeDetailUrl("http://[::1]/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
    await expect(assertSafeDetailUrl("http://[::]/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
  })

  it("blocks well-known metadata hostname", async () => {
    await expect(assertSafeDetailUrl("http://metadata.google.internal/"))
      .rejects
      .toMatchObject({ statusCode: 400 })
  })

  it("blocks hosts that resolve to private IPs", async () => {
    ;(dns.lookup as any).mockResolvedValueOnce([
      { address: "10.0.0.1", family: 4 },
    ])
    await expect(assertSafeDetailUrl("https://internal.example.test/path"))
      .rejects
      .toMatchObject({ statusCode: 400 })
  })

  it("allows hosts that resolve to public IPs", async () => {
    ;(dns.lookup as any).mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
    ])
    await expect(assertSafeDetailUrl("https://example.com/")).resolves.toBeUndefined()
  })
})

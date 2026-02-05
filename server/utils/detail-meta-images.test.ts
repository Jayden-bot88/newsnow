import { describe, expect, it } from "vitest"

import { extractMetaImages, pickFallbackImages } from "./detail-meta-images"

describe("detail-meta-images", () => {
  it("extracts og/twitter images and filters non-content assets", () => {
    const html = [
      "<meta property=\"og:image\" content=\"/cover.jpg\" />",
      "<meta property=\"og:image:secure_url\" content=\"https://img.example/logo.svg\" />",
      "<meta name=\"twitter:image\" content=\"https://img.example/content.png\" />",
    ].join("")
    const out = extractMetaImages(html, "https://example.com/post/1")
    expect(out).toEqual([
      "https://example.com/cover.jpg",
      "https://img.example/content.png",
    ])
  })

  it("skips 36kr newsflash meta images", () => {
    const meta = ["https://img.example/36.png"]
    const out = pickFallbackImages({ finalUrl: "https://36kr.com/newsflashes/1", metaImages: meta })
    expect(out).toEqual([])
  })
})

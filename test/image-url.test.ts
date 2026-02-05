import { describe, expect, it } from "vitest"

import { upgradeImageUrl } from "@shared/image-url"

describe("upgradeImageUrl", () => {
  it("strips oss resize params", () => {
    expect(upgradeImageUrl("https://img.example.com/a.jpg?x-oss-process=image/resize,w_200"))
      .toBe("https://img.example.com/a.jpg")
  })

  it("strips imageMogr2/imageView2 params", () => {
    expect(upgradeImageUrl("https://img.example.com/a.jpg?imageMogr2/auto-orient"))
      .toBe("https://img.example.com/a.jpg")
    expect(upgradeImageUrl("https://img.example.com/a.jpg?imageView2/1/w/200"))
      .toBe("https://img.example.com/a.jpg")
  })

  it("keeps url without transform params", () => {
    expect(upgradeImageUrl("https://img.example.com/a.jpg?foo=bar"))
      .toBe("https://img.example.com/a.jpg?foo=bar")
  })

  it("upgrades tencent inews thumbnails", () => {
    expect(upgradeImageUrl("https://inews.gtimg.com/news_ls/OPKKr59B-5LREw9MvCeI9BrFPNDPiLOYzqEoUMHNSyDp8AA_150120/0"))
      .toBe("https://inews.gtimg.com/news_ls/OPKKr59B-5LREw9MvCeI9BrFPNDPiLOYzqEoUMHNSyDp8AA_640330/0")
  })
})

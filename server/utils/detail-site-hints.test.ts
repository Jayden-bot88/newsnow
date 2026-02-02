import { describe, expect, it } from "vitest"

import { getDetailSummaryHint } from "./detail-site-hints"

describe("detail-site-hints", () => {
  it("returns hint for toutiao trending pages", () => {
    const hint = getDetailSummaryHint({
      requestedUrl: "https://www.toutiao.com/trending/7599429313611546662/",
      finalUrl: "https://www.toutiao.com/trending/7599429313611546662/",
    })
    expect(hint).toContain("聚合")
  })

  it("returns hint for toutiao hot-event pages", () => {
    const hint = getDetailSummaryHint({
      requestedUrl: "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
      finalUrl: "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
    })
    expect(hint).toContain("热榜")
  })

  it("returns undefined for normal articles", () => {
    const hint = getDetailSummaryHint({
      requestedUrl: "https://www.toutiao.com/article/1234567890/",
      finalUrl: "https://www.toutiao.com/article/1234567890/",
    })
    expect(hint).toBeUndefined()
  })

  it("returns hint for weibo search", () => {
    const hint = getDetailSummaryHint({
      requestedUrl: "https://s.weibo.com/weibo?q=%E7%94%98%E8%82%83%E5%9C%B0%E9%9C%87&t=31",
      finalUrl: "https://passport.weibo.com/visitor/visitor",
    })
    expect(hint).toContain("微博搜索")
  })

  it("returns hint for bilibili search", () => {
    const hint = getDetailSummaryHint({
      requestedUrl: "https://search.bilibili.com/all?keyword=%E6%9C%80%E7%83%AD",
      finalUrl: "https://search.bilibili.com/all?keyword=%E6%9C%80%E7%83%AD",
    })
    expect(hint).toContain("B 站搜索")
  })

  it("returns hint for douyin hot", () => {
    const hint = getDetailSummaryHint({
      requestedUrl: "https://www.douyin.com/hot/123456",
      finalUrl: "https://www.douyin.com/hot/123456",
    })
    expect(hint).toContain("抖音热搜")
  })

  it("returns hint for kuaishou search", () => {
    const hint = getDetailSummaryHint({
      requestedUrl: "https://www.kuaishou.com/search/video?searchKey=%E7%83%AD%E6%90%9C",
      finalUrl: "https://www.kuaishou.com/search/video?searchKey=%E7%83%AD%E6%90%9C",
    })
    expect(hint).toContain("快手搜索")
  })

  it("returns hint for steam store app", () => {
    const hint = getDetailSummaryHint({
      requestedUrl: "https://store.steampowered.com/app/322170/Geometry_Dash/",
      finalUrl: "https://store.steampowered.com/app/322170/Geometry_Dash/",
    })
    expect(hint).toContain("Steam")
  })
})

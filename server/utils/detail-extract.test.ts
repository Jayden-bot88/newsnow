import { load } from "cheerio"

import { describe, expect, it } from "vitest"

import { extractVideo } from "./detail-extract"

describe("api/detail: extractVideo", () => {
  it("extracts bilibili iframe from BV url", () => {
    const $ = load("<html></html>")
    const v = extractVideo($, "https://www.bilibili.com/video/BV1Hz4y1k7ae")
    expect(v).toEqual({
      type: "iframe",
      url: "https://player.bilibili.com/player.html?bvid=BV1Hz4y1k7ae&page=1&high_quality=1&autoplay=0",
    })
  })

  it("extracts tencent iframe from vid path", () => {
    const $ = load("<html></html>")
    const v = extractVideo($, "https://v.qq.com/x/cover/mzc00200o3jp0vf/d4101j5og2l.html")
    expect(v).toEqual({
      type: "iframe",
      url: "https://v.qq.com/txp/iframe/player.html?vid=d4101j5og2l",
    })
  })

  it("extracts tencent iframe from canonical when url is cover page", () => {
    const html = [
      "<html><head>",
      "<link rel=\"canonical\" href=\"https://v.qq.com/x/cover/mzc00200o3jp0vf/d4101j5og2l.html\">",
      "</head><body></body></html>",
    ].join("")
    const $ = load(html)
    const v = extractVideo($, "https://v.qq.com/x/cover/mzc00200o3jp0vf.html")
    expect(v).toEqual({
      type: "iframe",
      url: "https://v.qq.com/txp/iframe/player.html?vid=d4101j5og2l",
    })
  })
})

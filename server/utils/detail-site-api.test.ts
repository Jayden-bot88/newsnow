import { describe, expect, it } from "vitest"

import { extractDoubanMovieSubjectDetail, extractJin10FlashDetail, extractKaopuNewsListEntryDetail, extractMktnewsFlashDetail, extractXueqiuStockDetail, extractZhihuAnswerDetail, extractZhihuQuestionDetail, parseJin10NewestJs } from "./detail-site-api"

describe("detail-site-api", () => {
  it("extracts mktnews flash detail from list API", () => {
    const json = {
      status: 1,
      data: [
        {
          id: "a",
          data: {
            title: "标题",
            content: "内容",
            pic: "https://img.example/a.png",
          },
        },
      ],
    }
    const out = extractMktnewsFlashDetail({ id: "a", apiJson: json })
    expect(out?.text).toContain("内容")
    expect(out?.images?.[0]).toBe("https://img.example/a.png")
    expect((out?.blocks || []).map(b => b.type)).toContain("p")
  })

  it("extracts xueqiu quote summary", () => {
    const json = {
      data: {
        quote: {
          name: "贵州茅台",
          symbol: "SH600519",
          current: 123.45,
          percent: 1.23,
          exchange: "SH",
        },
      },
    }
    const out = extractXueqiuStockDetail({ symbol: "SH600519", apiJson: json })
    expect(out?.title).toContain("SH600519")
    expect(out?.text).toContain("现价")
    expect((out?.blocks || []).map(b => b.type)).toEqual(["h2", "p"])
  })

  it("extracts zhihu answer content html", () => {
    const json = {
      content: "<p>hello</p><p>world</p><img src=\"https://img.example/a.png\" />",
      question: {
        title: "Q",
      },
    }
    const out = extractZhihuAnswerDetail({ apiJson: json })
    expect(out?.title).toBe("Q")
    expect(out?.text).toContain("hello")
    expect(out?.images?.[0]).toBe("https://img.example/a.png")
    expect((out?.blocks || []).map(b => b.type)).toContain("img")
  })

  it("extracts zhihu question detail html", () => {
    const json = {
      title: "T",
      detail: "<p>介绍</p>",
    }
    const out = extractZhihuQuestionDetail({ apiJson: json })
    expect(out?.title).toBe("T")
    expect(out?.text).toContain("介绍")
    expect((out?.blocks || []).map(b => b.type)).toEqual(["p"])
  })

  it("extracts douban movie subject intro", () => {
    const json = {
      title: "风林火山",
      intro: "剧情简介内容",
      card_subtitle: "2025 / 中国大陆 / 剧情",
      pic: {
        large: "https://img.example/poster.jpg",
      },
      rating: {
        value: 6.4,
        count: 123,
      },
    }
    const out = extractDoubanMovieSubjectDetail({ apiJson: json })
    expect(out?.title).toBe("风林火山")
    expect(out?.text).toContain("剧情简介内容")
    expect(out?.images?.[0]).toBe("https://img.example/poster.jpg")
    expect((out?.blocks || []).map(b => b.type)).toContain("h2")
  })

  it("extracts kaopu list entry description", () => {
    const out = extractKaopuNewsListEntryDetail({
      apiJsonEntry: {
        title: "T",
        description: "第一行\n\n第二行",
        publisher: "法广",
        link: "https://example.com/a",
      },
    })
    expect(out?.title).toBe("T")
    expect(out?.text).toContain("第一行")
    expect(out?.blocks?.[0]?.type).toBe("h2")
  })

  it("parses jin10 newest js and extracts flash detail", () => {
    const raw = "var newest = [\n  {\"id\":\"1\",\"time\":\"2026-01-31 12:00\",\"data\":{\"content\":\"【标题】内容\",\"pic\":\"https://img.example/a.png\"}}\n];"
    const newest = parseJin10NewestJs(raw)
    expect(Array.isArray(newest)).toBe(true)
    const out = extractJin10FlashDetail({ id: "1", newest: newest || [] })
    expect(out?.title).toBe("标题")
    expect(out?.text).toContain("内容")
    expect((out?.blocks || []).some(b => b.type === "img")).toBe(true)
  })
})

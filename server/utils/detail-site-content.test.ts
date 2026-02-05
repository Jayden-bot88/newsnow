import { describe, expect, it } from "vitest"
import { extractSiteContent } from "./detail-site-content"

describe("detail-site-content", () => {
  it("extracts from thepaper __NEXT_DATA__", () => {
    const html = `
      <html><head></head><body>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
          props: {
            pageProps: {
              detailData: {
                contentDetail: {
                  content: "<p>hello</p><p>world</p><img src=\"https://img.example/a.png\" />",
                },
              },
            },
          },
        })}</script>
      </body></html>
    `.trim()
    const out = extractSiteContent({
      html,
      finalUrl: "https://www.thepaper.cn/newsDetail_forward_1",
    })
    expect(out?.text).toContain("hello")
    expect(out?.text).toContain("world")
    expect(out?.images?.[0]).toBe("https://img.example/a.png")

    const types = (out?.blocks || []).map(b => b.type)
    expect(types).toEqual(["p", "p", "img"])
  })

  it("falls back to thepaper summary + sharePic when content is video-only", () => {
    const html = `
      <html><head></head><body>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
          props: {
            pageProps: {
              detailData: {
                contentDetail: {
                  content: "<video src=\"https://video.example/a.mp4\"></video>",
                  summary: "summary text",
                  sharePic: "https://img.example/s.png",
                },
              },
            },
          },
        })}</script>
      </body></html>
    `.trim()
    const out = extractSiteContent({
      html,
      finalUrl: "https://m.thepaper.cn/newsDetail_forward_1",
    })
    expect(out?.text).toBe("summary text")
    expect(out?.images?.[0]).toBe("https://img.example/s.png")
    expect((out?.blocks || []).map(b => b.type)).toEqual(["img", "p"])
  })

  it("extracts from ifeng allData docData.contentData.contentList", () => {
    const allData = {
      docData: {
        contentData: {
          contentList: [
            { type: "text", data: "<p>段落1</p><p>段落2</p>" },
          ],
        },
      },
    }
    const html = `
      <html><head></head><body>
        <script>var allData = ${JSON.stringify(allData)};</script>
      </body></html>
    `.trim()
    const out = extractSiteContent({
      html,
      finalUrl: "https://news.ifeng.com/c/abc",
    })
    expect(out?.text).toContain("段落1")
    expect(out?.text).toContain("段落2")
  })

  it("extracts from ithome #paragraph", () => {
    const html = `
      <html><head></head><body>
        <div id="paragraph" class="post_content">
          <p>A</p><p>B</p>
          <img src="https://img.example/x.jpg" />
        </div>
      </body></html>
    `.trim()
    const out = extractSiteContent({
      html,
      finalUrl: "https://www.ithome.com/0/1/2.htm",
    })
    expect(out?.text).toContain("A")
    expect(out?.text).toContain("B")
    expect(out?.images?.[0]).toBe("https://img.example/x.jpg")

    const types = (out?.blocks || []).map(b => b.type)
    expect(types).toContain("img")
  })

  it("extracts from 36kr newsflashes meta description", () => {
    const html = `
      <html><head>
        <meta name="description" content="flash body" />
        <meta property="og:image" content="https://img.example/36.png" />
      </head><body></body></html>
    `.trim()
    const out = extractSiteContent({
      html,
      finalUrl: "https://www.36kr.com/newsflashes/123",
    })
    expect(out?.text).toBe("flash body")
    // 36kr newsflash pages often expose a site-level og:image, which is not a body image.
    expect(out?.images || []).toEqual([])
  })

  it("extracts pcbeta first postmessage (discuz)", () => {
    const html = `
      <html><body>
        <div id="postlist">
          <table><tr><td class="t_f" id="postmessage_1">
            第一行<br />
            <ignore_js_op>
              <img src="static/image/common/none.gif" zoomfile="/data/attachment/forum/202601/30/a.png" />
              <div class="tip aimg_tip">下载附件 保存到相册 2026-1-30 12:50 上传</div>
            </ignore_js_op>
          </td></tr></table>
        </div>
      </body></html>
    `.trim()
    const out = extractSiteContent({
      html,
      finalUrl: "https://bbs.pcbeta.com/viewthread-1-1-1.html",
    })
    expect(out?.text).toContain("第一行")
    expect(out?.images?.[0]).toBe("https://bbs.pcbeta.com/data/attachment/forum/202601/30/a.png")
    expect((out?.blocks || []).some(b => b.type === "img")).toBe(true)
  })

  it("returns waf hint for tencent html interstitial", () => {
    const html = "<html><script>location.href='https://waf.tencent.com/501page.html'</script></html>"
    const out = extractSiteContent({
      html,
      finalUrl: "https://news.qq.com/rain/a/20260127A05XYM00",
    })
    expect(out?.text).toContain("WAF")
  })

  it("extracts cls initialState.detail.articleDetail.content", () => {
    const nextData = {
      props: {
        initialState: {
          detail: {
            articleDetail: {
              title: "T",
              content: "C",
            },
          },
        },
      },
    }
    const html = `
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
      </body></html>
    `.trim()
    const out = extractSiteContent({ html, finalUrl: "https://www.cls.cn/detail/1" })
    expect(out?.text).toBe("C")
    expect(out?.blocks?.[0]?.type).toBe("h2")
  })

  it("extracts cls html content blocks and images", () => {
    const nextData = {
      props: {
        initialState: {
          detail: {
            articleDetail: {
              title: "T",
              content: "<p>hello</p><img src=\"https://img.example/a.png\" />",
            },
          },
        },
      },
    }
    const html = `
      <html><body>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
      </body></html>
    `.trim()
    const out = extractSiteContent({ html, finalUrl: "https://www.cls.cn/detail/2" })
    expect(out?.text).toContain("hello")
    expect(out?.images?.[0]).toBe("https://img.example/a.png")
    expect((out?.blocks || []).some(b => b.type === "img")).toBe(true)
  })

  it("extracts v2ex .topic_content html", () => {
    const html = `
      <html><body>
        <div class="topic_content">
          <p>Hello</p>
          <img src="//img.example/a.png" />
        </div>
      </body></html>
    `.trim()
    const out = extractSiteContent({ html, finalUrl: "https://www.v2ex.com/t/1" })
    expect(out?.text).toContain("Hello")
    expect(out?.images?.[0]).toBe("https://img.example/a.png")
    expect((out?.blocks || []).some(b => b.type === "img")).toBe(true)
  })
})

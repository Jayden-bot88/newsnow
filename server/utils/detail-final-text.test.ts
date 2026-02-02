import { describe, expect, it } from "vitest"

import { blocksToText, preferDescWhenExtractedIsTitle } from "./detail-final-text"

describe("detail-final-text", () => {
  it("prefers meta desc when extracted text only equals title", () => {
    const out = preferDescWhenExtractedIsTitle({
      title: "高市早苗：将寻求与习近平直接对话的可能性",
      desc: "据共同社报道，在日中关系恶化的形势下，日本首相高市早苗26日在被问及会如何面对中国国家主席习近平时表示，将考虑与习近平直接对话的可能性。",
      extractedText: "高市早苗：将寻求与习近平直接对话的可能性",
    })
    expect(out).toContain("据共同社报道")
  })

  it("keeps extracted text when it contains more than the title", () => {
    const out = preferDescWhenExtractedIsTitle({
      title: "T",
      desc: "D",
      extractedText: "T\n\n正文第一段",
    })
    expect(out).toContain("正文")
  })

  it("converts blocks to text (ignores images)", () => {
    const out = blocksToText([
      { type: "h2", text: "小标题" },
      { type: "p", text: "正文第一段" },
      { type: "img", src: "https://example.com/a.jpg", alt: "图" },
      { type: "ul", items: ["A", "B"] },
      { type: "caption", text: "图注" },
    ])
    expect(out).toContain("小标题")
    expect(out).toContain("正文第一段")
    expect(out).toContain("- A")
    expect(out).toContain("- B")
    expect(out).toContain("图注")
    expect(out).not.toContain("example.com")
  })
})

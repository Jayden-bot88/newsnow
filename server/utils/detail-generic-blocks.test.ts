import { load } from "cheerio"
import { describe, expect, it } from "vitest"

import { extractGenericBlocks } from "./detail-generic-blocks"

describe("detail-generic-blocks", () => {
  it("keeps DOM order and resolves image URLs", () => {
    const html = [
      "<html><body>",
      "<article>",
      "<p>hello</p>",
      "<img src=\"/a.png\" alt=\"a\" />",
      "<p>world</p>",
      "</article>",
      "</body></html>",
    ].join("")
    const $ = load(html)
    const blocks = extractGenericBlocks({
      $,
      container: $("article"),
      baseUrl: "https://example.com/x",
    })
    expect(blocks.map(b => b.type)).toEqual(["p", "img", "p"])
    expect(blocks[1]).toEqual({ type: "img", src: "https://example.com/a.png", alt: "a" })
  })

  it("extracts figcaption as caption", () => {
    const html = [
      "<html><body>",
      "<article>",
      "<figure>",
      "<img src=\"/a.png\" alt=\"a\" />",
      "<figcaption>cap text</figcaption>",
      "</figure>",
      "</article>",
      "</body></html>",
    ].join("")
    const $ = load(html)
    const blocks = extractGenericBlocks({
      $,
      container: $("article"),
      baseUrl: "https://example.com/x",
    })
    expect(blocks.map(b => b.type)).toEqual(["img", "caption"])
  })
})

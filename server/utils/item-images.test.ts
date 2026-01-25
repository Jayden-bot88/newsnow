import { describe, expect, it } from "vitest"
import { withImages } from "./item-images"

describe("withImages", () => {
  it("keeps valid extra.images and returns same object", () => {
    const item = {
      id: "1",
      title: "t",
      url: "https://example.com/a",
      extra: {
        images: [
          "https://img.example.com/1.jpg",
          "https://img.example.com/2.jpg",
        ],
      },
    }

    const out = withImages([item as any])
    expect(out[0]).toBe(item as any)
  })

  it("filters invalid image urls and caps to 3", () => {
    const item = {
      id: "1",
      title: "t",
      url: "https://example.com/a",
      extra: {
        images: [
          "https://img.example.com/1.jpg",
          "ftp://bad.example.com/1.jpg",
          "not-a-url",
          "https://img.example.com/2.jpg",
          "https://img.example.com/3.jpg",
          "https://img.example.com/4.jpg",
        ],
      },
    }

    const out = withImages([item as any])
    expect(out[0]).not.toBe(item as any)
    expect(out[0]?.extra?.images).toEqual([
      "https://img.example.com/1.jpg",
      "https://img.example.com/2.jpg",
      "https://img.example.com/3.jpg",
    ])
  })

  it("extracts images from hover html img tags", () => {
    const item = {
      id: "1",
      title: "t",
      url: "https://example.com/a",
      extra: {
        hover: `
          <p>Hello</p>
          <img src="https://img.example.com/a.jpg" />
          <img data-src="https://img.example.com/b.jpg" />
          <img srcset="https://img.example.com/c@1x.jpg 1x, https://img.example.com/c@2x.jpg 2x" />
        `,
      },
    }

    const out = withImages([item as any])
    expect(out[0]?.extra?.images).toEqual([
      "https://img.example.com/a.jpg",
      "https://img.example.com/b.jpg",
      "https://img.example.com/c@2x.jpg",
    ])
  })

  it("extracts images from markdown-style hover", () => {
    const item = {
      id: "1",
      title: "t",
      url: "https://example.com/a",
      extra: {
        hover: "![](https://img.example.com/a.webp) ![](https://img.example.com/b.png)",
      },
    }

    const out = withImages([item as any])
    expect(out[0]?.extra?.images).toEqual([
      "https://img.example.com/a.webp",
      "https://img.example.com/b.png",
    ])
  })

  it("falls back to icon url when it looks like an image", () => {
    const item = {
      id: "1",
      title: "t",
      url: "https://example.com/a",
      extra: {
        icon: "https://img.example.com/thumb.jpg",
      },
    }

    const out = withImages([item as any])
    expect(out[0]?.extra?.images).toEqual(["https://img.example.com/thumb.jpg"])
  })
})

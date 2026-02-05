import { describe, expect, it } from "vitest"

import { isMutedItem, normalizeMutedNeedles } from "@shared/muted-keywords"

describe("muted keywords", () => {
  it("normalizes, trims, de-dupes (case-insensitive)", () => {
    expect(normalizeMutedNeedles([" Foo ", "foo", "", "  "])).toEqual(["foo"])
    expect(normalizeMutedNeedles(["A", "b", "C"])).toEqual(["a", "b", "c"])
  })

  it("matches title and hover", () => {
    const item = {
      id: "1",
      title: "Hello World",
      url: "https://example.com",
      extra: { hover: "Bar Baz" },
    }
    expect(isMutedItem(item, [])).toBe(false)
    expect(isMutedItem(item, ["world"])).toBe(true)
    expect(isMutedItem(item, ["baz"])).toBe(true)
    expect(isMutedItem(item, ["nope"])).toBe(false)
  })
})

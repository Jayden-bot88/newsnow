import { describe, expect, it } from "vitest"

function score(ts: number, focused: boolean) {
  const FOCUS_BOOST_MS = 12 * 60 * 1000
  return ts + (focused ? FOCUS_BOOST_MS : 0)
}

describe("focus boost scoring", () => {
  it("prefers focused items when timestamps are close", () => {
    const now = Date.now()
    expect(score(now, true)).toBeGreaterThan(score(now, false))
    // A non-focused item that is much newer should still win.
    expect(score(now + 60 * 60 * 1000, false)).toBeGreaterThan(score(now, true))
  })
})

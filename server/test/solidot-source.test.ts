import { describe, expect, it } from "vitest"

import { normalizeSolidotUrl } from "../sources/solidot"

describe("solidot source", () => {
  it("normalizes double-host verify links", () => {
    const baseURL = "https://www.solidot.org"
    expect(normalizeSolidotUrl("/story?sid=1", baseURL)).toBe("https://www.solidot.org/story?sid=1")
    expect(normalizeSolidotUrl("//www.solidot.org/verify/checkstory/83434", baseURL)).toBe("https://www.solidot.org/verify/checkstory/83434")
    expect(normalizeSolidotUrl("/www.solidot.org/verify/checkstory/83434", baseURL)).toBe("https://www.solidot.org/verify/checkstory/83434")
  })
})

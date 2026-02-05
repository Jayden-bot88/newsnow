import { describe, expect, it } from "vitest"

import { getZhihuApiRequest } from "./detail-zhihu"

describe("detail-zhihu", () => {
  it("parses answer url", () => {
    const out = getZhihuApiRequest("https://www.zhihu.com/question/123/answer/456")
    expect(out).toEqual({
      kind: "answer",
      answerId: "456",
      apiUrl: "https://www.zhihu.com/api/v4/answers/456?include=content,question.title",
      referer: "https://www.zhihu.com/question/123",
    })
  })

  it("parses question url", () => {
    const out = getZhihuApiRequest("https://www.zhihu.com/question/123")
    expect(out).toEqual({
      kind: "question",
      questionId: "123",
      apiUrl: "https://www.zhihu.com/api/v4/questions/123?include=detail,title",
      referer: "https://www.zhihu.com/question/123",
    })
  })

  it("ignores non-zhihu hosts", () => {
    expect(getZhihuApiRequest("https://example.com/question/123/answer/456")).toBeUndefined()
  })
})

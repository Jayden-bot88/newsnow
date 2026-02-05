export type ZhihuApiRequest =
  | { kind: "answer", answerId: string, apiUrl: string, referer: string }
  | { kind: "question", questionId: string, apiUrl: string, referer: string }

export function getZhihuApiRequest(rawUrl: string): ZhihuApiRequest | undefined {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return undefined
  }

  const host = u.hostname.toLowerCase()
  if (host !== "www.zhihu.com" && host !== "zhihu.com") return undefined

  const path = u.pathname.replace(/\/+$/, "")

  // https://www.zhihu.com/question/123/answer/456
  {
    const m = /^\/question\/(\d+)\/answer\/(\d+)$/.exec(path)
    if (m?.[2]) {
      const answerId = m[2]
      const apiUrl = `https://www.zhihu.com/api/v4/answers/${answerId}?include=content,question.title`
      return {
        kind: "answer",
        answerId,
        apiUrl,
        referer: `https://www.zhihu.com/question/${m[1]}`,
      }
    }
  }

  // https://www.zhihu.com/answer/456
  {
    const m = /^\/answer\/(\d+)$/.exec(path)
    if (m?.[1]) {
      const answerId = m[1]
      const apiUrl = `https://www.zhihu.com/api/v4/answers/${answerId}?include=content,question.title`
      return {
        kind: "answer",
        answerId,
        apiUrl,
        referer: "https://www.zhihu.com/",
      }
    }
  }

  // https://www.zhihu.com/question/123
  {
    const m = /^\/question\/(\d+)$/.exec(path)
    if (m?.[1]) {
      const questionId = m[1]
      const apiUrl = `https://www.zhihu.com/api/v4/questions/${questionId}?include=detail,title`
      return {
        kind: "question",
        questionId,
        apiUrl,
        referer: `https://www.zhihu.com/question/${questionId}`,
      }
    }
  }

  return undefined
}

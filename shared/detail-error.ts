function toRecord(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== "object") return
  return v as Record<string, unknown>
}

function readStatusCode(err: unknown): number | undefined {
  const r = toRecord(err)
  const direct = r?.statusCode
  if (typeof direct === "number") return direct
  const res = toRecord(r?.response)
  const status = res?.status
  if (typeof status === "number") return status
}

function readMessage(err: unknown): string {
  const r = toRecord(err)
  const data = toRecord(r?.data)
  const msg = data?.message ?? r?.message
  return typeof msg === "string" && msg.trim() ? msg : ""
}

export function formatDetailError(err: unknown): string {
  const statusCode = readStatusCode(err)
  const message = readMessage(err)

  if (statusCode === 429) return "请求过于频繁，请稍后再试"
  if (statusCode === 504) return "上游响应超时，请稍后再试"
  if (statusCode === 413) return "正文内容过大，无法提取，请打开原文阅读"
  if (statusCode === 401) return "未授权，无法提取正文"

  if (statusCode === 400) {
    const m = message.toLowerCase()
    if (m.includes("detail blocked") || m.includes("blocked")) {
      return "该链接不支持正文提取，请打开原文阅读"
    }
  }

  if (message) return message
  return "正文加载失败"
}

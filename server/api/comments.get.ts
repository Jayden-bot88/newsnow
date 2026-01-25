function isHttpUrl(url: string) {
  return /^https?:\/\//.test(url)
}

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const url = typeof query.url === "string" ? query.url : ""

  if (!url || !isHttpUrl(url)) {
    throw createError({ statusCode: 400, message: "Invalid url" })
  }

  // Placeholder endpoint (no upstream fetch yet).
  return {
    url,
    total: 0,
    comments: [],
  }
})

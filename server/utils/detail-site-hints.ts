export function getDetailSummaryHint(params: { requestedUrl: string, finalUrl: string }): string | undefined {
  let requested: URL | undefined
  let final: URL | undefined
  try {
    requested = new URL(params.requestedUrl)
  } catch {
    // ignore
  }
  try {
    final = new URL(params.finalUrl)
  } catch {
    // ignore
  }

  const host = (requested?.hostname || final?.hostname || "").toLowerCase()
  const path = requested?.pathname || final?.pathname || ""
  const qs = requested?.searchParams || final?.searchParams

  // Today's Toutiao trending URLs are aggregate pages (SPA) without a single article body.
  if (host.endsWith("toutiao.com") && (path.startsWith("/trending/") || path.startsWith("/hot-event/"))) {
    return "这是今日头条热榜/聚合页，不包含单篇文章正文。可点击右上角“原文”查看。"
  }

  // Weibo search is guarded by visitor/login wall.
  if (host === "s.weibo.com" && path === "/weibo") {
    const q = qs?.get("q")
    if (q) return `这是微博搜索结果页（${q}），通常无法在未登录状态下抽取正文。可点击右上角“原文”查看。`
    return "这是微博搜索结果页，通常无法在未登录状态下抽取正文。可点击右上角“原文”查看。"
  }

  // Bilibili search results are not single-article pages.
  if (host.endsWith("search.bilibili.com")) {
    const q = qs?.get("keyword")
    if (q) return `这是 B 站搜索结果页（${q}），不包含单篇文章正文。可点击右上角“原文”查看。`
    return "这是 B 站搜索结果页，不包含单篇文章正文。可点击右上角“原文”查看。"
  }

  // Douyin hot search pages are topic aggregates.
  if (host.endsWith("douyin.com") && path.startsWith("/hot/")) {
    return "这是抖音热搜/话题页，不包含单篇文章正文。可点击右上角“原文”查看。"
  }

  // Kuaishou search pages are topic aggregates.
  if (host.endsWith("kuaishou.com") && path.startsWith("/search/")) {
    const q = qs?.get("searchKey")
    if (q) return `这是快手搜索结果页（${q}），不包含单篇文章正文。可点击右上角“原文”查看。`
    return "这是快手搜索结果页，不包含单篇文章正文。可点击右上角“原文”查看。"
  }

  // Weibo can redirect to visitor/login pages.
  if (final?.hostname.toLowerCase() === "passport.weibo.com") {
    return "微博页面触发访客/登录拦截，无法抽取正文。可点击右上角“原文”查看。"
  }

  // Steam store pages are product pages, not articles.
  if (host === "store.steampowered.com" && path.startsWith("/app/")) {
    return "这是 Steam 商店商品页，不是单篇文章正文。可点击右上角“原文”查看。"
  }

  // Generic Steam community pages vary widely (posts, discussions). Keep default extraction.

  return undefined
}

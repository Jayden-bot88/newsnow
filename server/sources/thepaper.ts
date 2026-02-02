interface Res {
  data: {
    hotNews: {
      contId: string
      name: string
      pubTimeLong: number | string

      // Cover images exist in list API; keep them for unified feed.
      pic?: string
      smallPic?: string
      sharePic?: string

      // Engagement metrics
      interactionNum?: string
      praiseTimes?: string
    }[]
  }
}

function formatCount(raw: unknown): string | undefined {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return
  if (n >= 1e8) return `${Math.round(n / 1e7) / 10}亿`
  if (n >= 1e4) return `${Math.round(n / 1e3) / 10}万`
  return String(Math.round(n))
}

function pickImageUrl(...candidates: Array<string | undefined>): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//.test(c)) return c
  }
}

export default defineSource(async () => {
  const url = "https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar"
  const res: Res = await myFetch(url)
  return res.data.hotNews
    .map((k) => {
      // Feed wants a single cover image. Multi-image grid is reserved for
      // sources that actually provide multi-image content (e.g. wallstreetcn).
      const cover = pickImageUrl(k.smallPic, k.pic, k.sharePic)

      const comments = formatCount(k.interactionNum)
      const likes = formatCount(k.praiseTimes)
      const infoParts = [comments ? `${comments}评` : undefined, likes ? `${likes}赞` : undefined]
        .filter(Boolean)
      const info = infoParts.length ? infoParts.join(" · ") : undefined

      return {
        id: k.contId,
        title: k.name,
        url: `https://www.thepaper.cn/newsDetail_forward_${k.contId}`,
        mobileUrl: `https://m.thepaper.cn/newsDetail_forward_${k.contId}`,
        pubDate: Number(k.pubTimeLong) || undefined,
        extra: {
          images: cover ? [cover] : undefined,
          info,
        },
      }
    })
})

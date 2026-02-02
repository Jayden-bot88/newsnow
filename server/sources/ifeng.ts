import type { NewsItem } from "@shared/types"

function normalizeIfengThumb(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return
  if (raw.startsWith("//")) return `https:${raw}`
  if (/^https?:\/\//.test(raw)) return raw
}

export default defineSource(async () => {
  const html: string = await myFetch("https://www.ifeng.com/")
  const regex = /var\s+allData\s*=\s*(\{[\s\S]*?\});/
  const match = regex.exec(html)
  const news: NewsItem[] = []
  if (match) {
    const realData = JSON.parse(match[1])
    const rawNews = realData.hotNews1 as {
      url: string
      title: string
      newsTime: string
      thumbnail?: string
    }[]
    rawNews.forEach((hotNews) => {
      const thumb = normalizeIfengThumb(hotNews.thumbnail)
      news.push({
        id: hotNews.url,
        url: hotNews.url,
        title: hotNews.title,
        extra: {
          date: hotNews.newsTime,
          images: thumb ? [thumb] : undefined,
        },
      })
    })
  }
  return news
})

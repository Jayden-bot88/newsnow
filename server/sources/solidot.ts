import * as cheerio from "cheerio"
import type { NewsItem } from "@shared/types"

export function normalizeSolidotUrl(href: string, baseURL: string) {
  // Some pages embed an absolute host into a path ("/www.solidot.org/..."),
  // or use a protocol-relative URL ("//www.solidot.org/...").
  if (href.startsWith("/www.solidot.org/")) {
    return `${baseURL}${href.replace("/www.solidot.org", "")}`
  }
  try {
    return new URL(href, baseURL).toString()
  } catch {
    return undefined
  }
}

export default defineSource(async () => {
  const baseURL = "https://www.solidot.org"
  const html: any = await myFetch(baseURL)
  const $ = cheerio.load(html)
  const $main = $(".block_m")
  const news: NewsItem[] = []
  $main.each((_, el) => {
    const a = $(el).find(".bg_htit a").last()
    const url = a.attr("href")
    const title = a.text()
    const date_raw = $(el).find(".talk_time").text().match(/发表于(.*?分)/)?.[1]
    const date = date_raw?.replace(/[年月]/g, "-").replace("时", ":").replace(/[分日]/g, "")
    if (url && title && date) {
      // Only keep story pages; ignore verify/interstitial links.
      if (!/^\/story\?sid=\d+/.test(url) && !/^story\?sid=\d+/.test(url)) return
      const normalized = normalizeSolidotUrl(url, baseURL)
      if (!normalized) return
      news.push({
        url: normalized,
        title,
        id: url,
        pubDate: parseRelativeDate(date, "Asia/Shanghai").valueOf(),
      })
    }
  })
  return news
})

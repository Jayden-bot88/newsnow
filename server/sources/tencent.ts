import { myFetch } from "#/utils/fetch"
import { defineSource } from "#/utils/source"

interface WapRes {
  ret: number
  msg: string
  data: {
    id: number
    name: string
    lead: string
    cover?: string
    shareTitle: string
    shareAbstract: string
    sharePic: string
    is724: boolean
    is724Paper: boolean
    head_cmsid: string
    feed_style: number
    head_article: {
      live_info: string
      title: string
      img: string
      pub_time: string
      media_name: string
    }
    paperInfo: any
    tabs: {
      id: string
      channel_id: string
      name: string
      source: string
      type: string
      articleList: any[]
      article_count: number
      sub_tab: string
    }[]
    banner: string
  }
}

function formatCount(raw: unknown): string | undefined {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return
  if (n >= 1e8) return `${Math.round(n / 1e7) / 10}亿`
  if (n >= 1e4) return `${Math.round(n / 1e3) / 10}万`
  return String(Math.round(n))
}

function toImageList(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : []
  return (arr as unknown[])
    .filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x))
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, 3)
}

function pickFirstNonEmpty(...lists: string[][]): string[] {
  for (const list of lists) {
    if (Array.isArray(list) && list.length) return list
  }
  return []
}

/**
 * 综合早报
 */
const comprehensiveNews = defineSource(async () => {
  const url = "https://i.news.qq.com/web_backend/v2/getTagInfo?tagId=aEWqxLtdgmQ%3D"
  const res = await myFetch<WapRes>(url, {
    headers: {
      Referer: "https://news.qq.com/",
    },
  })
  return res.data.tabs[0].articleList.map((news: any) => {
    const picInfo = news?.pic_info
    const images = pickFirstNonEmpty(
      toImageList(picInfo?.three_img),
      toImageList(picInfo?.big_img),
      toImageList(picInfo?.small_img),
    )

    const inter = news?.interation_info
    const comments = formatCount(inter?.commet_num)
    const reads = formatCount(inter?.read_num)
    const infoParts = [comments ? `${comments}评` : undefined, reads ? `${reads}读` : undefined]
      .filter(Boolean)
    const info = infoParts.length ? infoParts.join(" · ") : undefined

    return {
      id: news.id,
      title: news.title,
      url: news.link_info.url,
      pubDate: typeof news.publish_time === "string" ? news.publish_time : undefined,
      extra: {
        hover: news.desc,
        images: images.length ? images : undefined,
        info,
      },
    }
  })
})

export default defineSource({
  "tencent-hot": comprehensiveNews,
})

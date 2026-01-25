import type { NewsItem } from "@shared/types"

interface Res {
  data: {
    result: {
      id: string
      title: string
      type: number
      uuid: string
    }[]
  }
}

export default defineSource(async () => {
  const timestamp = Date.now()
  const url = `https://gw-c.nowcoder.com/api/sparta/hot-search/top-hot-pc?size=20&_=${timestamp}&t=`
  const res: Res = await myFetch(url)
  const out: NewsItem[] = []
  res.data.result.forEach((k) => {
    let itemUrl: string | undefined
    let id: string | undefined
    if (k.type === 74) {
      itemUrl = `https://www.nowcoder.com/feed/main/detail/${k.uuid}`
      id = k.uuid
    } else if (k.type === 0) {
      itemUrl = `https://www.nowcoder.com/discuss/${k.id}`
      id = k.id
    }
    if (!itemUrl || !id) return
    out.push({
      id,
      title: k.title,
      url: itemUrl,
    })
  })
  return out
})

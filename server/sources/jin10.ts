interface Jin10Item {
  id: string
  time: string
  type: number
  data: {
    pic?: string
    title?: string
    source?: string
    content?: string
    source_link?: string
    vip_title?: string
    lock?: boolean
    vip_level?: number
    vip_desc?: string
  }
  important: number
  tags: string[]
  channel: number[]
  remark: any[]
}

export default defineSource(async () => {
  const timestamp = Date.now()
  const url = `https://www.jin10.com/flash_newest.js?t=${timestamp}`

  const rawData: string = await myFetch(url)

  const jsonStr = (rawData as string)
    .replace(/^var\s+newest\s*=\s*/, "") // 移除开头的变量声明
    .replace(/;*$/, "") // 移除末尾可能存在的分号
    .trim() // 移除首尾空白字符
  const data: Jin10Item[] = JSON.parse(jsonStr)

  return data
    .filter(k => (k.data.title || k.data.content) && !k.channel?.includes(5))
    .flatMap((k) => {
      const raw = (k.data.title || k.data.content) || ""
      const text = raw
        .replace(/<\/?b>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()

      // Drop VIP ads / image-only promos.
      if (text.length < 20) return []
      if (/vip_column|cdn\.jin10\.com\/vip_column/i.test(raw)) return []

      const [, title, desc] = text.match(/^【([^】]*)】(.*)$/) ?? []
      return [{
        id: k.id,
        title: title ?? text,
        pubDate: parseRelativeDate(k.time, "Asia/Shanghai").valueOf(),
        url: `https://flash.jin10.com/detail/${k.id}`,
        extra: {
          hover: desc,
          info: !!k.important && "✰",
        },
      }]
    })
})

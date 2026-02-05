const share = defineSource(defineJsonFeedSource("https://www.v2ex.com/feed/share.json"))
const create = defineSource(defineJsonFeedSource("https://www.v2ex.com/feed/create.json"))
const ideas = defineSource(defineJsonFeedSource("https://www.v2ex.com/feed/ideas.json"))
const programmer = defineSource(defineJsonFeedSource("https://www.v2ex.com/feed/programmer.json"))

export default defineSource({
  "v2ex": share,
  "v2ex-share": share,
  "v2ex-create": create,
  "v2ex-ideas": ideas,
  "v2ex-programmer": programmer,
})

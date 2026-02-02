function normalizeTextLike(s: string) {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s*[-|—–]\s*\S+\s*$/, "")
    .trim()
}

export type PostDetailBlock =
  | { type: "h2", text: string }
  | { type: "p", text: string }
  | { type: "ul", items: string[] }
  | { type: "quote", text: string }
  | { type: "img", src: string, alt?: string }
  | { type: "caption", text: string }

type BlockPredicate = (block: PostDetailBlock) => boolean

function dropLeadingWhile(blocks: PostDetailBlock[], pred: BlockPredicate) {
  while (blocks.length && pred(blocks[0]!)) blocks.shift()
}

function dropTrailingWhile(blocks: PostDetailBlock[], pred: BlockPredicate) {
  while (blocks.length && pred(blocks[blocks.length - 1]!)) blocks.pop()
}

function isTextBlock(block: PostDetailBlock): block is Extract<PostDetailBlock, { text: string }> {
  return block.type === "p" || block.type === "h2" || block.type === "quote" || block.type === "caption"
}

function isPcbetaToolLine(text: string) {
  const t = text.trim()
  if (!t) return false
  if (t === "使用道具 举报") return true
  if (t === "下载附件 保存到相册") return true
  if (/^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}\s+上传$/.test(t)) return true
  // Discuz attachment file line.
  if (/\.(?:png|jpe?g|gif|webp)\s+\(\d+(?:\.\d+)?\s+KB,\s*下载次数:\s*\d+\)$/.test(t)) return true
  return false
}

function looksShortMetaLine(text: string) {
  const t = text.trim()
  if (!t) return false
  if (t.length > 50) return false
  // Metadata lines are usually short and do not end with full-stop punctuation.
  if (/[。！？]$/.test(t)) return false
  return true
}

function isWeChatHost(host: string) {
  const h = host.toLowerCase()
  return h === "mp.weixin.qq.com" || h.endsWith(".mp.weixin.qq.com")
}

function is36krHost(host: string) {
  const h = host.toLowerCase()
  return h === "36kr.com" || h.endsWith(".36kr.com")
}

function isIthomeHost(host: string) {
  const h = host.toLowerCase()
  return h === "ithome.com" || h.endsWith(".ithome.com")
}

function isSolidotHost(host: string) {
  const h = host.toLowerCase()
  return h === "www.solidot.org" || h.endsWith(".solidot.org")
}

function isThepaperHost(host: string) {
  const h = host.toLowerCase()
  return h === "www.thepaper.cn" || h.endsWith(".thepaper.cn")
}

function isHupuHost(host: string) {
  const h = host.toLowerCase()
  return h === "bbs.hupu.com" || h.endsWith(".hupu.com")
}

function isKaopuHost(host: string) {
  const h = host.toLowerCase()
  return h === "cn.nikkei.com" || h.endsWith(".nikkei.com")
}

function isPcbetaHost(host: string) {
  const h = host.toLowerCase()
  return h === "bbs.pcbeta.com" || h.endsWith(".bbs.pcbeta.com")
}

function isPcbetaUiImageSrc(src: string) {
  // Discuz / PCBeta templates include many UI-only images.
  if (/\/static\/image\/common\//i.test(src)) return true
  if (/\/static\/image\/pcbeta\/common\//i.test(src)) return true
  if (/\/static\/image\/magic\//i.test(src)) return true
  if (/\/static\/image\/smiley\//i.test(src)) return true
  // Discuz common attachment assets (icons/badges), not post attachments.
  if (/\/data\/attachment\/common\//i.test(src)) return true
  if (/\/images\/noavatar\.(?:svg|png|jpe?g)$/i.test(src)) return true
  return false
}

function isPcbetaNavOrMagicList(block: PostDetailBlock) {
  if (block.type !== "ul") return false
  const items = block.items.map(x => x.trim()).filter(Boolean)
  if (!items.length) return true

  // Navigation / section chips.
  const navKeywords = [
    "论坛",
    "家园",
    "苹果",
    "Win10",
    "Win11",
    "本版",
    "用户",
  ]
  if (items.every(x => x.length <= 12) && items.some(x => navKeywords.some(k => x.includes(k)))) return true

  // Discuz magic tools list.
  const magicKeywords = ["提升卡", "沉默卡", "喧嚣卡", "变色卡", "千斤顶"]
  if (items.every(x => x.length <= 12) && items.some(x => magicKeywords.includes(x))) return true

  return false
}

function isTencentHost(host: string) {
  const h = host.toLowerCase()
  return h.endsWith("qq.com") || h.endsWith("inews.qq.com")
}

function isTencentAvatarImage(block: PostDetailBlock) {
  if (block.type !== "img") return false
  if (typeof block.alt === "string" && block.alt.includes("头像")) return true
  // Typical avatar CDN pattern.
  return /inews\.gtimg\.com\/newsapp_ls\/.*_200200\//i.test(block.src)
}

function isTencentByline(block: PostDetailBlock) {
  if (block.type !== "p") return false
  const t = block.text.trim()
  if (!t) return false
  if (/(?:\d{4}-\d{2}-\d{2}\s+)?\d{1,2}:\d{2}/.test(t) && t.includes("发布于")) return true
  if (t.endsWith("官方账号")) return true
  // Often appears as the account name line.
  if (/^(?:新华社|央视|人民网|环球网).{0,6}新闻$/.test(t)) return true
  return false
}

function isTencentHeroImage(block: PostDetailBlock) {
  if (block.type !== "img") return false
  // The top banner image in tencent articles is usually an inews.gtimg.com newsapp_bt item.
  return /inews\.gtimg\.com\/newsapp_bt\//i.test(block.src)
}

export function postProcessDetailBlocks(params: {
  host: string
  title?: string
  blocks: PostDetailBlock[]
}) {
  let blocks = params.blocks.slice()

  const titleNorm = normalizeTextLike(params.title || "")
  if (titleNorm && blocks.length && blocks[0]?.type === "p") {
    const first = normalizeTextLike(blocks[0].text)
    if (first && first === titleNorm) blocks.shift()
  }

  const hostLower = params.host.toLowerCase()

  // Site-specific denoise rules.
  if (isTencentHost(hostLower)) {
    blocks = blocks.filter(b => !isTencentAvatarImage(b))
    // Trim header noise in order: banner image + byline blocks before the first real paragraph.
    dropLeadingWhile(blocks, b => isTencentHeroImage(b) || isTencentByline(b))
  }

  if (isWeChatHost(hostLower)) {
    const leadingMeta = /^(?:原标题|原题|原文标题|来源|作者|编辑|责编|校对|审核|发布|发布时间)\s*[：:]/
    dropLeadingWhile(blocks, (b) => {
      if (!isTextBlock(b)) return false
      const t = b.text.trim()
      return looksShortMetaLine(t) && leadingMeta.test(t)
    })

    const trailingExact = new Set([
      "阅读原文",
      "点击阅读原文",
      "推荐阅读",
      "相关阅读",
      "更多推荐",
    ])

    dropTrailingWhile(blocks, (b) => {
      if (!isTextBlock(b)) return false
      const t = b.text.trim()
      if (!looksShortMetaLine(t)) return false
      if (trailingExact.has(t)) return true
      if (/^(?:本文|文章来源)\s*[：:]/.test(t)) return true
      if (/^(?:声明|免责声明)\s*[：:]/.test(t)) return true
      return false
    })
  }

  if (is36krHost(hostLower)) {
    dropTrailingWhile(blocks, (b) => {
      if (!isTextBlock(b)) return false
      const t = b.text.trim()
      if (!looksShortMetaLine(t) && t.length > 80) return false
      if (/^本文来自\s*[：:]/.test(t)) return true
      if (t.includes("下载36氪") || t.includes("关注36氪") || t.includes("36氪App") || t.includes("打开36氪")) return true
      return false
    })
  }

  if (isIthomeHost(hostLower)) {
    dropTrailingWhile(blocks, (b) => {
      if (!isTextBlock(b)) return false
      const t = b.text.trim()
      if (!looksShortMetaLine(t)) return false
      if (/^(?:责任编辑|编辑|校对|审核)\s*[：:]/.test(t)) return true
      return false
    })

    // IT之家广告/跳转声明（只清尾部）
    dropTrailingWhile(blocks, (b) => {
      if (!isTextBlock(b)) return false
      const t = b.text.trim()
      if (!t) return true
      if (/^广告声明[：:]/.test(t)) return true
      if (t.includes("IT之家所有文章均包含本声明")) return true
      // Common footer bullets on ithome.
      if (t === "相关阅读：") return true
      if (/^《.+》$/.test(t)) return true
      if (t.startsWith("*") && (t.includes("仅供参考") || t.includes("需要") || t.includes("暂不支持") || t.includes("支持车型"))) return true
      return false
    })

    // IT之家相关阅读区可能包含“相关阅读：”后跟多条《标题》，再跟广告声明。保守清理：
    // 若尾部出现“相关阅读：”，则连同其后的短标题行一起删掉。
    dropTrailingWhile(blocks, (b) => {
      if (!isTextBlock(b)) return false
      const t = b.text.trim()
      if (!t) return true
      if (t === "相关阅读：") return true
      // Remove duplicated related titles at tail.
      if (/^《.+》$/.test(t)) return true
      return false
    })
  }

  if (isSolidotHost(hostLower)) {
    const dropTailText = () => {
      dropTrailingWhile(blocks, (b) => {
        if (!isTextBlock(b)) return false
        const t = b.text.trim()
        if (!t) return true
        if (t === "关注我们：" || t === "消息") return true
        if (t.includes("本站提到的所有注册商标") || t.includes("内容版权属于")) return true
        if (/京ICP证|京ICP备|公安局海淀分局备案号/.test(t)) return true
        if (/举报电话|涉未成年人举报|举报邮箱|有害信息举报专区/.test(t)) return true
        // Footer often includes a short quote and several nav-like short titles.
        if ((t.includes("——") || t.startsWith("--") || t.includes("--")) && t.length < 90) return true
        if (t.length <= 50 && !/[。！？]$/.test(t) && !t.includes(":") && !t.includes("：")) return true
        return false
      })
    }

    const dropTailNonText = () => {
      // Solidot footer includes many non-text blocks.
      dropTrailingWhile(blocks, (b) => {
        if (b.type === "img") {
          const src = b.src
          if (/icon\.solidot\.org\/images\/(?:btn|topics)\//i.test(src)) return true
          if (/icon\.solidot\.org\/images\/[a-z0-9]+\.png/i.test(src)) return true
          if (/icon\.zhiding\.cn\/beian\//i.test(src)) return true
          return false
        }
        if (b.type === "ul") return true
        return false
      })
    }

    dropTailText()
    dropTailNonText()
    dropTailText()
    dropTailNonText()
  }

  if (isThepaperHost(hostLower)) {
    const dropTailText = () => {
      dropTrailingWhile(blocks, (b) => {
        if (!isTextBlock(b)) return false
        const t = b.text.trim()
        if (!t) return true
        if (/沪ICP备|沪公网安备/.test(t)) return true
        if (t.includes("互联网新闻信息服务许可证")) return true
        if (t.includes("增值电信业务经营许可证")) return true
        if (/^©\s*\d{4}-\d{4}\s+/.test(t)) return true
        return false
      })
    }

    const dropTailNonText = () => {
      dropTrailingWhile(blocks, (b) => {
        if (b.type === "img") {
          const src = b.src
          if (/thepaper\.cn\/_next\/static\/media\//i.test(src)) return true
          return false
        }
        if (b.type === "ul") {
          const items = b.items.map(x => x.trim()).filter(Boolean)
          if (!items.length) return true
          if (items.some(x => x.includes("报料热线") || x.includes("报料邮箱"))) return true
          return false
        }
        return false
      })
    }

    dropTailText()
    dropTailNonText()
    dropTailText()
    dropTailNonText()
  }

  if (isHupuHost(hostLower)) {
    dropTrailingWhile(blocks, (b) => {
      if (!isTextBlock(b)) return false
      const t = b.text.trim()
      if (!t) return true
      if (/沪B2-|沪ICP备|网信算备/.test(t)) return true
      if (/All Rights Reserved/i.test(t)) return true
      if (/Copyright\s+©/i.test(t)) return true
      return false
    })
  }

  if (isKaopuHost(hostLower)) {
    dropTrailingWhile(blocks, (b) => {
      if (!isTextBlock(b)) return false
      const t = b.text.trim()
      if (!t) return true
      if (t === "报道评论" || t === "相关报道" || t === "HotNews" || t === "金融市场" || t === "关于日经指数") return true
      if (/©\s*Nikkei\s*Inc\./i.test(t) || t.includes("All rights reserved")) return true
      if (t.includes("未经许可不得转载")) return true
      return false
    })
  }

  // Global conservative tail trimming for explicit staff lines.
  dropTrailingWhile(blocks, (b) => {
    if (!isTextBlock(b)) return false
    const t = b.text.trim()
    if (!t) return true
    if (/^(?:责任编辑|责编|编辑|校对|审核)\s*[：:]/.test(t)) return true
    return false
  })

  if (isPcbetaHost(hostLower)) {
    // Discuz footer / controls are appended after the last post; only trim from the tail.
    const tailExact = new Set([
      "小黑屋手机版联系我们",
      "小黑屋",
      "手机版",
      "联系我们",
    ])

    const tailContains = [
      "Powered by Discuz",
      "All rights reserved",
      "CDN加速",
      "会员观点不代表",
      "Processed in",
      "GMT+8",
      "沪ICP备",
      "远景论坛",
      "远景在线",
      "使用道具",
      "举报",
    ]

    blocks = blocks.filter((b) => {
      if (b.type !== "img") return true
      return !isPcbetaUiImageSrc(b.src)
    })

    // Drop leading navigation / magic UI blocks until we hit actual post content.
    dropLeadingWhile(blocks, (b) => {
      if (b.type === "img") return isPcbetaUiImageSrc(b.src)
      if (isPcbetaNavOrMagicList(b)) return true
      // Discard empty/short captions at top.
      if (isTextBlock(b) && !b.text.trim()) return true
      return false
    })

    // Also remove nav/magic lists if they appear in between extracted blocks.
    blocks = blocks.filter(b => !isPcbetaNavOrMagicList(b))

    // Remove Discuz UI/control lines anywhere in the thread.
    blocks = blocks.filter((b) => {
      if (!isTextBlock(b)) return true
      return !isPcbetaToolLine(b.text)
    })

    dropTrailingWhile(blocks, (b) => {
      if (!isTextBlock(b)) return false
      const t = b.text.trim()
      if (!t) return true
      if (tailExact.has(t)) return true
      if (!looksShortMetaLine(t) && t.length > 120) return false
      if (/^Copyright\s+©/i.test(t)) return true
      if (/^Powered by\s+Discuz!/i.test(t)) return true
      return tailContains.some(x => t.includes(x))
    })
  }

  return blocks
}

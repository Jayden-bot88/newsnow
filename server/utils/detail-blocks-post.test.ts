import { describe, expect, it } from "vitest"

import { postProcessDetailBlocks } from "./detail-blocks-post"

describe("detail-blocks-post", () => {
  it("drops tencent avatar + byline", () => {
    const blocks = postProcessDetailBlocks({
      host: "view.inews.qq.com",
      title: "T",
      blocks: [
        { type: "img", src: "http://inews.gtimg.com/newsapp_ls/0/1_200200/0", alt: "头像" },
        { type: "img", src: "https://inews.gtimg.com/newsapp_bt/0/x_1586/0", alt: "" },
        { type: "p", text: "新华社新闻" },
        { type: "p", text: "2026-01-27 17:32发布于广东新华社新闻官方账号" },
        { type: "p", text: "正文第一段" },
        { type: "img", src: "https://inews.gtimg.com/newsapp_bt/0/x_1586/0", alt: "图片" },
      ],
    })
    expect(blocks.map(b => b.type)).toEqual(["p", "img"])
    expect(blocks[0]?.type === "p" ? blocks[0].text : "").toBe("正文第一段")
  })

  it("drops wechat leading meta + trailing boilerplate", () => {
    const blocks = postProcessDetailBlocks({
      host: "mp.weixin.qq.com",
      title: "T",
      blocks: [
        { type: "p", text: "原标题：测试" },
        { type: "p", text: "来源：示例号" },
        { type: "p", text: "正文第一段" },
        { type: "p", text: "正文第二段" },
        { type: "p", text: "点击阅读原文" },
      ],
    })
    expect(blocks.map(b => b.type)).toEqual(["p", "p"])
    expect(blocks[0]?.type === "p" ? blocks[0].text : "").toBe("正文第一段")
  })

  it("drops 36kr trailing app promo", () => {
    const blocks = postProcessDetailBlocks({
      host: "www.36kr.com",
      title: "T",
      blocks: [
        { type: "p", text: "正文第一段" },
        { type: "p", text: "关注36氪，下载36氪App" },
      ],
    })
    expect(blocks.map(b => b.type)).toEqual(["p"])
    expect(blocks[0]?.type === "p" ? blocks[0].text : "").toBe("正文第一段")
  })

  it("drops ithome trailing editor line", () => {
    const blocks = postProcessDetailBlocks({
      host: "www.ithome.com",
      title: "T",
      blocks: [
        { type: "p", text: "正文第一段" },
        { type: "p", text: "责任编辑：张三" },
      ],
    })
    expect(blocks.map(b => b.type)).toEqual(["p"])
    expect(blocks[0]?.type === "p" ? blocks[0].text : "").toBe("正文第一段")
  })

  it("drops ithome ad disclaimer + related section", () => {
    const blocks = postProcessDetailBlocks({
      host: "www.ithome.com",
      title: "T",
      blocks: [
        { type: "p", text: "正文第一段" },
        { type: "p", text: "相关阅读：" },
        { type: "p", text: "《标题A》" },
        { type: "p", text: "广告声明：文内含有的对外跳转链接，用于传递更多信息，结果仅供参考，IT之家所有文章均包含本声明。" },
      ],
    })
    expect(blocks.map(b => (b.type === "p" ? b.text : ""))).toEqual(["正文第一段"])
  })

  it("drops solidot footer", () => {
    const blocks = postProcessDetailBlocks({
      host: "www.solidot.org",
      title: "T",
      blocks: [
        { type: "p", text: "正文第一段。" },
        { type: "ul", items: ["导航A", "导航B"] },
        { type: "p", text: "关注我们：" },
        { type: "p", text: "消息" },
        { type: "p", text: "另一条新闻标题" },
        { type: "p", text: "本站提到的所有注册商标属于他们各自的所有人所有" },
        { type: "p", text: "京ICP备15039648号-15" },
      ],
    })
    expect(blocks.map(b => (b.type === "p" ? b.text : ""))).toEqual(["正文第一段。"])
  })

  it("drops nikkei footer nav", () => {
    const blocks = postProcessDetailBlocks({
      host: "cn.nikkei.com",
      title: "T",
      blocks: [
        { type: "p", text: "正文第一段。" },
        { type: "p", text: "报道评论" },
        { type: "p", text: "相关报道" },
        { type: "p", text: "© Nikkei Inc. All rights reserved./ 日本经济新闻社知识产权所有 未经许可不得转载" },
      ],
    })
    expect(blocks.map(b => (b.type === "p" ? b.text : ""))).toEqual(["正文第一段。"])
  })

  it("drops thepaper icp footer", () => {
    const blocks = postProcessDetailBlocks({
      host: "www.thepaper.cn",
      title: "T",
      blocks: [
        { type: "p", text: "正文第一段。" },
        { type: "ul", items: ["报料热线: 021-962866", "报料邮箱: news@thepaper.cn"] },
        { type: "p", text: "沪ICP备14003370号" },
        { type: "p", text: "沪公网安备31010602000299号" },
        { type: "p", text: "互联网新闻信息服务许可证：31120170006" },
        { type: "p", text: "增值电信业务经营许可证：沪B2-2017116" },
        { type: "p", text: "© 2014-2026 上海东方报业有限公司" },
        { type: "img", src: "https://www.thepaper.cn/_next/static/media/label_sm_90030.2e849b63.png" },
      ],
    })
    expect(blocks.map(b => (b.type === "p" ? b.text : ""))).toEqual(["正文第一段。"])
  })

  it("drops hupu icp footer", () => {
    const blocks = postProcessDetailBlocks({
      host: "bbs.hupu.com",
      title: "T",
      blocks: [
        { type: "p", text: "正文第一段。" },
        { type: "p", text: "上海匡慧网络科技有限公司 沪B2-20211235 沪ICP备2021021198号-6 网信算备310109445163904240019号 Copyright ©2021 KUANGHUI All Rights Reserved." },
      ],
    })
    expect(blocks.map(b => (b.type === "p" ? b.text : ""))).toEqual(["正文第一段。"])
  })

  it("drops pcbeta discuz footer + ui images", () => {
    const blocks = postProcessDetailBlocks({
      host: "bbs.pcbeta.com",
      title: "T",
      blocks: [
        { type: "p", text: "正文第一段" },
        { type: "img", src: "https://bbs.pcbeta.com/static/image/common/userinfo.gif" },
        { type: "quote", text: "jensen666 发表于 2026-1-30 13:20 正文楼层内容" },
        { type: "p", text: "小黑屋手机版联系我们" },
        { type: "p", text: "Copyright © 2005-2026 PCBeta. All rights reserved." },
        { type: "p", text: "Powered by Discuz! CDN加速及安全服务由「快御」提供" },
        { type: "p", text: "GMT+8, 2026-1-30 13:23, Processed in 20.066334 millisecond(s), 5 queries." },
      ],
    })
    expect(blocks.some(b => b.type === "img")).toBe(false)
    const tailText = blocks
      .filter((b): b is Extract<typeof b, { text: string }> => b.type === "p" || b.type === "quote" || b.type === "h2" || b.type === "caption")
      .map(b => b.text)
      .join("\n")
    expect(tailText).toContain("正文第一段")
    expect(tailText).toContain("正文楼层内容")
    expect(tailText).not.toContain("Copyright")
    expect(tailText).not.toContain("Powered by Discuz")
    expect(tailText).not.toContain("小黑屋")
    expect(tailText).not.toContain("Processed in")
  })

  it("drops pcbeta leading nav/magic ui blocks", () => {
    const blocks = postProcessDetailBlocks({
      host: "bbs.pcbeta.com",
      title: "T",
      blocks: [
        { type: "img", src: "https://bbs.pcbeta.com/static/image/pcbeta/common/pcbeta_logo.svg" },
        { type: "ul", items: ["论坛BBS", "家园Space", "苹果", "Win10", "Win11"] },
        { type: "ul", items: ["本版", "用户"] },
        { type: "img", src: "https://bbs.pcbeta.com/static/image/magic/bump.small.gif" },
        { type: "ul", items: ["提升卡", "沉默卡", "喧嚣卡", "变色卡", "千斤顶"] },
        { type: "quote", text: "a 发表于 2026-1-30 13:16 正文楼层内容" },
        { type: "img", src: "https://bbs.pcbeta.com/static/image/smiley/tiger/03.gif" },
        { type: "quote", text: "b 发表于 2026-1-30 13:20 第二条回复" },
      ],
    })
    expect(blocks.some(b => b.type === "ul")).toBe(false)
    expect(blocks.some(b => b.type === "img")).toBe(false)
    expect(blocks.map(b => b.type)).toEqual(["quote", "quote"])
  })

  it("drops pcbeta trailing tool lines", () => {
    const blocks = postProcessDetailBlocks({
      host: "bbs.pcbeta.com",
      title: "T",
      blocks: [
        { type: "p", text: "正文第一段" },
        { type: "p", text: "使用道具 举报" },
        { type: "p", text: "下载附件 保存到相册" },
        { type: "p", text: "2026-1-30 13:20 上传" },
      ],
    })
    expect(blocks.map(b => (b.type === "p" ? b.text : ""))).toEqual(["正文第一段"])
  })
})

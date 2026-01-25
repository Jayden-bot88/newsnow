interface DetailVideo {
  type: "iframe" | "file" | "hls"
  url: string
}

export interface RenderableVideo {
  kind: "iframe" | "video"
  src: string
}

export function isVideoDetailUrl(url: string): boolean {
  if (!isHttpUrl(url)) return false
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const path = u.pathname

    // Bilibili.
    if (host.endsWith("bilibili.com") && /\/video\/BV[0-9A-Za-z]+/.test(path)) return true

    // Tencent Video.
    if (host === "v.qq.com" && /\/x\/cover\//.test(path)) return true

    // iQiyi.
    if (host.endsWith("iqiyi.com") && /\/(?:v|a)_[0-9a-zA-Z]+\.html$/.test(path)) return true

    // Youku.
    if (host.endsWith("youku.com") && /\/v_show\//.test(path)) return true

    // MGTV.
    if (host.endsWith("mgtv.com") && /\/(?:b|l)\//.test(path)) return true

    // Xigua.
    if (host.endsWith("ixigua.com") && /\/(?:\d+|video)\//.test(path)) return true

    // Douyin (only explicit video urls, not /hot/* topics).
    if (host.endsWith("douyin.com") && /\/video\//.test(path)) return true

    // Kuaishou.
    if (host.endsWith("kuaishou.com") && /\/(?:short-video|photo)\//.test(path)) return true

    // YouTube.
    if ((host === "youtube.com" || host.endsWith(".youtube.com")) && (path === "/watch" || path.startsWith("/shorts/"))) return true
    if (host === "youtu.be") return true

    return false
  } catch {
    return false
  }
}

function isHttpUrl(url: string) {
  return /^https?:\/\//.test(url)
}

export function getVideoFromDetailUrl(url: string): RenderableVideo | undefined {
  if (!isHttpUrl(url)) return

  // Direct file.
  if (/\.(?:mp4|webm|ogg)(?:\?|$)/i.test(url)) return { kind: "video", src: url }
  if (/\.m3u8(?:\?|$)/i.test(url)) return { kind: "video", src: url }

  // Bilibili.
  const bvid = /\/video\/(BV[0-9A-Za-z]+)/.exec(url)?.[1]
  if (bvid) {
    return {
      kind: "iframe",
      src: `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=1&high_quality=1&autoplay=0`,
    }
  }

  // Tencent Video.
  const qqVid = new URL(url).searchParams.get("vid")
    || /\/x\/cover\/[^/]+\/([^./?#]+)\.html/i.exec(url)?.[1]
  if (qqVid) {
    return {
      kind: "iframe",
      src: `https://v.qq.com/txp/iframe/player.html?vid=${encodeURIComponent(qqVid)}`,
    }
  }
}

export function getVideoFromApi(res: any): RenderableVideo | undefined {
  const video = (res && typeof res === "object" ? (res.video as DetailVideo | undefined) : undefined)
  if (!video || !isHttpUrl(video.url)) return

  if (video.type === "iframe") return { kind: "iframe", src: video.url }
  return { kind: "video", src: video.url }
}

import process from "node:process"
import type { AllSourceID } from "@shared/types"
import defu from "defu"

import { myFetch } from "./fetch"
import { rss2json } from "./rss2json"

import type { RSSHubOption, RSSHubInfo as RSSHubResponse, SourceGetter, SourceOption } from "#/types"

function extractHttpImages(xs: unknown[]): string[] {
  const out: string[] = []
  for (const x of xs) {
    if (typeof x === "string") {
      if (/^https?:\/\//.test(x)) out.push(x)
      continue
    }
    if (typeof x === "object" && x) {
      const url = (x as any).url ?? (x as any).href
      const src = (x as any).src ?? (x as any).source
      const u = typeof url === "string"
        ? url
        : (typeof src === "string" ? src : undefined)
      if (typeof u === "string" && /^https?:\/\//.test(u)) out.push(u)
    }
  }
  return Array.from(new Set(out)).slice(0, 3)
}

function extractImagesFromHtml(html: string): string[] {
  const out: string[] = []
  const re = /<img[^>]*>/gi
  for (const m of html.matchAll(re)) {
    const tag = m[0] || ""
    const srcset = /\ssrcset=["']([^"']+)["']/i.exec(tag)?.[1]
    const src = /\ssrc=["']([^"']+)["']/i.exec(tag)?.[1]
    const dataSrc = /\sdata-src=["']([^"']+)["']/i.exec(tag)?.[1]

    const bestFromSrcset = srcset
      ? srcset
          .split(",")
          .map(s => s.trim().split(/\s+/)[0])
          .filter(Boolean)
          .pop()
      : undefined

    const picked = bestFromSrcset || dataSrc || src
    if (picked && /^https?:\/\//.test(picked)) out.push(picked)
    if (out.length >= 3) break
  }

  return Array.from(new Set(out)).slice(0, 3)
}

function extractImagesFromText(text: string): string[] {
  const out: string[] = []
  // markdown style: ![](https://...)
  const md = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g
  for (const m of text.matchAll(md)) {
    const u = m[1]
    if (u && /^https?:\/\//.test(u)) out.push(u)
    if (out.length >= 3) break
  }
  if (out.length >= 3) return Array.from(new Set(out)).slice(0, 3)
  // plain url fallback
  const urlRe = /(https?:\/\/[^\s"')>]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"')>]*)?)/gi
  for (const m of text.matchAll(urlRe)) {
    const u = m[1]
    if (u && /^https?:\/\//.test(u)) out.push(u)
    if (out.length >= 3) break
  }
  return Array.from(new Set(out)).slice(0, 3)
}

function mergeImages(...groups: Array<unknown | unknown[]>) {
  const out: string[] = []
  for (const g of groups) {
    if (!g) continue
    const xs = Array.isArray(g) ? g : [g]
    out.push(...extractHttpImages(xs))
  }
  return Array.from(new Set(out)).slice(0, 3)
}

type R = Partial<Record<AllSourceID, SourceGetter>>
export function defineSource(source: SourceGetter): SourceGetter
export function defineSource(source: R): R
export function defineSource(source: SourceGetter | R): SourceGetter | R {
  return source
}

export function defineRSSSource(url: string, option?: SourceOption): SourceGetter {
  return async () => {
    const data = await rss2json(url)
    if (!data?.items.length) throw new Error("Cannot fetch rss data")
    return data.items.map(item => ({
      title: item.title,
      url: item.link,
      id: item.link,
      pubDate: !option?.hiddenDate ? item.created : undefined,
      extra: (() => {
        const enclosures = Array.isArray((item as any).enclosures) ? (item as any).enclosures : []
        const itunesImage = (item as any).itunes_image
        const media = (item as any).media
        const html = String((item as any).content || "")
        const desc = String((item as any).description || "")
        const images = mergeImages(
          enclosures,
          itunesImage,
          media?.thumbnail,
        )

        const htmlImages = images.length >= 3
          ? []
          : Array.from(new Set([
              ...extractImagesFromHtml(html),
              ...extractImagesFromHtml(desc),
              ...extractImagesFromText(desc),
            ])).slice(0, 3)

        const merged = Array.from(new Set([...images, ...htmlImages])).slice(0, 3)
        return merged.length ? { images: merged } : undefined
      })(),
    }))
  }
}

export function defineRSSHubSource(route: string, RSSHubOptions?: RSSHubOption, sourceOption?: SourceOption): SourceGetter {
  return async () => {
    // "https://rsshub.pseudoyu.com"
    const RSSHubBase = "https://rsshub.rssforever.com"
    const url = new URL(route, RSSHubBase)
    url.searchParams.set("format", "json")
    RSSHubOptions = defu<RSSHubOption, RSSHubOption[]>(RSSHubOptions, {
      sorted: true,
    })

    Object.entries(RSSHubOptions).forEach(([key, value]) => {
      url.searchParams.set(key, value.toString())
    })
    const data: RSSHubResponse = await myFetch(url)
    return data.items.map(item => ({
      title: item.title,
      url: item.url,
      id: item.id ?? item.url,
      pubDate: !sourceOption?.hiddenDate ? item.date_published : undefined,
      extra: (() => {
        const images = mergeImages(
          (item as any).enclosures,
          (item as any).attachments,
          (item as any).image,
          (item as any).banner,
        )

        const htmlImages = images.length >= 3
          ? []
          : Array.from(new Set([
              ...extractImagesFromHtml(item.content_html || ""),
              ...extractImagesFromText(item.content_html || ""),
            ])).slice(0, 3)

        const merged = Array.from(new Set([...images, ...htmlImages])).slice(0, 3)
        return merged.length ? { images: merged } : undefined
      })(),
    }))
  }
}

export function proxySource(proxyUrl: string, source: SourceGetter) {
  return process.env.CF_PAGES
    ? defineSource(async () => {
        const data = await myFetch(proxyUrl)
        return data.items
      })
    : source
}

function stripImageResizeParams(raw: string): string {
  try {
    const u = new URL(raw)
    const search = u.search || ""
    if (!search) return raw

    if (u.searchParams.has("x-oss-process")) {
      u.searchParams.delete("x-oss-process")
      return u.toString()
    }

    if (/^\?(?:imageMogr2|imageView2)\b/i.test(search)
      || (/imageMogr2|imageView2/i.test(search) && !search.includes("="))) {
      u.search = ""
      return u.toString()
    }
  } catch {
    // ignore
  }
  return raw
}

export function upgradeImageUrl(raw: string): string {
  const stripped = stripImageResizeParams(raw)
  try {
    const u = new URL(stripped)
    if (u.hostname === "inews.gtimg.com") {
      const path = u.pathname
      const m = /^(\/news_ls\/[\w-]+)_\d{3,6}\/0$/.exec(path)
      if (m?.[1]) {
        u.pathname = `${m[1]}_640330/0`
        return u.toString()
      }
    }
  } catch {
    // ignore
  }
  return stripped || raw
}

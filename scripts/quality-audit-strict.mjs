import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import process from "node:process"

const require = createRequire(import.meta.url)
const sources = require("../shared/sources.json")

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4173"
const SAMPLE_PER_SOURCE = Number(process.env.SAMPLE_PER_SOURCE || "10")
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || "2"))
const DETAIL_DELAY_MS = Math.max(0, Number(process.env.DETAIL_DELAY_MS || "120"))
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.REQUEST_TIMEOUT_MS || "15000"))

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function nowIsoCompact() {
  const d = new Date()
  const pad = n => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, "0")}Z`
}

function normalizeSpace(s) {
  return String(s || "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeTitleLike(s) {
  return normalizeSpace(s).replace(/\s*[-|—–]\s*\S+\s*$/, "").trim()
}

function looksLikePlaceholder(text) {
  return [
    /分享来自参考消息客户端/,
    /请点击打开更多精彩/,
    /微信扫码分享/,
    /JIN10\.COM/,
    /爱奇艺-在线视频网站/,
  ].some(re => re.test(text))
}

function hasMeaningfulTextBlock(blocks) {
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue
    if (b.type === "img") return true
    if (b.type === "p" || b.type === "quote" || b.type === "h2" || b.type === "caption") {
      const t = normalizeSpace(b.text)
      if (t.length >= 8) return true
    }
  }
  return false
}

function pickSampleUrls(items, n) {
  const out = []
  const seen = new Set()
  for (const it of items) {
    const url = typeof it?.url === "string" ? it.url : ""
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
    if (out.length >= n) break
  }
  return out
}

async function fetchJson(path, extraHeaders = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json", ...extraHeaders },
      signal: controller.signal,
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
    return { ok: res.ok, status: res.status, json, raw: text }
  } finally {
    clearTimeout(timer)
  }
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${BASE_URL}/`, { method: "GET" })
      if (res.ok) return true
    } catch {
      // ignore
    }
    await sleep(500)
  }
  return false
}

async function runPool(tasks, worker) {
  const results = []
  let idx = 0
  const runOne = async () => {
    while (true) {
      const i = idx
      idx += 1
      if (i >= tasks.length) return
      results[i] = await worker(tasks[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, runOne))
  return results
}

async function main() {
  const ready = await waitForServer()
  if (!ready) {
    console.error(`Server not reachable at ${BASE_URL}`)
    process.exitCode = 2
    return
  }

  const tokenRes = await fetchJson("/api/detail-token")
  const token = typeof tokenRes.json?.token === "string" ? tokenRes.json.token : ""
  if (!token) {
    console.error("/api/detail-token did not return token; set DETAIL_PUBLIC_JWT_SECRET for local strict audit")
    process.exitCode = 2
    return
  }

  const ids = Object.keys(sources).filter((id) => {
    const v = sources[id]
    // Strict audit only checks enabled sources.
    return !v?.disable
  })

  const perSource = {}
  const detailTasks = []

  for (const id of ids) {
    const res = await fetchJson(`/api/s?id=${encodeURIComponent(id)}&latest=true`)
    const items = (res.json && typeof res.json === "object" && Array.isArray(res.json.items)) ? res.json.items : []
    const urls = pickSampleUrls(items, SAMPLE_PER_SOURCE)
    perSource[id] = { id, urls, listCount: items.length, details: [] }
    for (const url of urls) detailTasks.push({ id, url })
  }

  await runPool(detailTasks, async ({ id, url }) => {
    if (DETAIL_DELAY_MS) await sleep(DETAIL_DELAY_MS)
    const res = await fetchJson(
      `/api/detail?url=${encodeURIComponent(url)}`,
      { "X-Detail-Token": token },
    )

    const payload = res.ok ? res.json : undefined
    const blocks = Array.isArray(payload?.blocks) ? payload.blocks : []
    const images = Array.isArray(payload?.images) ? payload.images : []
    const title = normalizeTitleLike(payload?.title)
    const text = normalizeSpace(payload?.text)
    const hasBlockImg = blocks.some(b => b && typeof b === "object" && b.type === "img")

    const failures = []
    if (!res.ok) failures.push({ type: "detail_non_200", status: res.status })
    if (res.ok && blocks.length === 0) failures.push({ type: "no_blocks" })
    if (res.ok && looksLikePlaceholder(text)) failures.push({ type: "placeholder_text" })
    if (res.ok && images.length > 0 && !hasBlockImg) failures.push({ type: "meta_image_only" })
    if (res.ok && !hasMeaningfulTextBlock(blocks)) failures.push({ type: "no_meaningful_text_block" })

    perSource[id].details.push({ url, ok: res.ok, status: res.status, title, textLen: text.length, blocksLen: blocks.length, imagesLen: images.length, failures })
  })

  const failures = []
  for (const id of ids) {
    const s = perSource[id]
    if (s.urls.length < Math.min(SAMPLE_PER_SOURCE, 3)) {
      failures.push({ id, type: "insufficient_items", listCount: s.listCount, sampled: s.urls.length })
      continue
    }
    for (const d of s.details) {
      if (d.failures.length) failures.push({ id, url: d.url, failures: d.failures })
    }
  }

  const outDir = resolve("artifacts", "quality-audit")
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, `quality-audit-strict-${nowIsoCompact()}.json`)
  writeFileSync(outPath, JSON.stringify({ baseUrl: BASE_URL, samplePerSource: SAMPLE_PER_SOURCE, ids, perSource, failures }, null, 2))

  console.log(JSON.stringify({ baseUrl: BASE_URL, samplePerSource: SAMPLE_PER_SOURCE, enabledSources: ids.length, failures: failures.length, reportPath: outPath }, null, 2))
  if (failures.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

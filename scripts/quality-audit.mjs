import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import process from "node:process"

const require = createRequire(import.meta.url)
const sources = require("../shared/sources.json")

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4173"
const SAMPLE_PER_SOURCE = Number(process.env.SAMPLE_PER_SOURCE || "8")
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || "2"))
const DETAIL_DELAY_MS = Math.max(0, Number(process.env.DETAIL_DELAY_MS || "150"))
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.REQUEST_TIMEOUT_MS || "15000"))
const SKIP_DISABLE_CF = process.env.SKIP_DISABLE_CF !== "false"

let detailToken = ""

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function nowIsoCompact() {
  const d = new Date()
  const pad = n => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, "0")}Z`
}

function isDisableCf(v) {
  return v && typeof v === "object" && v.disable === "cf"
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

async function initDetailToken() {
  try {
    const res = await fetchJson("/api/detail-token")
    const token = typeof res.json?.token === "string" ? res.json.token : ""
    if (token) detailToken = token
  } catch {
    // ignore
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

function pickSampleUrls(items, n) {
  const out = []
  const seen = new Set()
  for (const it of items) {
    if (!it || typeof it !== "object") continue
    const url = typeof it.url === "string" ? it.url : ""
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
    if (out.length >= n) break
  }
  return out
}

function splitLines(s) {
  return String(s)
    .replace(/\r/g, "")
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean)
}

function analyzeTail(text) {
  const lines = splitLines(text)
  const tail = lines.slice(-12)
  const patterns = [
    /^Copyright\s+©/i,
    /(?:ICP备|公网安备|网信算备)/,
    /All Rights Reserved/i,
    /违法和不良信息举报/,
    /^关注我们[:：]?$/,
  ]
  const hits = []
  for (const line of tail) {
    if (patterns.some(re => re.test(line))) hits.push(line)
  }
  return hits
}

function analyzeMetaImageOnly(payload) {
  if (!payload || typeof payload !== "object") return false
  const blocks = Array.isArray(payload.blocks) ? payload.blocks : []
  const images = Array.isArray(payload.images) ? payload.images : []
  const hasBlockImg = blocks.some(b => b && typeof b === "object" && b.type === "img")
  return images.length > 0 && !hasBlockImg
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
    process.exitCode = 1
    return
  }

  await initDetailToken()

  const ids = Object.keys(sources).filter((id) => {
    const v = sources[id]
    if (SKIP_DISABLE_CF && isDisableCf(v)) return false
    return true
  })

  const perSource = {}
  const detailTasks = []

  for (const id of ids) {
    const res = await fetchJson(`/api/s?id=${encodeURIComponent(id)}&latest=true`)
    const items = (res.json && typeof res.json === "object" && Array.isArray(res.json.items)) ? res.json.items : []
    const urls = pickSampleUrls(items, SAMPLE_PER_SOURCE)
    perSource[id] = { id, urls, details: [] }
    for (const url of urls) detailTasks.push({ id, url })
  }

  await runPool(detailTasks, async (task) => {
    if (DETAIL_DELAY_MS) await sleep(DETAIL_DELAY_MS)
    const res = await fetchJson(
      `/api/detail?url=${encodeURIComponent(task.url)}`,
      detailToken ? { "X-Detail-Token": detailToken } : {},
    )

    const payload = res.ok ? res.json : undefined
    const metaImageOnly = res.ok ? analyzeMetaImageOnly(payload) : false
    const tailHit = res.ok ? analyzeTail(payload?.text || "") : []

    perSource[task.id].details.push({
      url: task.url,
      ok: res.ok,
      status: res.status,
      sum: {
        metaImageOnly,
        tailHit,
      },
    })
  })

  const scores = ids.map((id) => {
    const rows = perSource[id]?.details || []
    const okRows = rows.filter(r => r.ok)
    const metaOnly = okRows.filter(r => r.sum?.metaImageOnly).length
    const tail = okRows.filter(r => Array.isArray(r.sum?.tailHit) && r.sum.tailHit.length > 0).length
    return {
      id,
      total: rows.length,
      tail,
      metaOnly,
    }
  }).sort((a, b) => (b.tail - a.tail) || (b.metaOnly - a.metaOnly) || a.id.localeCompare(b.id))

  const report = {
    baseUrl: BASE_URL,
    samplePerSource: SAMPLE_PER_SOURCE,
    scores,
    perSource,
  }

  const outDir = resolve("artifacts", "quality-audit")
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, `quality-audit-${nowIsoCompact()}.json`)
  writeFileSync(outPath, JSON.stringify(report, null, 2))

  console.log(JSON.stringify({ baseUrl: BASE_URL, samplePerSource: SAMPLE_PER_SOURCE, reportPath: outPath, worst: scores.slice(0, 6) }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import process from "node:process"

const require = createRequire(import.meta.url)
const sources = require("../shared/sources.json")

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5173"
const SAMPLE_PER_SOURCE = Number(process.env.SAMPLE_PER_SOURCE || "5")
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || "2"))
const DETAIL_DELAY_MS = Math.max(0, Number(process.env.DETAIL_DELAY_MS || "300"))
const SKIP_DISABLE_CF = process.env.SKIP_DISABLE_CF !== "false"
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.REQUEST_TIMEOUT_MS || "15000"))

let detailToken = ""

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function nowIsoCompact() {
  const d = new Date()
  const pad = n => String(n).padStart(2, "0")
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
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

async function fetchJsonWithRetry(path, extraHeaders = {}) {
  const maxRetries = Math.max(0, Number(process.env.RETRY_429 || "2"))
  let attempt = 0
  let last
  while (attempt <= maxRetries) {
    const res = await fetchJson(path, extraHeaders)
    last = res
    if (res.status !== 429) return res
    const backoff = 1000 * Math.min(5, attempt + 1)
    await sleep(backoff)
    attempt += 1
  }
  return last
}

async function initDetailToken() {
  // Token may be disabled on server (501) when DETAIL_PUBLIC_JWT_SECRET is unset.
  try {
    const res = await fetchJson("/api/detail-token")
    const token = typeof res.json?.token === "string" ? res.json.token : ""
    if (token) detailToken = token
  } catch {
    // ignore
  }
}

function classifyDetail(payload) {
  if (!payload || typeof payload !== "object") return "bad-payload"
  const p = payload
  const title = typeof p.title === "string" ? p.title : ""
  const desc = typeof p.desc === "string" ? p.desc : ""
  const text = typeof p.text === "string" ? p.text : ""
  const blocks = Array.isArray(p.blocks) ? p.blocks : []
  const images = Array.isArray(p.images) ? p.images : []

  const hasBlocks = blocks.length > 0
  const hasText = text.trim().length > 0

  // Hint payloads typically: title empty + text==desc + no blocks/images.
  if (!title && hasText && text === desc && !hasBlocks && images.length === 0) return "hint"
  if (hasBlocks) return "ok-blocks"
  if (hasText) return "ok-text"
  return "empty"
}

function pickSampleItems(items, n) {
  const out = []
  const seen = new Set()
  for (const it of items) {
    if (!it || typeof it !== "object") continue
    const url = typeof it.url === "string" ? it.url : ""
    if (!url) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ url, id: it.id, title: it.title })
    if (out.length >= n) break
  }
  return out
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

async function waitForServer() {
  // Vite dev might take a bit to boot.
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

async function main() {
  const ready = await waitForServer()
  if (!ready) {
    console.error(`Server not reachable at ${BASE_URL}`)
    process.exitCode = 1
    return
  }

  await initDetailToken()

  const ids = Object.keys(sources)
    .filter((id) => {
      const v = sources[id]
      if (SKIP_DISABLE_CF && isDisableCf(v)) return false
      return true
    })

  const plan = []
  for (const id of ids) {
    plan.push({ id })
  }

  const startedAt = Date.now()
  const perSource = {}
  const detailTasks = []

  // Step 1: fetch each source list.
  for (const { id } of plan) {
    const t0 = Date.now()
    const res = await fetchJson(`/api/s?id=${encodeURIComponent(id)}&latest=true`)
    const ms = Date.now() - t0

    const meta = sources[id] || {}
    const row = {
      id,
      home: meta.home,
      disable: meta.disable,
      redirect: meta.redirect,
      list: {
        ok: res.ok,
        status: res.status,
        ms,
      },
      samples: [],
    }

    const items = (res.json && typeof res.json === "object" && Array.isArray(res.json.items)) ? res.json.items : []
    const samples = pickSampleItems(items, SAMPLE_PER_SOURCE)
    row.samples = samples.map(s => ({ ...s, detail: null }))
    perSource[id] = row

    for (const s of samples) {
      detailTasks.push({ sourceId: id, url: s.url })
    }
  }

  // Step 2: fetch detail for sampled URLs with bounded concurrency.
  await runPool(detailTasks, async (task) => {
    // Rate-limit a bit to avoid being blocked by upstream sites.
    if (DETAIL_DELAY_MS) await sleep(DETAIL_DELAY_MS)
    const t0 = Date.now()
    const res = await fetchJsonWithRetry(
      `/api/detail?url=${encodeURIComponent(task.url)}`,
      detailToken ? { "X-Detail-Token": detailToken } : {},
    )
    const ms = Date.now() - t0
    const cls = res.ok ? classifyDetail(res.json) : "http-error"

    const p = res.json && typeof res.json === "object" ? res.json : {}
    const entry = {
      ok: res.ok,
      status: res.status,
      ms,
      classify: cls,
      site: typeof p.site === "string" ? p.site : "",
      titleLen: typeof p.title === "string" ? p.title.length : 0,
      textLen: typeof p.text === "string" ? p.text.length : 0,
      blocksLen: Array.isArray(p.blocks) ? p.blocks.length : 0,
      imagesLen: Array.isArray(p.images) ? p.images.length : 0,
    }

    const bucket = perSource[task.sourceId]
    if (bucket) {
      const slot = bucket.samples.find(x => x.url === task.url)
      if (slot) slot.detail = entry
    }

    return entry
  })

  // Summaries
  const summary = {
    baseUrl: BASE_URL,
    samplePerSource: SAMPLE_PER_SOURCE,
    concurrency: CONCURRENCY,
    detailDelayMs: DETAIL_DELAY_MS,
    skipDisableCf: SKIP_DISABLE_CF,
    sourcesTotal: Object.keys(sources).length,
    sourcesChecked: ids.length,
    detailRequests: detailTasks.length,
    durationMs: Date.now() - startedAt,
    counts: {},
  }

  const classifyCounts = new Map()
  for (const { id } of plan) {
    const row = perSource[id]
    if (!row) continue
    for (const s of row.samples) {
      const c = s.detail?.classify || "no-detail"
      classifyCounts.set(c, (classifyCounts.get(c) || 0) + 1)
    }
  }
  summary.counts = Object.fromEntries([...classifyCounts.entries()].sort((a, b) => b[1] - a[1]))

  // Persist report.
  const outDir = resolve("artifacts", "detail-check")
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, `detail-check-${nowIsoCompact()}.json`)
  writeFileSync(outPath, JSON.stringify({ summary, perSource }, null, 2))

  console.log(JSON.stringify({ summary, reportPath: outPath }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

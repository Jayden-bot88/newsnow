import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import process from "node:process"
import { createError } from "h3"

const MAX_URL_LENGTH = 2048

function parseRules(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

function matchesHostRules(host: string, rules: string[]) {
  const hostLower = host.toLowerCase()
  return rules.some((rule) => {
    if (rule.startsWith("*.") && rule.length > 2) {
      const suffix = rule.slice(1)
      return hostLower.endsWith(suffix)
    }
    if (rule.startsWith(".")) return hostLower.endsWith(rule)
    return hostLower === rule
  })
}

function getAllowlist(): string[] {
  return parseRules(process.env.DETAIL_ALLOWLIST)
}

function isPrivateIp(ip: string) {
  // This is intentionally strict: /api/detail is a high-risk SSRF surface.
  // Treat any non-public / special / private IP as blocked.
  const raw = ip.trim().toLowerCase()
  // Strip IPv6 zone id (e.g. fe80::1%lo0).
  const v = raw.split("%", 1)[0] || raw

  // ipv4 private + special-use ranges
  if (v.includes(".")) {
    const parts = v.split(".")
    if (parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p))) {
      const nums = parts.map(p => Number(p))
      if (nums.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return true

      const a = nums[0]!
      const b = nums[1]!
      const c = nums[2]!
      // const d = nums[3]!

      if (a === 0) return true // 0.0.0.0/8
      if (a === 10) return true // 10.0.0.0/8
      if (a === 127) return true // loopback
      if (a === 169 && b === 254) return true // link-local (incl. 169.254.169.254)
      if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
      if (a === 192 && b === 168) return true // 192.168.0.0/16
      if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 (CGNAT)
      if (a === 192 && b === 0 && c === 0) return true // 192.0.0.0/24
      if (a === 192 && b === 0 && c === 2) return true // TEST-NET-1
      if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 (benchmarking)
      if (a === 198 && b === 51 && c === 100) return true // TEST-NET-2
      if (a === 203 && b === 0 && c === 113) return true // TEST-NET-3
      if (a >= 224 && a <= 239) return true // multicast
      if (a >= 240) return true // reserved/broadcast
    }
  }

  // ipv6 localhost / unspecified / unique local / link-local / multicast / docs
  if (v === "::" || v === "::1") return true
  if (/^fc/i.test(v) || /^fd/i.test(v)) return true // fc00::/7
  if (/^fe80:/i.test(v)) return true // fe80::/10
  if (/^ff/i.test(v)) return true // ff00::/8 multicast
  if (/^2001:db8:/i.test(v)) return true // documentation

  return false
}

export async function assertSafeDetailUrl(rawUrl: string) {
  if (rawUrl.length > MAX_URL_LENGTH) {
    throw createError({ statusCode: 400, message: "URL too long" })
  }

  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw createError({ statusCode: 400, message: "Invalid url" })
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw createError({ statusCode: 400, message: "Invalid url" })
  }

  if (u.username || u.password) {
    throw createError({ statusCode: 400, message: "Blocked url" })
  }

  if (u.port && u.port !== "80" && u.port !== "443") {
    throw createError({ statusCode: 400, message: "Blocked port" })
  }

  const host = u.hostname
  if (!host) throw createError({ statusCode: 400, message: "Invalid url" })
  const hostLower = host.toLowerCase()

  // Hard-block localhost-ish hosts regardless of allowlist configuration.
  if (hostLower === "localhost" || hostLower.endsWith(".localhost")) {
    throw createError({ statusCode: 400, message: "Blocked host" })
  }

  // Metadata service is a common SSRF target.
  if (hostLower === "metadata.google.internal") {
    throw createError({ statusCode: 400, message: "Blocked host" })
  }

  const allowlist = getAllowlist()
  if (allowlist.length > 0) {
    const ok = matchesHostRules(hostLower, allowlist)
    if (!ok) throw createError({ statusCode: 400, message: "Blocked host" })
  }

  // Direct IP literal.
  if (isIP(host) && isPrivateIp(host)) {
    throw createError({ statusCode: 400, message: "Blocked host" })
  }

  // DNS resolve to prevent obvious SSRF.
  try {
    const res = await lookup(host, { all: true, verbatim: true })
    if (res.some(r => isPrivateIp(r.address))) {
      throw createError({ statusCode: 400, message: "Blocked host" })
    }
  } catch (e: any) {
    // If DNS fails, treat as invalid/unsafe.
    if (e?.statusCode) throw e
    throw createError({ statusCode: 400, message: "Unresolvable host" })
  }
}

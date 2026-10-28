import { getStore } from "@netlify/blobs"
import type { Config, Context } from "@netlify/functions"

/*
 * Cookie-free visit counter.
 * No IP address, user agent or cookie is stored. A visitor is a short hash of
 * (daily random salt + IP + user agent), so the same person counts once per day
 * and cannot be followed across days.
 * Each event is one blob whose KEY carries all the fields, so /api/stats can
 * aggregate by listing keys without downloading any blob.
 */

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|curl|wget|python|axios/i
const day = (d = new Date()) => d.toISOString().slice(0, 10)
const clean = (s: unknown, max = 80) =>
  typeof s === "string" ? s.slice(0, max).replace(/[^\w\-./:]/g, "") : ""

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function dailySalt(store: ReturnType<typeof getStore>, d: string) {
  const key = `salt/${d}`
  const existing = await store.get(key, { consistency: "strong" })
  if (existing) return existing
  const fresh = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("")
  await store.set(key, fresh, { onlyIfNew: true })
  return (await store.get(key, { consistency: "strong" })) || fresh
}

function device(ua: string, w: number) {
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet"
  if (/Mobi|iPhone|Android/i.test(ua) || (w && w < 640)) return "mobile"
  return "desktop"
}
function browser(ua: string) {
  if (/Edg\//.test(ua)) return "Edge"
  if (/OPR\/|Opera/.test(ua)) return "Opera"
  if (/Firefox\//.test(ua)) return "Firefox"
  if (/SamsungBrowser/.test(ua)) return "Samsung"
  if (/Chrome\//.test(ua)) return "Chrome"
  if (/Safari\//.test(ua)) return "Safari"
  return "Other"
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return new Response(null, { status: 405 })
  const ua = req.headers.get("user-agent") || ""
  if (!ua || BOT.test(ua)) return new Response(null, { status: 204 })

  let body: Record<string, unknown> = {}
  try {
    const text = await req.text()
    if (text.length > 2048) return new Response(null, { status: 413 })
    body = JSON.parse(text || "{}")
  } catch {
    return new Response(null, { status: 400 })
  }

  const type = body.t === "story" ? "story" : "pv"
  const path = clean(body.p, 60) || "/"
  const story = type === "story" ? clean(body.s, 40) : ""
  const w = typeof body.w === "number" ? body.w : 0
  let ref = ""
  try {
    if (typeof body.r === "string" && body.r) {
      const host = new URL(body.r).hostname.replace(/^www\./, "")
      if (host && host !== new URL(req.url).hostname) ref = clean(host, 60)
    }
  } catch {}

  context.waitUntil(
    (async () => {
      const store = getStore("analytics")
      const d = day()
      const salt = await dailySalt(store, d)
      const visitor = await sha(`${salt}|${context.ip}|${ua}`)
      const country = clean(context.geo?.country?.code, 2) || "XX"
      const fields = [Date.now(), visitor, type, path, story, ref, country, device(ua, w), browser(ua)]
      const key = `e/${d}/` + fields.map((f) => encodeURIComponent(String(f))).join("|") + "|" + Math.random().toString(36).slice(2, 6)
      await store.set(key, "1")
    })(),
  )
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } })
}

export const config: Config = { path: "/api/hit", method: ["POST"] }

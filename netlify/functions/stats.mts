import { getStore } from "@netlify/blobs"
import type { Config, Context } from "@netlify/functions"

/*
 * Private stats API. Requires "Authorization: Bearer <STATS_TOKEN>".
 * Aggregates events recorded by /api/hit by listing blob keys (no blob reads).
 */

const day = (d: Date) => d.toISOString().slice(0, 10)

function same(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

type Counter = Record<string, number>
const bump = (o: Counter, k: string, n = 1) => { if (k) o[k] = (o[k] || 0) + n }
const top = (o: Counter, n = 10) =>
  Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v }))

export default async (req: Request, _context: Context) => {
  const token = Netlify.env.get("STATS_TOKEN") || ""
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
  if (!token || !same(auth, token)) {
    return Response.json({ error: "Wrong or missing access key." }, { status: 401, headers: { "cache-control": "no-store" } })
  }

  const url = new URL(req.url)
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1), 90)
  const store = getStore("analytics")
  const now = Date.now()

  const series: { date: string; visitors: number; pageviews: number; stories: number }[] = []
  const pages: Counter = {}, stories: Counter = {}, refs: Counter = {}, countries: Counter = {},
    devices: Counter = {}, browsers: Counter = {}
  const hours = new Array(24).fill(0)
  const live = new Set<string>()
  let pageviews = 0, storyOpens = 0, visitorDays = 0
  const pvByVisitorDay: Counter = {}

  for (let i = days - 1; i >= 0; i--) {
    const date = day(new Date(now - i * 86400000))
    const { blobs } = await store.list({ prefix: `e/${date}/` })
    const uniq = new Set<string>()
    let pv = 0, st = 0
    for (const { key } of blobs) {
      const parts = key.slice(`e/${date}/`.length).split("|").map((s) => { try { return decodeURIComponent(s) } catch { return s } })
      const [ts, visitor, type, path, story, ref, country, dev, br] = parts
      const t = Number(ts)
      if (!visitor) continue
      const firstToday = !uniq.has(visitor)
      uniq.add(visitor)
      if (now - t < 5 * 60 * 1000) live.add(visitor)
      if (type === "story") {
        st++; bump(stories, story)
      } else {
        pv++; bump(pages, path); bump(pvByVisitorDay, date + visitor)
        bump(hours as unknown as Counter, String(new Date(t).getUTCHours()))
        if (ref) bump(refs, ref)
      }
      if (firstToday) { bump(countries, country); bump(devices, dev); bump(browsers, br) }
    }
    series.push({ date, visitors: uniq.size, pageviews: pv, stories: st })
    pageviews += pv; storyOpens += st; visitorDays += uniq.size
  }

  const sessions = Object.values(pvByVisitorDay)
  const bounce = sessions.length ? sessions.filter((n) => n === 1).length / sessions.length : 0

  return Response.json(
    {
      generatedAt: new Date(now).toISOString(),
      days,
      totals: {
        visitors: visitorDays,
        pageviews,
        storyOpens,
        live: live.size,
        pagesPerVisit: visitorDays ? pageviews / visitorDays : 0,
        bounceRate: bounce,
      },
      series,
      hoursUTC: hours,
      pages: top(pages),
      stories: top(stories, 15),
      referrers: top(refs),
      countries: top(countries, 12),
      devices: top(devices),
      browsers: top(browsers),
    },
    { headers: { "cache-control": "no-store" } },
  )
}

export const config: Config = { path: "/api/stats", method: ["GET"] }

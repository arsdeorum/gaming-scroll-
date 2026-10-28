# The Gaming Scroll

Static news site for regulated iGaming markets, deployed on Netlify from `main`.

| Path | What it is |
| --- | --- |
| `index.html` | Terminal page, served at `/terminal/` (rewrite in `netlify.toml`) |
| `daily/index.html` | Daily page, the home page: served at `/` (and still at `/daily/`) |
| `stats/index.html` | Private visitor stats at `/stats/` (needs the access key) |
| `t.js` | Cookie-free visit counter |
| `netlify/edge-functions/inject-tracker.ts` | Adds `t.js` to the two news pages at the edge, so the page files never need the tracker |
| `netlify/functions/hit.mts` | `POST /api/hit`, records one page view or story read |
| `manifest.webmanifest`, `icons/` | App manifest and icons, so the site can be installed on phones and desktops |
| `sw.js` | Service worker: pages load from the network first and work offline from the last copy |
| `netlify/functions/stats.mts` | `GET /api/stats?days=30`, aggregates for the stats page |

Updating the pages: replace `index.html` and `daily/index.html` as before. Nothing else is needed: the edge function adds the tracker and the app tags (manifest, icons, service worker) to both pages.

Privacy: no cookies, no IP addresses or user agents stored. A visitor is a hash of a daily random salt, IP and user agent, so each person counts once per day and cannot be followed across days. Do Not Track and Global Privacy Control turn counting off. Known bots are ignored.

The stats access key is the `STATS_TOKEN` environment variable in Netlify (Functions scope). Change it there and redeploy to rotate it.

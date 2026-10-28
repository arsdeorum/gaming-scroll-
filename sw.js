/* The Gaming Scroll service worker.
   Pages: network first, so readers always get the latest news; the last copy is used offline.
   Fonts and icons: cache first. The stats page and the API are never cached. */
const VERSION = "gs-v2";
const PAGES = ["/", "/terminal/"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PAGES.concat(["/manifest.webmanifest", "/icons/icon-192.png"]))).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/stats") || url.pathname === "/t.js") return;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !isFont) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(url.pathname.endsWith("/") ? url.pathname : req, copy)); }
      return r;
    }).catch(() => caches.match(url.pathname).then(r => r || caches.match(url.pathname + "/")).then(r => r || caches.match("/"))));
    return;
  }
  if (isFont || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return r;
    })));
  }
});

/* Service worker: offline support for the whole app.
 * Strategy:
 *  - Code (HTML/CSS/JS): network-first so deploys apply on the next load;
 *    falls back to the cache when offline.
 *  - Immutable content (Quran data, font, icons): cache-first.
 *  - Recitation audio: never intercepted — managed by the in-app
 *    "Offline audio" downloads (separate caches).
 */
const CACHE = "qm-app-v9";
const CORE = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "data/surahs.json",
  "assets/ManzoorNaskh.ttf",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];
const CACHE_FIRST = /(\/|^)(data\/chapters|assets|icons)\//;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    self.skipWaiting();
    await Promise.all(Array.from({ length: 114 }, (_, i) =>
      Promise.all([
        cache.add(`data/chapters/${i + 1}.json`).catch(() => {}),
        cache.add(new Request(`data/translit/${i + 1}.json`, { cache: "reload" })).catch(() => {}),
      ])
    ));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("qm-app-") && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.hostname.endsWith("alislam.cloud")) return;
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);

    if (cached && CACHE_FIRST.test(url.pathname)) return cached;

    try {
      const fresh = await fetch(event.request, { cache: "no-cache" });
      if (fresh && fresh.ok) cache.put(event.request, fresh.clone());
      return fresh;
    } catch (err) {
      if (cached) return cached;
      if (event.request.mode === "navigate" || event.request.destination === "document") {
        const fallback = await cache.match("./");
        if (fallback) return fallback;
      }
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});

/* Service worker: offline support for the whole app.
 * Strategy:
 *  - App shell (HTML/CSS/JS, font, icons) lives in a versioned cache that is
 *    replaced on each deploy. Install only precaches this small shell so it
 *    finishes in seconds — iOS kills long-running installs when the home
 *    screen app is backgrounded.
 *  - Quran data (chapters, transliteration, surah list) lives in a separate,
 *    persistent cache ("qm-data-v1") that survives app updates. The page fills
 *    it file-by-file in the background (resumable) and refreshes only files
 *    whose hash changed in data/manifest.json — see offlineSync() in app.js.
 *  - Code: network-first (with a timeout) so deploys apply on the next load;
 *    falls back to the cache when offline or on a very slow connection.
 *  - Data: cache-first from the persistent data cache; on a miss it is fetched
 *    and stored.
 *  - Requests carrying ?v=… are the page's own sync downloads: passed straight
 *    to the network so they always fetch the fresh file.
 *  - Recitation audio: never intercepted — managed by the in-app
 *    "Offline audio" downloads (separate caches).
 */
const SHELL = "qm-shell-v13";
const DATA = "qm-data-v1";
const CORE = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "assets/ManzoorNaskh.ttf",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];
const STATIC_FIRST = /(\/|^)(assets|icons)\//;
const DATA_PATH = /(\/|^)data\//;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(CORE.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => (n.startsWith("qm-app-") || n.startsWith("qm-shell-")) && n !== SHELL)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Network fetch that gives up after `ms` (the fetch keeps going in the
// background and still refreshes the cache when it lands).
function fetchWithTimeout(request, ms, onFresh) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error("timeout")); } }, ms);
    fetch(request, { cache: "no-cache" }).then((res) => {
      if (res && res.ok) onFresh(res.clone());
      if (!settled) { settled = true; clearTimeout(timer); resolve(res); }
    }).catch((err) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(err); }
    });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // the page's own sync downloads go straight to the network
  if (url.searchParams.has("v")) return;

  // Quran data: cache-first from the persistent data cache
  if (DATA_PATH.test(url.pathname) && !url.pathname.endsWith("/manifest.json")) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) await cache.put(url.pathname, fresh.clone());
        return fresh;
      } catch {
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(req, { ignoreSearch: true });

    if (cached && STATIC_FIRST.test(url.pathname)) return cached;

    try {
      return await fetchWithTimeout(req, NETWORK_TIMEOUT_MS, (res) => cache.put(req, res).catch(() => {}));
    } catch {
      if (cached) return cached;
      if (req.mode === "navigate" || req.destination === "document") {
        const fallback = (await cache.match("./")) || (await cache.match("index.html"));
        if (fallback) return fallback;
      }
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});

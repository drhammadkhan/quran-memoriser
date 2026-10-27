/* Service worker: precache the whole app (shell + Quran data) so it runs
 * entirely on the device after the first load. Verse audio is NOT precached —
 * it is managed separately by the in-app "Offline audio" downloads.
 */
const CACHE = "qm-app-v1";
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

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // precache all 114 chapter data files (generated list, no server needed)
    await Promise.all(Array.from({ length: 114 }, (_, i) =>
      cache.add(`data/chapters/${i + 1}.json`).catch(() => {})
    ));
    self.skipWaiting();
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
  // never intercept recitation audio (handled by the app's own audio caches)
  if (url.hostname.endsWith("alislam.cloud")) return;
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) {
      // refresh in the background for next time
      event.waitUntil(cache.add(event.request).catch(() => {}));
      return cached;
    }
    try {
      const fresh = await fetch(event.request);
      if (fresh.ok) cache.put(event.request, fresh.clone());
      return fresh;
    } catch (err) {
      const fallback = await cache.match("./");
      if (fallback) return fallback;
      throw err;
    }
  })());
});

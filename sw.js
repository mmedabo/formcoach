// Network-first service worker: always fetch the latest app files when online,
// fall back to the cache when offline. This ends the "hard-refresh to get updates"
// problem — a normal reload now always pulls fresh JS/CSS/HTML.
// Bump CACHE to force old caches to be cleared.
const CACHE = "fc-cache-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  let url; try{ url = new URL(req.url); }catch(_){ return; }
  if(url.origin !== self.location.origin) return;   // leave cross-origin (MediaPipe CDN) to the network
  e.respondWith(
    fetch(req)
      .then(res => { if(res && res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req))
  );
});

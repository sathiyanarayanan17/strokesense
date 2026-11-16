// StrokeSense service worker: makes the check work offline after the first visit.
// - Pages: network first, fall back to the cached copy when offline.
// - Next.js static assets, AI models and the WASM runtime: cache first (they are immutable per version).
// - Third-party requests (hospital search) are never cached.
const VERSION = "v2";
const PAGES = `strokesense-pages-${VERSION}`;
const ASSETS = `strokesense-assets-${VERSION}`;
const PRECACHE = ["/", "/exam", "/practice", "/report", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/models/") || url.pathname.startsWith("/mediapipe/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/exam"))),
    );
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

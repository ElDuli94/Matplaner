// Service worker: gjør siden rask og lar den fungere uten nett (f.eks. i butikken).
const VERSION = "v6";
const CACHE = `matplan-${VERSION}`;
const CORE = [
  "./",
  "index.html",
  "css/style.css?v=5",
  "js/app.js?v=5",
  "js/util.js",
  "js/shopping.js",
  "js/store.js",
  "js/firebase.js",
  "js/auth.js",
  "js/access.js",
  "js/firebase-config.js",
  "data/weeks.json",
  "manifest.webmanifest",
  "icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("matplan-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Nettverk først (alltid nyeste matplan), med lagret kopi som reserve når man er uten nett.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Firebase o.l. håndteres av nettleseren

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((r) => r || caches.match("index.html")))
  );
});

// Кэш оболочки приложения, чтобы оно открывалось быстро. Запросы к OpenAI не кэшируются.
const CACHE = "speakup-v3";
const FILES = ["./", "index.html", "style.css", "app.js", "tutor.js", "topics.js", "realtime.js", "robot.js", "manifest.webmanifest", "icons/apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Сначала сеть (чтобы обновления приходили сразу), при отсутствии сети — кэш.
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});

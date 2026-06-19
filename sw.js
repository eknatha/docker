// DockerLab service worker — precache the whole app for true offline use.
// After the first visit the site works with no network at all.
const CACHE = 'dockerlab-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/engine.js',
  './js/tools.js',
  './js/app.js',
  './js/data.js',
  './data/quiz.json',
  './data/cheatsheet.json',
  './data/modules.json',
  './data/best-practices.json',
  './data/library.json',
  './data/dca.json',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        // Runtime-cache same-origin successes (e.g. Google Fonts handled by browser cache).
        if (res.ok && new URL(e.request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});

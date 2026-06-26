// sw.js — offline-first cache. Bump CACHE on any asset change.
const CACHE = 'running-journal-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/components.css',
  './js/db.js',
  './js/util.js',
  './js/views.js',
  './js/logform.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  // network-first for Google Fonts so they cache after first online load
  if (request.url.includes('fonts.g')) {
    e.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }
  // cache-first for app shell
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

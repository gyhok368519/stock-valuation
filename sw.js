const CACHE_NAME = 'pb-calc-v2';
const ASSETS = [
  './PB_PE_ROE_calc.html',
  './manifest.json',
  './icon-512.jpg',
  './sw.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first strategy: always try server, fall back to cache
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).then(response => {
      // Cache the fresh response for offline use
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return response;
    }).catch(() => caches.match(e.request))
  );
});

const CACHE_NAME = 'wens-cache-v1';
const PRECACHE_URLS = [
  '/',                // root
  'index.html',
  'resources.html',
  'crypto.html',
  'WorldCurrentAffairs.html',
  'style.css',
  'script.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'files/sample.pdf',
  'files/example.zip'
];

// Install event - cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch event - cache first, then network
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResp => {
      if (cachedResp) return cachedResp;
      return fetch(event.request).then(networkResp => {
        if (!networkResp || networkResp.status !== 200 || networkResp.type === 'opaque') return networkResp;
        const respClone = networkResp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone));
        return networkResp;
      }).catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }));
    })
  );
});
const CACHE_NAME = 'lifeskills-cache-v1';
const urlsToCache = [
  './lifeskills.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Fetch cache first
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
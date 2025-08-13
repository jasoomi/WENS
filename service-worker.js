// service-worker.js
const CACHE_NAME = 'wens-cache-v1';
const PRECACHE_URLS = [
  '/',                // root (may help depending on host)
  'index.html',
  'learn.html',
  'resources.html',

  // Add other static assets you want cached by default:
  'style.css',
  'script.js',
  'manifest.json',

  // Icons (adjust names/paths if yours differ)
  'icons/icon-192.png',
  'icons/icon-512.png',

  // Example files folder (adjust/extend to match your files/)
  'files/sample.pdf',
  'files/example.zip'
];

// Install - pre-cache important assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean up old caches
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

// Fetch - cache-first, then network fallback (and cache new responses)
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  // Optionally: skip cross-origin requests (or handle them)
  // if (requestUrl.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cachedResp => {
      if (cachedResp) {
        // Return cached response quickly
        return cachedResp;
      }

      // Otherwise fetch from network and cache it for later
      return fetch(event.request).then(networkResp => {
        // Only cache successful responses
        if (!networkResp || networkResp.status !== 200 || networkResp.type === 'opaque') {
          return networkResp;
        }

        // Clone and put in cache
        const respClone = networkResp.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, respClone).catch(() => {/* ignore quota errors */});
        });

        return networkResp;
      }).catch(() => {
        // If both cache and network fail, optionally return an offline fallback.
        // You could return a custom offline HTML page if you have one:
        // return caches.match('offline.html');
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
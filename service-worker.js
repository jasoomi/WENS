// service-worker.js

const CACHE_NAME = 'wens-cache-v1';
const PRECACHE_URLS = [
  '/',                 // Root page
  'index.html',
  'resources.html',
  'crypto.html',
  'WorldCurrentAffairs.html',
  'ScienceTech.html',
  'style.css',         // Your CSS file
  'script.js',         // Your JS file
  'manifest.json',     // PWA manifest
  // Icons
  'icons/icon-192.png',
  'icons/icon-512.png',
  // Example downloadable files
  'files/sample.pdf',
  'files/example.zip'
];

// Install event: pre-cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate event: clean up old caches
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

// Fetch event: cache-first strategy with network fallback
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse; // Serve cached response
      }

      // Fetch from network and cache the response
      return fetch(event.request)
        .then(networkResponse => {
          // Only cache successful responses (status 200)
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }

          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone).catch(() => {/* Ignore quota errors */});
          });

          return networkResponse;
        })
        .catch(() => {
          // If both cache and network fail, show offline fallback
          if (event.request.destination === 'document') {
            return caches.match('offline.html') || new Response('<h1>Offline</h1><p>You are offline.</p>', {
              headers: { 'Content-Type': 'text/html' },
              status: 503
            });
          }
        });
    })
  );
});
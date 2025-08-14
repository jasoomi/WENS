/* ====== WENS Service Worker ====== */
const VERSION = 'v1.0.0';
const APP_SHELL = [
  '/',                 // if your site is in a subfolder, change this
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
  // add your CSS/JS bundles here, e.g.:
  // '/assets/app.css',
  // '/assets/app.js',
];

const SHELL_CACHE  = `wens-shell-${VERSION}`;
const RUNTIME_CACHE = `wens-runtime-${VERSION}`;

/* ---------- Install: precache app shell ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

/* ---------- Activate: cleanup old caches ---------- */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => ![SHELL_CACHE, RUNTIME_CACHE].includes(k))
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ==================================================
   Offline-first for navigations (SPA/MPA friendly)
   ================================================== */
self.addEventListener('fetch', event => {
  const req = event.request;

  // Handle navigations (address bar, links)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        // cache a copy of successful navigations
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, net.clone());
        return net;
      } catch (err) {
        // fall back to cache, then offline page
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match('/index.html');
        return cached || (await cache.match('/offline.html'));
      }
    })());
    return;
  }

  // For same-origin GET requests: stale-while-revalidate
  if (req.method === 'GET' && new URL(req.url).origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then(res => {
        cache.put(req, res.clone());
        return res;
      }).catch(() => undefined);
      return cached || fetchPromise || caches.match('/offline.html');
    })());
    return;
  }

  // For POST requests that fail (e.g., offline) -> queue for Background Sync
  if (req.method === 'POST') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        await queueFailedRequest(req);
        // register a sync to retry later
        if ('sync' in self.registration) {
          try { await self.registration.sync.register('sync-queue'); } catch {}
        }
        return new Response(
          JSON.stringify({ queued: true, message: 'Saved offline. Will sync later.' }),
          { status: 202, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })());
  }
});

/* ===========================
   Background Sync: replay POST
   =========================== */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(replayQueue());
  }
});

/* ==================================
   Periodic Background Sync: refresh
   ================================== */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-content') {
    event.waitUntil(refreshImportantResources());
  }
});

async function refreshImportantResources() {
  // re-fetch and refresh key JSON/API endpoints you want fresh
  const important = [
    // '/api/news',
    // '/api/lessons'
  ];
  const cache = await caches.open(RUNTIME_CACHE);
  await Promise.all(important.map(async url => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      await cache.put(url, res.clone());
    } catch {}
  }));
}

/* =======================
   Push Notifications
   ======================= */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'WENS';
  const options = {
    body: data.body || 'You have a new notification.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: data.url || '/'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(clients.openWindow(url));
});

/* ======================================================
   Tiny IndexedDB queue for failed POSTs (no dependency)
   ====================================================== */
const DB_NAME = 'wens-bg-sync';
const STORE = 'queue';

function idb() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function queueFailedRequest(request) {
  const clone = request.clone();
  const body = await clone.arrayBuffer();
  const db = await idb();
  const tx = db.transaction(STORE, 'readwrite');
  const headers = {};
  clone.headers.forEach((v, k) => headers[k] = v);

  const item = {
    url: clone.url,
    method: clone.method,
    headers,
    body: body ? new Uint8Array(body) : null,
    timestamp: Date.now()
  };
  tx.objectStore(STORE).add(item);
  await tx.done?.catch?.(() => {});
  db.close();
}

async function replayQueue() {
  const db = await idb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const all = await new Promise(resolve => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });

  for (const item of all) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body ? new Blob([item.body]) : undefined
      });
      store.delete(item.id);
    } catch {
      // leave in queue; will retry next sync
    }
  }
  await tx.done?.catch?.(() => {});
  db.close();
}
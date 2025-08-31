// Lightweight, versioned Service Worker with stale-while-revalidate
const SW_VERSION = 'v2.0.1';
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;
const PRECACHE = `precache-${SW_VERSION}`;

// Files we want available offline on first load
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './auth.js',
  './menu.js',
  './registros.js',
  './ver_consignas.js',
  './consigna_permanente.js',
  './consigna_temporal.js',
  './ingresar_informacion.js',
  './firebase-config.js',
  './menu.html',
  './registros.html',
  './ver_consignas.html',
  './ingresar_informacion.html',
  './add_cliente_unidad.html',
  './consigna_permanente.html',
  './consigna_temporal.html',
  './ingresar_consigna.html',
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![PRECACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Message handler to trigger manual updates from the page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: stale-while-revalidate for same-origin GET requests
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET and same-origin
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // HTML navigation requests: try network first, fallback to cache, then to index
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return resp;
        })
        .catch(async () => {
          const cache = await caches.open(RUNTIME_CACHE);
          return (await cache.match(request)) ||
                 (await caches.match('./index.html'));
        })
    );
    return;
  }

  // Others: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((resp) => {
        const copy = resp.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return resp;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

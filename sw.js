// Lightweight, versioned Service Worker with stale-while-revalidate & safe HTML fetch
// Sube esta versión cuando cambies cosas importantes para forzar actualización
const SW_VERSION = 'v2.0.2';
const PRECACHE = `precache-${SW_VERSION}`;
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;

// Recursos base disponibles offline desde el primer arranque
// (Ajusta esta lista a tus rutas reales)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './auth.js',
  './menu.js',
  './firebase-config.js',
  './menu.html',
];

// Instalación: precache de estáticos
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Activación: limpia caches antiguos y toma control
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

// Mensajes desde la página (p.ej., para activar al nuevo SW)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch handler:
// - Navegaciones (HTML): network-first con cache:'no-store' para evitar quedarse pegado en WebView
// - Otros (CSS/JS/img): stale-while-revalidate
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET y mismo origen
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Navegaciones: intenta red / si falla, cache / si no, index
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(new Request(request.url, { cache: 'no-store' }))
        .then((resp) => {
          const copy = resp.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return resp;
        })
        .catch(async () => {
          const cache = await caches.open(RUNTIME_CACHE);
          return (await cache.match(request)) || (await caches.match('./index.html'));
        })
    );
    return;
  }

  // Otros recursos: stale-while-revalidate
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

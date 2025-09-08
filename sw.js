/* sw.js — PWA multipágina con soporte offline y control de caché fino.
   - Respeta los query params (?v=) ⇒ no servimos JS viejos
   - No intercepta Firestore/Auth (para evitar “INTERNAL ASSERTION FAILED”)
   - Cachea imágenes de Firebase Storage para verlas offline
   - HTML: network-first con fallback a caché
   - Estáticos: stale-while-revalidate
*/
const SW_VERSION = 'v3.4.0';
const PRECACHE   = `precache-${SW_VERSION}`;
const RUNTIME    = `runtime-${SW_VERSION}`;

// Archivos locales críticos que queremos listos offline.
// Añade aquí cualquier archivo nuevo que publiques.
const PRECACHE_URLS = [
  // shell
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './firebase-config.js',
  './initFirebase.js',
  './ui.js',

  // Menú
  './menu.html',
  './menu.js',

  // Ingresar información
  './ingresar_informacion.html',
  './ingresar_informacion.js',

  // Consignas
  './ingresar_consigna.html',
  './consigna_temporal.html',   './consigna_temporal.js',
  './consigna_permanente.html', './consigna_permanente.js',

  // Listados
  './ver_consignas.html', './ver_consignas.js',
  './registros.html',     './registros.js',

  // Aux
  './add_cliente_unidad.html',
];

// Helpers
const isHTML   = (req) => req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
const isStatic = (url) => (/\.(?:js|css|mjs|wasm)$/i).test(url.pathname);
const isImage  = (url) => (/\.(?:png|jpg|jpeg|webp|gif|svg|ico)$/i).test(url.pathname);

// No interceptar estas APIs de Firebase (dejarlas ir directo a la red).
const FIREBASE_BLOCKLIST = new Set([
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'content-firebaseappcheck.googleapis.com',
  'www.googleapis.com',
]);

// CDNs que sí podemos cachear de forma segura (estáticos)
const THIRD_PARTY_STATIC = new Set([
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    // Si alguno falla, el install no revienta gracias a Promise.allSettled
    const results = await Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u)));
    // Opcional: log de fallos de precache (útil en desarrollo)
    results.forEach((r, i) => { if (r.status === 'rejected') console.warn('[SW] precache falló:', PRECACHE_URLS[i], r.reason); });
    // Activación inmediata del nuevo SW
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Limpieza de cachés viejas
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k === PRECACHE || k === RUNTIME) ? undefined : caches.delete(k))
    );
    // Tomar control de las páginas abiertas
    await self.clients.claim();
  })());
});

// Mensajes desde la página (para forzar activación)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 🚫 No interceptar APIs de Firebase (excepto imágenes de Storage más abajo)
  if (FIREBASE_BLOCKLIST.has(url.hostname)) return;

  // ✅ Cachear SOLO imágenes de Firebase Storage (útiles para ver offline)
  const isStorageHost = url.hostname === 'firebasestorage.googleapis.com' || url.hostname.endsWith('storage.googleapis.com');
  if (isStorageHost && isImage(url)) {
    event.respondWith(storageImageStrategy(request));
    return;
  }

  // 1) HTML → network-first (respetando ?v). Fallback: caché / index
  if (isHTML(request)) {
    event.respondWith(htmlNetworkFirst(request));
    return;
  }

  // 2) Estáticos de mismo origen (JS/CSS/IMG) → stale-while-revalidate (respetando ?v)
  if (url.origin === self.location.origin && (isStatic(url) || isImage(url))) {
    event.respondWith(staticStaleWhileRevalidate(request));
    return;
  }

  // 3) Estáticos de CDNs whitelisted → stale-while-revalidate
  if (THIRD_PARTY_STATIC.has(url.hostname)) {
    event.respondWith(staticStaleWhileRevalidate(request));
    return;
  }

  // 4) Resto: pasar directo (sin caché)
  // (por seguridad, para evitar sorpresas con endpoints no controlados)
});

/* ---------- Estrategias ---------- */

async function htmlNetworkFirst(request) {
  try {
    const fresh = await fetch(request);
    // ¡Respetamos query string! (sin ignoreSearch)
    const cache = await caches.open(PRECACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    // Offline: buscamos en caché exacta
    const cached = await caches.match(request);
    if (cached) return cached;
    // fallback al shell principal
    return caches.match('./index.html');
  }
}

async function staticStaleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request); // respeta ?v
  const networkFetch = fetch(request).then((resp) => {
    if (resp && (resp.status === 200 || resp.type === 'opaque')) {
      cache.put(request, resp.clone());
    }
    return resp;
  }).catch(() => undefined);

  return cached || networkFetch || new Response('', { status: 504 });
}

async function storageImageStrategy(request) {
  // También usamos stale-while-revalidate
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request); // respeta query
  const networkFetch = fetch(request).then((resp) => {
    if (resp && (resp.status === 200 || resp.type === 'opaque')) {
      cache.put(request, resp.clone());
    }
    return resp;
  }).catch(() => undefined);

  return cached || networkFetch || new Response('', { status: 504 });
}

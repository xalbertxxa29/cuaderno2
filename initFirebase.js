// initFirebase.js — Inicializa Firebase (compat), habilita persistencia offline
// y precalienta caché (consultas + imágenes vistas)

(function () {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  const auth    = firebase.auth();
  const db      = firebase.firestore();
  const storage = firebase.storage ? firebase.storage() : null; // puede no estar cargado

  // Habilitar persistencia (IndexedDB) y sincronización entre pestañas
  (async () => {
    try {
      await db.enablePersistence({ synchronizeTabs: true });
      console.log('[Firestore] persistencia habilitada');
    } catch (err) {
      console.warn('[Firestore] persistencia no disponible:', err && err.code, err);
    }
  })();

  // Precalienta caché: perfil del usuario + colecciones que usan tus pantallas
  async function warmFirestoreCache() {
    try {
      await new Promise((resolve) => {
        if (auth.currentUser) return resolve();
        const off = auth.onAuthStateChanged(() => { off(); resolve(); });
      });
      if (!auth.currentUser) return;

      const userId = auth.currentUser.email.split('@')[0];

      // Perfil
      const profRef = db.collection('USUARIOS').doc(userId);
      const profSnap =
        (await profRef.get({ source: 'server' }).catch(() => null)) ||
        (await profRef.get().catch(() => null));
      if (!profSnap || !profSnap.exists) return;
      const { CLIENTE, UNIDAD } = profSnap.data() || {};
      if (!CLIENTE || !UNIDAD) return;

      // Consultas típicas
      const per = await db.collection('CONSIGNA_PERMANENTE')
        .where('cliente','==',CLIENTE).where('unidad','==',UNIDAD).get();

      const tmp = await db.collection('CONSIGNA_TEMPORAL')
        .where('cliente','==',CLIENTE).where('unidad','==',UNIDAD).get();

      const cuaderno = await db.collection('CUADERNO')
        .where('cliente','==',CLIENTE).where('unidad','==',UNIDAD)
        .orderBy('timestamp','desc').limit(20).get();

      // Precarga de imágenes (el SW las cachea para offline)
      const urls = [];
      per.forEach(d => { const x=d.data(); if (x.fotoURL) urls.push(x.fotoURL); if (x.firmaURL) urls.push(x.firmaURL); });
      tmp.forEach(d => { const x=d.data(); if (x.fotoURL) urls.push(x.fotoURL); if (x.firmaURL) urls.push(x.firmaURL); });
      cuaderno.forEach(d => { const x=d.data(); if (x.fotoURL) urls.push(x.fotoURL); if (x.firmaURL) urls.push(x.firmaURL); });

      [...new Set(urls.filter(Boolean))].slice(0, 30).forEach(u => {
        try { fetch(u, { mode: 'no-cors', cache: 'force-cache' }); } catch {}
      });

      console.log('[warm] caché de consultas + imágenes lista');
    } catch (e) {
      console.warn('[warm] error', e);
    }
  }

  // Llamada automática (no hace nada si no hay usuario)
  if (document.readyState === 'complete') warmFirestoreCache();
  else window.addEventListener('load', () => warmFirestoreCache());

  // Exponer por si quieres llamarlo manualmente
  window.warmFirestoreCache = warmFirestoreCache;

  // Actualiza SW si existe
  // Forzar activación inmediata del SW nuevo y recarga 1 vez
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    // Si ya hay uno esperando, sáltate la espera
    if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');

    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && reg.waiting) {
          reg.waiting.postMessage('SKIP_WAITING');
        }
      });
    });
  });

  // Recarga automática cuando se active el nuevo SW
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}


  // Accesible en consola si hace falta
  window.fb = { auth, db, storage };
})();

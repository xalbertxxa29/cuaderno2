// ver_consignas.js — muestra consignas PERMANENTES y TEMPORALES (activas),
// ordenadas de la más reciente a la más antigua. Renderiza “Registrado por …”
// y si hay imagen adjunta la muestra (solo FOTO; nunca la firma).
document.addEventListener('DOMContentLoaded', () => {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();

  const container = document.getElementById('consignas-container');

  // ---------- Helpers de formato ----------
  const fmt = {
    pad: (n)=>String(n).padStart(2,'0'),
    date(ts){
      let d;
      if (ts && ts.toDate) d = ts.toDate();
      else if (ts instanceof Date) d = ts;
      else if (typeof ts === 'number') d = new Date(ts);
      else if (typeof ts === 'string') d = new Date(ts);
      else return '';
      return `${fmt.pad(d.getDate())}/${fmt.pad(d.getMonth()+1)}/${d.getFullYear()} ${fmt.pad(d.getHours())}:${fmt.pad(d.getMinutes())}`;
    },
    onlyDate(ts){
      let d;
      if (ts && ts.toDate) d = ts.toDate();
      else if (ts instanceof Date) d = ts;
      else if (typeof ts === 'number') d = new Date(ts);
      else if (typeof ts === 'string') d = new Date(ts);
      else return '';
      return `${fmt.pad(d.getDate())}/${fmt.pad(d.getMonth()+1)}/${d.getFullYear()}`;
    },
    millis(ts){
      if (!ts) return 0;
      if (ts.toMillis) return ts.toMillis();
      if (ts instanceof Date) return ts.getTime();
      return new Date(ts).getTime() || 0;
    }
  };

  // Devuelve el nombre del usuario que registró la consigna
  function resolveRegistrador(x){
    const byPair = `${(x.nombres||'').toString().trim()} ${(x.apellidos||'').toString().trim()}`.trim();
    if (byPair) return byPair;
    if (x.registradoPor?.nombre) return x.registradoPor.nombre;
    if (x.REGISTRADO_POR) return x.REGISTRADO_POR;
    if (x.usuario) return x.usuario;
    if (x.userId) return x.userId;
    return '—';
  }

  // Solo imagen de foto (nunca firma)
  function resolveFotoURL(x){
    return x.fotoURL || x.foto || null; // ignoramos firma/firmaURL
  }

  // Card renderer
  function cardConsigna({tipo, comentario, createdAt, fechaInicio, fechaFin, fotoURL, registradoPor}) {
    const root = document.createElement('div');
    root.className = 'list-card';
    root.innerHTML = `
      <div class="list-card-header">
        <span class="badge ${tipo==='PERMANENTE'?'badge-green':'badge-blue'}">${tipo}</span>
        <span class="muted">${createdAt ? fmt.date(createdAt) : ''}</span>
      </div>
      <div class="list-card-body">
        ${fechaInicio || fechaFin ? `
          <div class="row small muted">
            ${fechaInicio ? `<span><strong>Desde:</strong> ${fmt.onlyDate(fechaInicio)}</span>` : ''}
            ${fechaFin ? `<span style="margin-left:.5rem;"><strong>Hasta:</strong> ${fmt.onlyDate(fechaFin)}</span>` : ''}
          </div>` : ''
        }
        <div class="small muted" style="margin:.25rem 0 .5rem">
          <strong>Registrado por:</strong> ${registradoPor || '—'}
        </div>
        <p>${(comentario||'').replace(/\n/g,'<br>')}</p>
        ${fotoURL ? `<div class="thumb-wrap"><img src="${fotoURL}" alt="foto consigna"></div>` : ''}
      </div>
    `;
    return root;
  }

  // Temporal activa si hoy ∈ [inicio, fin] (fin inclusivo hasta 23:59:59.999)
  function isActiveTemporal(docData){
    const now = new Date();
    const start = docData.fechaInicio?.toDate ? docData.fechaInicio.toDate()
                : docData.fechaInicio ? new Date(docData.fechaInicio) : null;
    const endRaw = docData.fechaFin?.toDate ? docData.fechaFin.toDate()
                : docData.fechaFin ? new Date(docData.fechaFin) : null;
    const end = endRaw ? new Date(endRaw.getFullYear(), endRaw.getMonth(), endRaw.getDate(), 23,59,59,999) : null;
    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
  }

  async function loadConsignas(user) {
    container.innerHTML = '';
    if (!user) return;

    try {
      UI.showOverlay('Cargando consignas…');

      // Perfil para cliente/unidad
      const userId = user.email.split('@')[0];
      const prof   = await db.collection('USUARIOS').doc(userId).get();
      if (!prof.exists) { UI.hideOverlay(); UI.alert('Aviso','No se encontró el perfil del usuario.'); return; }
      const { CLIENTE, UNIDAD } = prof.data();

      // Consulta utilitaria (server → cache)
      async function q(col) {
        const ref = db.collection(col).where('cliente','==',CLIENTE).where('unidad','==',UNIDAD);
        return (await ref.get({source:'server'}).catch(()=>ref.get())).docs.map(d => ({ id:d.id, ...d.data() }));
      }

      const [permanentes, temporales] = await Promise.all([
        q('CONSIGNA_PERMANENTE'),
        q('CONSIGNA_TEMPORAL')
      ]);

      // Mapear
      const perList = permanentes.map(x => ({
        tipo: 'PERMANENTE',
        comentario: x.comentario || x.descripcion || '',
        createdAt: x.timestamp || x.createdAt || x.fecha || null,
        registradoPor: resolveRegistrador(x),
        fotoURL: resolveFotoURL(x)
      }));

      const tmpList = temporales
        .filter(isActiveTemporal)
        .map(x => ({
          tipo: 'TEMPORAL',
          comentario: x.comentario || x.descripcion || '',
          createdAt: x.timestamp || x.createdAt || x.fecha || null,
          fechaInicio: x.fechaInicio || null,
          fechaFin: x.fechaFin || null,
          registradoPor: resolveRegistrador(x),
          fotoURL: resolveFotoURL(x)
        }));

      // Unimos y ordenamos por fecha desc
      const all = [...perList, ...tmpList].sort((a,b) => fmt.millis(b.createdAt) - fmt.millis(a.createdAt));

      if (!all.length) {
        container.innerHTML = `<div class="empty-state">No hay consignas activas para tu unidad.</div>`;
      } else {
        const frag = document.createDocumentFragment();
        all.forEach(c => frag.appendChild(cardConsigna(c)));
        container.appendChild(frag);
      }
    } catch (err) {
      console.error('Error cargando consignas', err);
      UI.alert('Error', 'No fue posible cargar las consignas.');
    } finally {
      UI.hideOverlay();
    }
  }

  auth.onAuthStateChanged((u) => u ? loadConsignas(u) : (window.location.href='index.html'));
});

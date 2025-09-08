// ingresar_informacion.js (robusto si UI.js no está, y con firma/foto opcional)
document.addEventListener('DOMContentLoaded', () => {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();
  const storage = firebase.storage();

  // Wrapper de UI seguro
  const UX = {
    show: (m) => (window.UI && UI.showOverlay) ? UI.showOverlay(m) : void 0,
    hide: () => (window.UI && UI.hideOverlay) ? UI.hideOverlay() : void 0,
    alert: (t, m, cb) => (window.UI && UI.alert) ? UI.alert(t, m, cb) : (alert(`${t}\n\n${m||''}`), cb && cb())
  };

  // DOM
  const form         = document.getElementById('info-form');
  const comentarioEl = document.getElementById('comentario');
  const fotoInput    = document.getElementById('foto-input');
  const fotoPreview  = document.getElementById('foto-preview');
  const canvas       = document.getElementById('firma-canvas');
  const clearBtn     = document.getElementById('clear-firma');

  // Firma
  const sigPad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
  function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width  = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    sigPad.clear();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  clearBtn?.addEventListener('click', () => sigPad.clear());

  // Foto
  let pendingPhoto = null;
  fotoInput?.addEventListener('change', async () => {
    const file = fotoInput.files && fotoInput.files[0];
    if (!file) { pendingPhoto = null; fotoPreview.hidden = true; fotoPreview.src=''; return; }
    try {
      UX.show('Procesando imagen…');
      const opt = { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true, fileType: 'image/jpeg' };
      const out = await imageCompression(file, opt);
      pendingPhoto = out;
      const url = URL.createObjectURL(out);
      fotoPreview.src = url; fotoPreview.hidden = false;
    } catch (e) {
      console.error(e);
      UX.alert('Aviso', 'No se pudo procesar la imagen.');
      pendingPhoto = null; fotoPreview.hidden = true; fotoPreview.src='';
    } finally { UX.hide(); }
  });

  function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
  }
  async function uploadTo(path, blob) {
    const ref = storage.ref().child(path);
    await ref.put(blob);
    return await ref.getDownloadURL();
  }

  auth.onAuthStateChanged((user) => { if (!user) window.location.href='index.html'; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const comentario = (comentarioEl.value || '').trim();
    if (!comentario) { UX.alert('Aviso', 'Ingresa un comentario.'); return; }

    UX.show('Guardando registro…');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sesión inválida.');
      const userId = user.email.split('@')[0];

      const prof = await db.collection('USUARIOS').doc(userId).get();
      if (!prof.exists) throw new Error('No se encontró tu perfil.');
      const { CLIENTE, UNIDAD, NOMBRES, APELLIDOS } = prof.data();

      const stamp = Date.now();
      let fotoURL = null;
      if (pendingPhoto) {
        fotoURL = await uploadTo(`cuaderno/${CLIENTE}/${UNIDAD}/${userId}_${stamp}_foto.jpg`, pendingPhoto);
      }

      let firmaURL = null; let firmaData = null;
      if (!sigPad.isEmpty()) {
        const dataURL = sigPad.toDataURL('image/png');
        try { firmaURL = await uploadTo(`cuaderno/${CLIENTE}/${UNIDAD}/${userId}_${stamp}_firma.png`, dataURLtoBlob(dataURL)); }
        catch { firmaData = dataURL; } // Fallback ligero
      }

      await db.collection('CUADERNO').add({
        cliente: CLIENTE, unidad: UNIDAD,
        usuario: `${(NOMBRES||'').trim()} ${(APELLIDOS||'').trim()}`.trim() || userId,
        userId, comentario,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        ...(fotoURL ? { fotoURL } : {}),
        ...(firmaURL ? { firmaURL } : (firmaData ? { firma: firmaData } : {})),
      });

      UX.hide();
      UX.alert('Éxito', 'Registro guardado correctamente.', () => window.location.href='menu.html');
    } catch (err) {
      console.error(err);
      UX.hide();
      UX.alert('Error', err.message || 'No fue posible guardar el registro.');
    }
  });
});

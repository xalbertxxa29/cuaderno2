document.addEventListener('DOMContentLoaded', () => {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();
  const storage = firebase.storage();

  const UX = {
    show: (m) => (window.UI && UI.showOverlay) ? UI.showOverlay(m) : void 0,
    hide: () => (window.UI && UI.hideOverlay) ? UI.hideOverlay() : void 0,
    alert: (t, m, cb) => (window.UI && UI.alert) ? UI.alert(t, m, cb) : (alert(`${t}\n\n${m||''}`), cb && cb())
  };

  const form         = document.getElementById('consigna-temporal-form');
  const fechaIniEl   = document.getElementById('fecha-inicio');
  const fechaFinEl   = document.getElementById('fecha-fin');
  const comentarioEl = document.getElementById('comentario');
  const fotoInput    = document.getElementById('foto-input');
  const fotoPreview  = document.getElementById('foto-preview');
  const canvas       = document.getElementById('firma-canvas');
  const clearBtn     = document.getElementById('clear-firma');

  const sigPad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
  function resizeCanvas(){ const r=Math.max(window.devicePixelRatio||1,1); canvas.width=canvas.offsetWidth*r; canvas.height=canvas.offsetHeight*r; canvas.getContext('2d').scale(r,r); sigPad.clear();}
  window.addEventListener('resize', resizeCanvas); resizeCanvas();
  clearBtn?.addEventListener('click', () => sigPad.clear());

  let pendingPhoto=null;
  fotoInput?.addEventListener('change', async () => {
    const f = fotoInput.files && fotoInput.files[0];
    if(!f){ pendingPhoto=null; fotoPreview.hidden=true; fotoPreview.src=''; return; }
    try{
      UX.show('Procesando imagen…');
      const opt={maxSizeMB:0.5,maxWidthOrHeight:1280,useWebWorker:true,fileType:'image/jpeg'};
      pendingPhoto = await imageCompression(f,opt);
      const url=URL.createObjectURL(pendingPhoto); fotoPreview.src=url; fotoPreview.hidden=false;
    }catch(e){ console.error(e); UX.alert('Aviso','No se pudo procesar la imagen.'); pendingPhoto=null; fotoPreview.hidden=true; fotoPreview.src=''; }
    finally{ UX.hide(); }
  });

  function dataURLtoBlob(u){const a=u.split(','),m=a[0].match(/:(.*?);/)[1];const b=atob(a[1]);let n=b.length;const x=new Uint8Array(n);while(n--)x[n]=b.charCodeAt(n);return new Blob([x],{type:m});}
  async function uploadTo(p,blob){ const ref=storage.ref().child(p); await ref.put(blob); return await ref.getDownloadURL(); }

  auth.onAuthStateChanged((user)=>{ if(!user) window.location.href='index.html'; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fIni=(fechaIniEl.value||'').trim(), fFin=(fechaFinEl.value||'').trim();
    const comentario=(comentarioEl.value||'').trim();

    if(!fIni || !fFin){ UX.alert('Aviso','Selecciona fecha de inicio y fin.'); return; }
    if(new Date(fIni) > new Date(fFin)){ UX.alert('Aviso','La fecha de inicio no puede ser mayor que la de fin.'); return; }
    if(!comentario){ UX.alert('Aviso','Ingresa comentarios de la consigna.'); return; }

    UX.show('Guardando consigna…');
    try{
      const user=auth.currentUser; if(!user) throw new Error('Sesión inválida.');
      const userId=user.email.split('@')[0];
      const prof=await db.collection('USUARIOS').doc(userId).get();
      if(!prof.exists) throw new Error('No se encontró tu perfil.');
      const {CLIENTE,UNIDAD,NOMBRES,APELLIDOS}=prof.data();
      const stamp=Date.now();

      let fotoURL=null;
      if(pendingPhoto) fotoURL = await uploadTo(`consignas/temporal/${CLIENTE}/${UNIDAD}/${userId}_${stamp}_foto.jpg`, pendingPhoto);

      let firmaURL=null,firmaData=null;
      if(!sigPad.isEmpty()){
        const dataURL=sigPad.toDataURL('image/png');
        try{ firmaURL=await uploadTo(`consignas/temporal/${CLIENTE}/${UNIDAD}/${userId}_${stamp}_firma.png`, dataURLtoBlob(dataURL)); }
        catch{ firmaData=dataURL; }
      }

      await db.collection('CONSIGNA_TEMPORAL').add({
        cliente:CLIENTE, unidad:UNIDAD,
        nombres:(NOMBRES||'').toUpperCase(), apellidos:(APELLIDOS||'').toUpperCase(),
        comentario, fechaInicio:fIni, fechaFin:fFin,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        ...(fotoURL ? { fotoURL } : {}),
        ...(firmaURL ? { firmaURL } : (firmaData ? { firma: firmaData } : {})),
      });

      UX.hide();
      UX.alert('Éxito','Consigna temporal guardada.', ()=>window.location.href='menu.html');
    }catch(err){
      console.error(err); UX.hide(); UX.alert('Error', err.message || 'No fue posible guardar la consigna.');
    }
  });
});

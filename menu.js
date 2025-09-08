document.addEventListener("DOMContentLoaded", () => {
  if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
  const auth = firebase.auth();
  const db   = firebase.firestore();

  const emailFromId = (id) => `${id}@liderman.com.pe`;
  const sanitizeId  = (raw) => raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');

  // ====== Refs ======
  const userDetailsP    = document.getElementById('user-details');
  const userClientUnitP = document.getElementById('user-client-unit');
  const logoutBtn       = document.getElementById('logout-btn');

  const relevoModal     = document.getElementById('relevo-modal-overlay');
  const relevoBtn       = document.getElementById('relevo-btn');
  const relevoCancelBtn = document.getElementById('relevo-cancel-btn');
  const relevoForm      = document.getElementById('relevo-form');
  const relevoCanvas    = document.getElementById('relevo-firma-canvas');
  const relevoSignaturePad = new SignaturePad(relevoCanvas, { backgroundColor: 'rgb(255,255,255)' });

  const btnAbrirCU      = document.getElementById('relevo-crear-usuario-btn');
  const modalCU         = document.getElementById('crear-usuario-modal');
  const formCU          = document.getElementById('crear-usuario-form');
  const btnCUCancel     = document.getElementById('cu-cancel');

  const cuClienteInput  = document.getElementById('cu-cliente-input');
  const cuClienteList   = document.getElementById('cu-cliente-list');
  const cuUnidadInput   = document.getElementById('cu-unidad-input');
  const cuUnidadList    = document.getElementById('cu-unidad-list');

  // ====== Estado de sesión ======
  let usuarioSalienteData = null;
  auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    try {
      const userId  = user.email.split('@')[0];
      const userDoc = await db.collection('USUARIOS').doc(userId).get();
      if (userDoc.exists) {
        usuarioSalienteData = { ...userDoc.data(), id: userId };
        userDetailsP.textContent    = `${usuarioSalienteData.NOMBRES} ${usuarioSalienteData.APELLIDOS}`;
        userClientUnitP.textContent = `${usuarioSalienteData.CLIENTE} - ${usuarioSalienteData.UNIDAD}`;
      } else {
        userDetailsP.textContent = user.email;
      }
    } catch (e) {
      console.error('Error al obtener datos del usuario:', e);
      userDetailsP.textContent = user.email;
    }
  });

  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    auth.signOut().then(() => window.location.href = 'index.html');
  });

  // ====== Relevo ======
  function resizeRelevoCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    relevoCanvas.width  = relevoCanvas.offsetWidth  * ratio;
    relevoCanvas.height = relevoCanvas.offsetHeight * ratio;
    relevoCanvas.getContext('2d').scale(ratio, ratio);
    relevoSignaturePad.clear();
  }

  relevoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    relevoModal.style.display = 'flex';
    resizeRelevoCanvas();
  });

  document.getElementById('relevo-clear-firma').addEventListener('click', () => relevoSignaturePad.clear());
  relevoCancelBtn.addEventListener('click', () => {
    relevoForm.reset();
    relevoSignaturePad.clear();
    relevoModal.style.display = 'none';
  });

  // Auth secundario para validar/crear sin tocar sesión actual
  let secondaryApp = null;
  const getSecondaryAuth = () => {
    if (!secondaryApp) {
      secondaryApp = firebase.apps.find(a => a.name === 'secondary') ||
                     firebase.initializeApp(firebaseConfig, 'secondary');
    }
    return secondaryApp.auth();
  };

  // Guardar Relevo
 // Guardar Relevo
 relevoForm.addEventListener('submit', async (e) => {
   e.preventDefault();

   const idEntranteRaw = document.getElementById('relevo-id').value;
   const idEntrante   = sanitizeId(idEntranteRaw);
   const passEntrante = document.getElementById('relevo-password').value;
   const comentario   = document.getElementById('relevo-comentario').value;

   if (!idEntrante || !passEntrante || !comentario || relevoSignaturePad.isEmpty()) {
     UI.alert('Campos incompletos', 'Completa todos los campos, incluida la firma.');
     return;
   }

   UI.showOverlay('Procesando relevo…');
   try {
     // 1. Obtener datos del usuario entrante desde Firestore.
     const docEntrante = await db.collection('USUARIOS').doc(idEntrante).get();
     if (!docEntrante.exists) {
       throw new Error('El ID del usuario entrante no existe.');
     }
     const userIn = docEntrante.data();

     // 2. Validar que el usuario entrante pertenezca al mismo CLIENTE y UNIDAD.
     if (userIn.CLIENTE !== usuarioSalienteData.CLIENTE || userIn.UNIDAD !== usuarioSalienteData.UNIDAD) {
       throw new Error('El usuario entrante no pertenece al mismo cliente y unidad.');
     }

     // 3. ¡NUEVO! Validar que el ESTADO del usuario entrante sea "ACTIVO".
     if (userIn.ESTADO !== 'ACTIVO') {
       throw new Error(`El usuario entrante se encuentra ${userIn.ESTADO}. No se puede realizar el relevo.`);
     }

     // 4. Guardar el registro del relevo en la colección 'CUADERNO'.
     //    Esto se hace ANTES de cambiar la sesión para asegurar que la acción quede registrada por el usuario saliente.
     const firmaURL = relevoSignaturePad.toDataURL('image/png');
     await db.collection('CUADERNO').add({
       tipoRegistro: 'RELEVO',
       cliente: usuarioSalienteData.CLIENTE,
       unidad:  usuarioSalienteData.UNIDAD,
       timestamp: firebase.firestore.FieldValue.serverTimestamp(),
       comentario,
       firma: firmaURL,
       usuarioSaliente: { id: usuarioSalienteData.id, nombre: `${usuarioSalienteData.NOMBRES} ${usuarioSalienteData.APELLIDOS}` },
       usuarioEntrante: { id: idEntrante, nombre: `${userIn.NOMBRES} ${userIn.APELLIDOS}` }
     });

     // 5. ¡CAMBIO CLAVE! Iniciar sesión con el usuario entrante.
     //    Esto reemplaza la sesión activa del usuario saliente por la del entrante.
     await auth.signInWithEmailAndPassword(emailFromId(idEntrante), passEntrante);

     // 6. Si todo fue exitoso, recargar la página para reflejar la nueva sesión.
     UI.hideOverlay();
     UI.alert('Éxito', 'Relevo completado correctamente. La sesión ha sido actualizada.', () => {
       location.reload();
     });

   } catch (err) {
     console.error('Error en relevo:', err);
     UI.hideOverlay();
     const msg = (err && err.code && ['auth/wrong-password','auth/user-not-found','auth/invalid-credential'].includes(err.code))
       ? 'Credenciales del usuario entrante incorrectas. Verifique ID y contraseña.'
       : (err.message || 'Ocurrió un error al guardar el relevo.');
     UI.alert('Error en Relevo', msg);
   }
 });

  // ====== Crear Usuario desde Relevo (sub-modal con dropdowns buscables) ======
  const openCU  = () => { modalCU.style.display = 'flex'; cargarClientesCU(); };
  const closeCU = () => { modalCU.style.display = 'none'; formCU.reset(); cuUnidadInput.disabled = true; };

  if (btnAbrirCU) {
    btnAbrirCU.setAttribute('type', 'button');
    btnAbrirCU.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCU();
    });
  }

  btnCUCancel.addEventListener('click', closeCU);
  modalCU.addEventListener('click', (e) => { if (e.target === modalCU) closeCU(); });

  async function cargarClientesCU() {
    try {
      UI.showOverlay('Cargando clientes…');
      const snap = await db.collection('CLIENTE_UNIDAD').get();
      const clientes = snap.docs.map(d => d.id).sort();
      UI.createSearchableDropdown(cuClienteInput, cuClienteList, clientes, (clienteSel) => {
        cuUnidadInput.disabled = false;
        cuUnidadInput.value = '';
        cuUnidadInput.placeholder = 'Buscar o seleccionar unidad...';
        cargarUnidadesCU(clienteSel);
      });
    } catch (e) {
      console.error('Error cargando clientes', e);
    } finally { UI.hideOverlay(); }
  }

  async function cargarUnidadesCU(cliente) {
    try {
      UI.showOverlay('Cargando unidades…');
      const d = await db.collection('CLIENTE_UNIDAD').doc(cliente).get();
      const unidades = (d.exists ? (d.data().unidades || []) : []).sort();
      UI.createSearchableDropdown(cuUnidadInput, cuUnidadList, unidades);
    } catch (e) {
      console.error('Error cargando unidades', e);
    } finally { UI.hideOverlay(); }
  }

  document.addEventListener('click', () => {
    cuClienteList?.classList.remove('show');
    cuUnidadList?.classList.remove('show');
  });

  formCU.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id   = sanitizeId(document.getElementById('cu-id').value);
    const nom  = document.getElementById('cu-nombres').value.trim();
    const ape  = document.getElementById('cu-apellidos').value.trim();
    const cli  = cuClienteInput.value.trim();
    const uni  = cuUnidadInput.value.trim();
    const p1   = document.getElementById('cu-pass').value;
    const p2   = document.getElementById('cu-pass2').value;

    if (!id || !nom || !ape || !cli || !uni || !p1 || !p2) { UI.alert('Aviso', 'Completa todos los campos.'); return; }
    if (p1 !== p2) { UI.alert('Aviso', 'Las contraseñas no coinciden.'); return; }

    UI.showOverlay('Creando usuario…');
    const secAuth = getSecondaryAuth();
    try {
      await secAuth.createUserWithEmailAndPassword(emailFromId(id), p1);
      await db.collection('USUARIOS').doc(id).set({
        NOMBRES: nom.toUpperCase(),
        APELLIDOS: ape.toUpperCase(),
        CLIENTE: cli.toUpperCase(),
        UNIDAD:  uni.toUpperCase(),
        TIPO:    'AGENTE',
        ESTADO:  'INACTIVO'
      }, { merge: true });
      await secAuth.signOut();

      UI.hideOverlay();
      document.getElementById('relevo-id').value = id;
      UI.alert('Usuario creado', 'Ahora ingresa su contraseña para completar el relevo.', () => closeCU());
    } catch (err) {
      console.error('Error creando usuario:', err);
      UI.hideOverlay();
      const msg = (err && err.code === 'auth/email-already-in-use') ? 'Ese ID ya está registrado.'
                : (err && err.code === 'auth/weak-password')         ? 'La contraseña debe tener al menos 6 caracteres.'
                : 'Ocurrió un error al crear el usuario.';
      UI.alert('Error', msg);
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
    // Inicializar Firebase y obtener referencias a los servicios
    if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- Variables globales para datos y elementos del DOM ---
    let usuarioSalienteData = null;

    // Elementos del DOM
    const userDetailsP = document.getElementById('user-details');
    const userClientUnitP = document.getElementById('user-client-unit');
    const logoutBtn = document.getElementById('logout-btn');
    const relevoModal = document.getElementById('relevo-modal-overlay');
    const relevoBtn = document.getElementById('relevo-btn');
    const relevoCancelBtn = document.getElementById('relevo-cancel-btn');
    const relevoForm = document.getElementById('relevo-form');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const relevoCanvas = document.getElementById('relevo-firma-canvas');
    const relevoSignaturePad = new SignaturePad(relevoCanvas, {
        backgroundColor: 'rgb(255, 255, 255)'
    });

    // --- Función para mostrar Modales Personalizados ---
    function showCustomAlert(title, message, onOkCallback) {
        if (document.querySelector('.modal-overlay#custom-alert')) return;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'custom-alert';
        overlay.style.display = 'flex';
        const box = document.createElement('div');
        box.className = 'modal-box';
        box.innerHTML = `
            <h3 style="margin-top: 0;">${title}</h3>
            <p>${message}</p>
            <button id="modal-ok-btn" class="btn-primary" style="width: auto; padding: 10px 30px;">Aceptar</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        document.getElementById('modal-ok-btn').addEventListener('click', () => {
            document.body.removeChild(overlay);
            if (onOkCallback) {
                onOkCallback();
            }
        });
    }

    // --- Lógica Principal de la Página de Menú ---
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const userId = user.email.split('@')[0];
                const userDoc = await db.collection('USUARIOS').doc(userId).get();
                if (userDoc.exists) {
                    usuarioSalienteData = userDoc.data();
                    usuarioSalienteData.id = userId;
                    userDetailsP.textContent = `${usuarioSalienteData.NOMBRES} ${usuarioSalienteData.APELLIDOS}`;
                    userClientUnitP.textContent = `${usuarioSalienteData.CLIENTE} - ${usuarioSalienteData.UNIDAD}`;
                } else {
                    userDetailsP.textContent = user.email;
                }
            } catch (error) {
                console.error("Error al obtener datos del usuario:", error);
                userDetailsP.textContent = user.email;
            }
        } else {
            window.location.href = 'index.html';
        }
    });
    
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        auth.signOut().then(() => {
            window.location.href = 'index.html';
        }).catch((error) => console.error('Error al cerrar sesión:', error));
    });

    // --- Lógica del Modal de Relevo ---
    function resizeRelevoCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        relevoCanvas.width = relevoCanvas.offsetWidth * ratio;
        relevoCanvas.height = relevoCanvas.offsetHeight * ratio;
        relevoCanvas.getContext('2d').scale(ratio, ratio);
        relevoSignaturePad.clear();
    }
    
    relevoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        relevoModal.style.display = 'flex';
        resizeRelevoCanvas();
    });

    relevoCancelBtn.addEventListener('click', () => {
        relevoForm.reset();
        relevoSignaturePad.clear();
        relevoModal.style.display = 'none';
    });

    document.getElementById('relevo-clear-firma').addEventListener('click', () => {
        relevoSignaturePad.clear();
    });

    relevoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idEntrante = document.getElementById('relevo-id').value;
        const passEntrante = document.getElementById('relevo-password').value;
        const comentario = document.getElementById('relevo-comentario').value;

        if (!idEntrante || !passEntrante || !comentario || relevoSignaturePad.isEmpty()) {
            showCustomAlert('Campos Incompletos', 'Por favor, complete todos los campos, incluyendo la firma.');
            return;
        }

        loadingOverlay.hidden = false;
        const datosUsuarioSaliente = { ...usuarioSalienteData };

        try {
            const userEntranteDoc = await db.collection('USUARIOS').doc(idEntrante).get();
            if (!userEntranteDoc.exists) {
                throw new Error("El ID del usuario entrante no existe.");
            }
            const usuarioEntranteData = userEntranteDoc.data();

            // --- INICIO: Nueva Validación de Cliente y Unidad ---
            if (usuarioEntranteData.CLIENTE !== datosUsuarioSaliente.CLIENTE || usuarioEntranteData.UNIDAD !== datosUsuarioSaliente.UNIDAD) {
                throw new Error('El usuario entrante no pertenece al mismo cliente y unidad. Relevo no permitido.');
            }
            // --- FIN: Nueva Validación de Cliente y Unidad ---

            const emailEntrante = `${idEntrante}@liderman.com.pe`;
            const userCredentialEntrante = await auth.signInWithEmailAndPassword(emailEntrante, passEntrante);
            
            const firmaURL = relevoSignaturePad.toDataURL('image/png');
            await db.collection('CUADERNO').add({
                tipoRegistro: 'RELEVO',
                cliente: datosUsuarioSaliente.CLIENTE,
                unidad: datosUsuarioSaliente.UNIDAD,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                comentario: comentario,
                firma: firmaURL,
                usuarioSaliente: {
                    id: datosUsuarioSaliente.id,
                    nombre: `${datosUsuarioSaliente.NOMBRES} ${datosUsuarioSaliente.APELLIDOS}`
                },
                usuarioEntrante: {
                    id: userCredentialEntrante.user.email.split('@')[0],
                    nombre: `${usuarioEntranteData.NOMBRES} ${usuarioEntranteData.APELLIDOS}`
                }
            });

            showCustomAlert('Éxito', 'Relevo completado con éxito. La página se recargará.', () => {
                window.location.reload();
            });

        } catch (error) {
            console.error("Error en el proceso de relevo:", error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                 showCustomAlert('Error de Autenticación', 'Credenciales del usuario entrante incorrectas. Verifique el ID y la contraseña.');
            } else {
                 showCustomAlert('Error en Relevo', error.message);
            }
        } finally {
            loadingOverlay.hidden = true;
        }
    });
});
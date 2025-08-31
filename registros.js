document.addEventListener("DOMContentLoaded", () => {
    if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Elementos del DOM
    const registrosContainer = document.getElementById("registros-container");
    const loadingOverlay = document.getElementById("loadingOverlay");
    const fechaFiltroInput = document.getElementById("fecha-filtro");
    const buscarBtn = document.getElementById("buscar-btn");
    const limpiarBtn = document.getElementById("limpiar-btn");
    const nextBtn = document.getElementById("next-btn");
    const prevBtn = document.getElementById("prev-btn");

    // Estado de paginación
    let firstVisible = null;
    let lastVisible = null;
    let currentUserData = null;
    const PAGE_SIZE = 10;
    
    // Almacenamos los primeros documentos de cada página para el botón "Anterior"
    let pageStack = []; 

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const userId = user.email.split('@')[0];
            const userDoc = await db.collection('USUARIOS').doc(userId).get();
            if (userDoc.exists) {
                currentUserData = userDoc.data();
                if (!currentUserData.CLIENTE || !currentUserData.UNIDAD) {
                     registrosContainer.innerHTML = "<p style='color:white;'>Error: Faltan datos de CLIENTE o UNIDAD en el perfil del usuario.</p>";
                     return;
                }
                cargarRegistros(); // Carga inicial
            } else {
                registrosContainer.innerHTML = "<p>Error: Perfil de usuario no encontrado.</p>";
            }
        } else {
            window.location.href = 'index.html';
        }
    });

    const cargarRegistros = async (direction = 'inicio') => {
        if (!currentUserData) return;
        loadingOverlay.hidden = false;

        try {
            const { CLIENTE, UNIDAD } = currentUserData;
            let query = db.collection('CUADERNO')
                .where('cliente', '==', CLIENTE)
                .where('unidad', '==', UNIDAD)
                .orderBy('timestamp', 'desc');

            const fecha = fechaFiltroInput.value;
            if (fecha) {
                const startDate = new Date(fecha + 'T00:00:00');
                const endDate = new Date(fecha + 'T23:59:59');
                query = query.where('timestamp', '>=', startDate).where('timestamp', '<=', endDate);
            }

            if (direction === 'next' && lastVisible) {
                pageStack.push(firstVisible); // Guardar el inicio de la página actual
                query = query.startAfter(lastVisible);
            } else if (direction === 'prev') {
                const lastFirst = pageStack.pop(); // Obtener el inicio de la página anterior
                query = query.startAt(lastFirst);
            }
            
            const snapshot = await query.limit(PAGE_SIZE).get();
            
            registrosContainer.innerHTML = '';

            if (snapshot.empty) {
                registrosContainer.innerHTML = '<p style="color:white; text-align:center;">No se encontraron registros.</p>';
                nextBtn.disabled = true;
                prevBtn.disabled = pageStack.length === 0;
                return;
            }

            firstVisible = snapshot.docs[0];
            lastVisible = snapshot.docs[snapshot.docs.length - 1];

            snapshot.forEach(doc => {
                registrosContainer.innerHTML += renderRegistroCard(doc.data());
            });

            const checkNextSnapshot = await query.startAfter(lastVisible).limit(1).get();
            nextBtn.disabled = checkNextSnapshot.empty;
            prevBtn.disabled = pageStack.length === 0;

        } catch (error) {
            console.error("Error detallado al cargar registros: ", error); // Log más detallado
            registrosContainer.innerHTML = '<p style="color:red; text-align:center;">Error al cargar los datos. Revisa la consola (F12) para más detalles.</p>';
        } finally {
            loadingOverlay.hidden = true;
        }
    };

    const renderRegistroCard = (data) => {
        const fecha = data.timestamp ? data.timestamp.toDate().toLocaleString('es-PE', { timeZone: 'America/Lima' }) : 'N/A';
        if (data.tipoRegistro === 'RELEVO') {
            return `
                <div class="registro-card" style="border-left: 5px solid #ff9800;">
                    <p><strong>Fecha:</strong> ${fecha}</p>
                    <p><strong>Tipo de Registro:</strong> RELEVO DE TURNO</p>
                    <p><strong>Turno Entregado por:</strong> ${data.usuarioSaliente.nombre}</p>
                    <p><strong>Turno Recibido por:</strong> ${data.usuarioEntrante.nombre}</p>
                    <p><strong>Comentario:</strong><br>${data.comentario}</p>
                    <p><strong>Firma de Conformidad:</strong></p>
                    <img src="${data.firma}" alt="Firma de relevo" style="max-width: 300px; border-radius: 0.5rem; margin-top: 0.5rem; border: 1px solid #ccc;">
                </div>
            `;
        }
        
        
        let fotoHTML = '';
        if (data.fotoURL) {
            const urlOriginal = data.fotoURL;
            try {
                const extensionIndex = urlOriginal.lastIndexOf('.');
                const insertIndex = urlOriginal.indexOf('?');
                if (extensionIndex > 0 && insertIndex > extensionIndex) {
                    const base = urlOriginal.substring(0, extensionIndex);
                    const extension = urlOriginal.substring(extensionIndex, insertIndex);
                    const token = urlOriginal.substring(insertIndex);
                    const urlMiniatura = `${base}_400x400${extension}${token}`;
                    fotoHTML = `<img class="thumb" src="${urlMiniatura}" data-full="${urlOriginal}" alt="Foto de registro">`;
                } else {
                    throw new Error("Formato de URL no esperado.");
                }
            } catch (e) {
                fotoHTML = `<img class="thumb" src="${urlOriginal}" data-full="${urlOriginal}" alt="Foto de registro">`;
            }
        }

        const nombreCompleto = `${data.nombres || ''} ${data.apellidos || ''}`.trim();
        return `
            <div class="registro-card">
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Registrado por:</strong> ${nombreCompleto}</p>
                <p><strong>Comentario:</strong><br>${data.comentario}</p>
                ${fotoHTML}
            </div>
        `;
    };

    const resetAndLoad = () => {
        pageStack = [];
        firstVisible = null;
        lastVisible = null;
        cargarRegistros('inicio');
    };
    
    buscarBtn.addEventListener('click', resetAndLoad);
    limpiarBtn.addEventListener('click', () => {
        fechaFiltroInput.value = '';
        resetAndLoad();
    });
    nextBtn.addEventListener('click', () => cargarRegistros('next'));
    prevBtn.addEventListener('click', () => cargarRegistros('prev'));
});

// --- Lightbox handlers ---
document.addEventListener('click', (e) => {
    const img = e.target.closest('img.thumb');
    if (img) {
        const full = img.getAttribute('data-full') || img.src;
        const lb = document.getElementById('imageLightbox');
        const lbImg = document.getElementById('lightboxImg');
        lbImg.src = full;
        lb.removeAttribute('hidden');
    }
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('lightbox-close') || e.target.classList.contains('lightbox-backdrop')) {
        const lb = document.getElementById('imageLightbox');
        const lbImg = document.getElementById('lightboxImg');
        lbImg.removeAttribute('src');
        lb.setAttribute('hidden', '');
    }
});

// Fallback: si la miniatura falla, usar la original
document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('thumb')) {
        const full = t.getAttribute('data-full');
        if (full && t.src !== full) {
            t.src = full;
        }
    }
}, true);

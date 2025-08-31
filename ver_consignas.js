
function createImgWithFallback(thumbUrl, originalUrl, altText='imagen'){
  const img = document.createElement('img');
  img.src = thumbUrl || originalUrl;
  img.alt = altText;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.onerror = () => { img.onerror = null; img.src = originalUrl; };
  return img;
}

document.addEventListener("DOMContentLoaded", () => {
    if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
    const auth = firebase.auth();
    const db = firebase.firestore();

    const consignasContainer = document.getElementById("consignas-container");
    const loadingOverlay = document.getElementById("loadingOverlay");

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            loadingOverlay.hidden = false;
            try {
                const userId = user.email.split('@')[0];
                const userDoc = await db.collection('USUARIOS').doc(userId).get();
                if (!userDoc.exists) throw new Error("No se encontraron los datos del usuario.");
                
                const { CLIENTE, UNIDAD } = userDoc.data();
                if (!CLIENTE || !UNIDAD) throw new Error("El perfil del usuario no tiene Cliente o Unidad definidos.");
                
                await cargarConsignas(CLIENTE, UNIDAD);

            } catch (error) {
                console.error("Error al cargar consignas:", error);
                consignasContainer.innerHTML = `<p style="color:white; text-align:center;">${error.message}</p>`;
            } finally {
                loadingOverlay.hidden = true;
            }
        } else {
            window.location.href = 'index.html';
        }
    });

    async function cargarConsignas(cliente, unidad) {
        let todasLasConsignas = [];

        // --- 1. Obtener Consignas Permanentes ---
        const permanentesQuery = db.collection('CONSIGNA_PERMANENTE')
            .where('cliente', '==', cliente)
            .where('unidad', '==', unidad);
        const permanentesSnapshot = await permanentesQuery.get();
        permanentesSnapshot.forEach(doc => {
            todasLasConsignas.push({ ...doc.data(), tipo: 'Permanente' });
        });

        // --- 2. Obtener y filtrar Consignas Temporales ---
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const temporalesQuery = db.collection('CONSIGNA_TEMPORAL')
            .where('cliente', '==', cliente)
            .where('unidad', '==', unidad);
        const temporalesSnapshot = await temporalesQuery.get();
        temporalesSnapshot.forEach(doc => {
            const consigna = doc.data();
            const fechaInicio = new Date(consigna.fechaInicio + 'T00:00:00');
            const fechaFin = new Date(consigna.fechaFin + 'T00:00:00');
            if (hoy >= fechaInicio && hoy <= fechaFin) {
                todasLasConsignas.push({ ...consigna, tipo: 'Temporal' });
            }
        });

        // --- 3. Ordenar la lista combinada por fecha de creación ---
        todasLasConsignas.sort((a, b) => {
            const dateA = a.fechaCreacion ? a.fechaCreacion.toMillis() : 0;
            const dateB = b.fechaCreacion ? b.fechaCreacion.toMillis() : 0;
            return dateB - dateA; // Descendente (más reciente primero)
        });

        // --- 4. Renderizar el HTML ---
        if (todasLasConsignas.length === 0) {
            consignasContainer.innerHTML = '<p style="color:white; text-align:center;">No hay consignas activas para mostrar.</p>';
        } else {
            consignasContainer.innerHTML = todasLasConsignas.map(consigna => renderConsignaCard(consigna)).join('');
        }
    }

    function renderConsignaCard(data) {
        const fechaCreacion = data.fechaCreacion ? data.fechaCreacion.toDate().toLocaleString('es-PE') : 'No disponible';
        const badgeClass = data.tipo === 'Permanente' ? 'badge-permanente' : 'badge-temporal';

        let fechasHTML = '';
        if (data.tipo === 'Temporal') {
            fechasHTML = `<p><strong>Vigencia:</strong> Desde ${data.fechaInicio} hasta ${data.fechaFin}</p>`;
        }

        let fotoHTML = '';
        if (data.fotoURL) {
            // --- INICIO: LÓGICA PARA USAR MINIATURAS ---
            const urlOriginal = data.fotoURL;
            // Extrae la extensión del archivo (ej. ".jpg") de la URL, manejando los tokens de acceso de Firebase
            const extension = urlOriginal.substring(urlOriginal.lastIndexOf('.'), urlOriginal.indexOf('?'));
            // Reemplaza la extensión por la versión con el sufijo de la miniatura (ej. "_400x400.jpg")
            const urlMiniatura = urlOriginal.replace(extension, `_400x400${extension}`);

            // La miniatura <img> está envuelta en un enlace <a> a la imagen original
            fotoHTML = `<div class="consigna-images">
                            <a href="${urlOriginal}" target="_blank" title="Ver imagen completa">
                                <img src="${urlMiniatura}" alt="Foto de consigna">
                            </a>
                        </div>`;
            // --- FIN: LÓGICA PARA USAR MINIATURAS ---
        }
        
        return `
            <div class="consigna-card">
                <h3>
                    Consigna ${data.tipo}
                    <span class="badge ${badgeClass}">${data.tipo}</span>
                </h3>
                <p><strong>Registrado por:</strong> ${data.nombres} ${data.apellidos}</p>
                <p><strong>Fecha de Registro:</strong> ${fechaCreacion}</p>
                ${fechasHTML}
                <p><strong>Comentario:</strong><br>${data.comentario}</p>
                ${fotoHTML}
            </div>
        `;
    }
});


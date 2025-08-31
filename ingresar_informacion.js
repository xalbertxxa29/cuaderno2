document.addEventListener("DOMContentLoaded", () => {
    if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();

    const infoForm = document.getElementById("info-form");
    const comentarioInput = document.getElementById("comentario");
    const fotoInput = document.getElementById("foto-input");
    const fotoPreview = document.getElementById("foto-preview");
    const canvas = document.getElementById("firma-canvas");
    const clearFirmaBtn = document.getElementById("clear-firma");
    const loadingOverlay = document.getElementById("loadingOverlay");

    const ctx = canvas.getContext('2d');
    let drawing = false;
    let hasSigned = false;
    let lastX = 0;
    let lastY = 0;

    // --- INICIO: FUNCIÓN DE FIRMA CORREGIDA ---
    function resizeCanvas() {
        // Calcula la relación de píxeles para pantallas de alta densidad (retina)
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        
        // Ajusta el tamaño del canvas según su tamaño en CSS y el ratio de píxeles
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        
        // Escala el contexto para que las coordenadas de dibujo coincidan
        canvas.getContext('2d').scale(ratio, ratio);
        
        // Limpia el canvas después de redimensionar
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        console.log("Canvas recalibrado.");
    }
    // --- FIN: FUNCIÓN DE FIRMA CORREGIDA ---

    window.addEventListener('load', resizeCanvas);
    window.addEventListener('resize', resizeCanvas);

    function startDraw(e) {
        drawing = true;
        hasSigned = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }

    function draw(e) {
        if (!drawing) return;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }

    function stopDraw() {
        drawing = false;
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseout', stopDraw);

    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        startDraw({ offsetX: touchX, offsetY: touchY });
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        draw({ offsetX: touchX, offsetY: touchY });
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        stopDraw();
    });

    clearFirmaBtn.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasSigned = false;
    });

    fotoInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                fotoPreview.src = event.target.result;
                fotoPreview.hidden = false;
            };
            reader.readAsDataURL(file);
        }
    });

    infoForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        loadingOverlay.hidden = false;

        const comentario = comentarioInput.value.trim();
        const fotoFile = fotoInput.files[0];

        if (!comentario || !hasSigned) {
            loadingOverlay.hidden = true;
            alert("Por favor, complete el comentario y la firma.");
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            loadingOverlay.hidden = true;
            alert("Usuario no autenticado. Redirigiendo al login.");
            window.location.href = "index.html";
            return;
        }

        try {
            const userId = user.email.split('@')[0];
            const userDocRef = db.collection('USUARIOS').doc(userId);
            const userDoc = await userDocRef.get();
            const userData = userDoc.data();

            let fotoURL = "";
            if (fotoFile) {
                console.log(`Tamaño original: ${(fotoFile.size / 1024 / 1024).toFixed(2)} MB`);
                const options = {
                    maxSizeMB: 1,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true,
                };
                const compressedFile = await imageCompression(fotoFile, options);
                console.log(`Tamaño comprimido: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
                
                const fotoRef = storage.ref(`cuaderno/${userId}_${Date.now()}`);
                const snapshot = await fotoRef.put(compressedFile);
                fotoURL = await snapshot.ref.getDownloadURL();
            }

            const firmaDataURL = canvas.toDataURL('image/png');

            await db.collection('CUADERNO').add({
                userId: userId,
                nombres: userData.NOMBRES,
                apellidos: userData.APELLIDOS,
                cliente: userData.CLIENTE,
                unidad: userData.UNIDAD,
                comentario: comentario,
                fotoURL: fotoURL,
                firma: firmaDataURL,
                fecha: new Date(),
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert("Información guardada correctamente.");
            infoForm.reset();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasSigned = false;
            fotoPreview.hidden = true;

        } catch (error) {
            console.error("Error al guardar la información: ", error);
            alert("Error al guardar la información. Por favor, inténtelo de nuevo.");
        } finally {
            loadingOverlay.hidden = true;
        }
    });
});
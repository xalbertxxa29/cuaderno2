// js/auth.js

document.addEventListener("DOMContentLoaded", () => {
  // --- INICIALIZACIÓN ---
  if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
  const auth = firebase.auth();
  const db = firebase.firestore();

  // --- ELEMENTOS DEL DOM ---
  const loadingOverlay = document.getElementById("loadingOverlay");
  // Formulario de Login
  const loginForm = document.getElementById("login-form");
  // Formulario de Registro
  const registerForm = document.getElementById("register-form");
  const registerClienteInput = document.getElementById('register-cliente-input');
  const registerClienteList = document.getElementById('register-cliente-list');
  const registerUnidadInput = document.getElementById('register-unidad-input');
  const registerUnidadList = document.getElementById('register-unidad-list');
  // Iframe y Modal
  const addClienteBtn = document.getElementById('add-cliente-btn');
  const iframeModal = document.getElementById('iframe-modal');
  const closeIframeBtn = document.getElementById('close-iframe-modal-btn');
  const iframe = document.getElementById('add-cliente-iframe');

  // --- FUNCIÓN DE MODAL PARA MENSAJES ---
  function showAuthModal(message) {
      if (document.querySelector('.modal-overlay:not(#iframe-modal)')) return;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const box = document.createElement('div');
      box.className = 'modal-box';
      box.innerHTML = `<p>${message}</p><button id="modal-ok-btn">Aceptar</button>`;
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      document.getElementById('modal-ok-btn').addEventListener('click', () => {
          document.body.removeChild(overlay);
      });
  }

  // --- LÓGICA DE LOGIN ---
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    loadingOverlay.hidden = false;
    const userId = document.getElementById("login-id").value.trim();
    const password = document.getElementById("login-password").value.trim();
    try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const userDocRef = db.collection('USUARIOS').doc(userId);
        const docSnap = await userDocRef.get();
        if (!docSnap.exists) {
            showAuthModal("El ID de usuario no está registrado.");
            loadingOverlay.hidden = true;
            return;
        }
        const userData = docSnap.data();
        const estadoUsuario = userData.ESTADO;
        if (estadoUsuario !== 'ACTIVO') {
            const mensaje = `Su usuario está en estado "${estadoUsuario || 'INDEFINIDO'}", comunícate con tu zonal.`;
            showAuthModal(mensaje);
            loadingOverlay.hidden = true;
            return;
        }
        const constructedEmail = `${userId}@liderman.com.pe`;
        await auth.signInWithEmailAndPassword(constructedEmail, password);
        window.location.href = "menu.html";
    } catch (error) {
        console.error("Error de inicio de sesión:", error);
        if (error.code === 'auth/wrong-password') {
            showAuthModal("Contraseña incorrecta.");
        } else {
            showAuthModal("Ocurrió un error al iniciar sesión.");
        }
    } finally {
        loadingOverlay.hidden = true;
    }
  });

  // --- LÓGICA PARA DESPLEGABLES DE REGISTRO ---
  function createSearchableDropdown(input, listContainer, items, onSelectCallback) {
    function populateList(itemsToShow) {
        listContainer.innerHTML = '';
        itemsToShow.forEach(item => {
            const optionDiv = document.createElement('div');
            optionDiv.textContent = item;
            optionDiv.addEventListener('click', () => {
                input.value = item;
                listContainer.classList.remove('show');
                if (onSelectCallback) onSelectCallback(item);
            });
            listContainer.appendChild(optionDiv);
        });
        if (itemsToShow.length > 0) listContainer.classList.add('show');
        else listContainer.classList.remove('show');
    }
    input.addEventListener('input', () => {
        const filter = input.value.toUpperCase();
        const filteredItems = items.filter(item => item.toUpperCase().includes(filter));
        populateList(filteredItems);
    });
    input.addEventListener('click', (e) => {
        e.stopPropagation();
        populateList(items);
    });
  }

  async function cargarClientes() {
    try {
        const snapshot = await db.collection('CLIENTE_UNIDAD').get();
        const clientes = snapshot.docs.map(doc => doc.id).sort();
        createSearchableDropdown(registerClienteInput, registerClienteList, clientes, (clienteSeleccionado) => {
            registerUnidadInput.disabled = false;
            registerUnidadInput.value = '';
            registerUnidadInput.placeholder = 'Buscar o seleccionar unidad...';
            cargarUnidades(clienteSeleccionado);
        });
    } catch (error) {
        console.error("Error cargando clientes:", error);
    }
  }

  async function cargarUnidades(cliente) {
    try {
        const docRef = db.collection('CLIENTE_UNIDAD').doc(cliente);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            const unidades = docSnap.data().unidades || [];
            createSearchableDropdown(registerUnidadInput, registerUnidadList, unidades.sort());
        }
    } catch (error) {
        console.error("Error cargando unidades:", error);
    }
  }

  // Cargar clientes al iniciar
  cargarClientes();

  document.addEventListener('click', () => {
    registerClienteList.classList.remove('show');
    registerUnidadList.classList.remove('show');
  });

  // --- LÓGICA DEL IFRAME MODAL ---
  addClienteBtn.addEventListener('click', () => {
    iframe.src = 'add_cliente_unidad.html';
    iframeModal.style.display = 'flex';
  });

  closeIframeBtn.addEventListener('click', () => {
    iframeModal.style.display = 'none';
  });

  window.addEventListener('message', (event) => {
      if (event.data === 'clienteAgregado') {
          console.log('Cliente agregado, recargando lista...');
          cargarClientes();
      }
  });

  // --- LÓGICA DE REGISTRO ---
  registerForm.addEventListener("submit", async e => {
    e.preventDefault();
    loadingOverlay.hidden = false;

    const cliente = registerClienteInput.value.trim();
    const unidad = registerUnidadInput.value.trim();
    const userId = document.getElementById("register-id").value.trim();
    const nombres = document.getElementById("register-nombres").value.trim();
    const apellidos = document.getElementById("register-apellidos").value.trim();
    const tipo = document.getElementById("register-tipo").value.trim();
    const password = document.getElementById("register-password").value;
    const passwordConfirm = document.getElementById("register-password-confirm").value;

    if (!userId || !nombres || !apellidos || !cliente || !unidad || !password || !passwordConfirm) {
        showAuthModal("Por favor, complete todos los campos.");
        loadingOverlay.hidden = true;
        return;
    }
    if (password !== passwordConfirm) {
        showAuthModal("Las contraseñas no coinciden.");
        loadingOverlay.hidden = true;
        return;
    }

    const constructedEmail = `${userId}@liderman.com.pe`;

    try {
        await auth.createUserWithEmailAndPassword(constructedEmail, password);
        const userData = {
            NOMBRES: nombres.toUpperCase(),
            APELLIDOS: apellidos.toUpperCase(),
            CLIENTE: cliente.toUpperCase(),
            UNIDAD: unidad.toUpperCase(),
            TIPO: tipo.toUpperCase(),
            ESTADO: "INACTIVO"
        };
        await db.collection('USUARIOS').doc(userId).set(userData);
        showAuthModal("¡Usuario registrado exitosamente! Su cuenta está pendiente de activación.");
        registerForm.reset();
        registerUnidadInput.disabled = true;
        registerUnidadInput.placeholder = 'Selecciona un cliente primero...';
    } catch (error) {
        console.error("Error al registrar:", error);
        if (error.code === 'auth/email-already-in-use') {
            showAuthModal("Este ID de usuario ya está registrado.");
        } else if (error.code === 'auth/weak-password') {
            showAuthModal("La contraseña debe tener al menos 6 caracteres.");
        } else {
            showAuthModal("Ocurrió un error durante el registro.");
        }
    } finally {
        loadingOverlay.hidden = true;
    }
  });
});

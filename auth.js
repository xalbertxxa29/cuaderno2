// js/auth.js (revisado)
document.addEventListener("DOMContentLoaded", () => {
  if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
  const auth = firebase.auth();
  const db   = firebase.firestore();

  // ---------- TABS (soluciona que no abra "Registrarse") ----------
  window.openTab = (evt, tabId) => {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById(tabId);
    if (panel) panel.style.display = 'block';
    if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');
  };

  const loadingOverlay = document.getElementById("loadingOverlay");
  const loginForm      = document.getElementById("login-form");
  const registerForm   = document.getElementById("register-form");

  const registerClienteInput = document.getElementById('register-cliente-input');
  const registerClienteList  = document.getElementById('register-cliente-list');
  const registerUnidadInput  = document.getElementById('register-unidad-input');
  const registerUnidadList   = document.getElementById('register-unidad-list');

  const addClienteBtn  = document.getElementById('add-cliente-btn');
  const iframeModal    = document.getElementById('iframe-modal');
  const closeIframeBtn = document.getElementById('close-iframe-modal-btn');
  const iframe         = document.getElementById('add-cliente-iframe');

  // Helpers
  const ORIGIN_ALLOWLIST = [location.origin]; // agrega tu dominio público si aplica
  const emailFromId = (id) => `${id}@liderman.com.pe`;
  const sanitizeUserId = (raw) =>
    raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');

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

  // Autologin si ya hay sesión
  auth.onAuthStateChanged((user) => { if (user) window.location.replace("menu.html"); });

  // ----------- Login -----------
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      loadingOverlay.hidden = false;
      const rawId = document.getElementById("login-id").value;
      const userId = sanitizeUserId(rawId);
      const pass  = document.getElementById("login-password").value;

      try { await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch {}

      try {
        const snap = await db.collection('USUARIOS').doc(userId).get();
        if (!snap.exists) { showAuthModal("El ID de usuario no está registrado."); return; }
        const data = snap.data();
        if (data.ESTADO !== 'ACTIVO') {
          showAuthModal(`Su usuario está en estado "${data.ESTADO || 'INDEFINIDO'}". Comunícate con tu zonal.`);
          return;
        }
        await auth.signInWithEmailAndPassword(emailFromId(userId), pass);
        window.location.href = "menu.html";
      } catch (error) {
        const code = error?.code || '';
        if (code === 'auth/wrong-password')         showAuthModal("Contraseña incorrecta.");
        else if (code === 'auth/user-not-found' ||
                 code === 'auth/invalid-credential') showAuthModal("Credenciales inválidas. Verifique ID y contraseña.");
        else if (code === 'auth/too-many-requests')  showAuthModal("Demasiados intentos. Inténtalo más tarde.");
        else                                         showAuthModal("Ocurrió un error al iniciar sesión.");
      } finally { loadingOverlay.hidden = true; }
    });
  }

  // ----------- Dropdowns buscables -----------
  function createSearchableDropdown(input, listContainer, items, onSelect) {
    let debounceId;
    function render(list) {
      listContainer.innerHTML = '';
      list.forEach(txt => {
        const div = document.createElement('div');
        div.textContent = txt;
        div.addEventListener('click', () => {
          input.value = txt;
          listContainer.classList.remove('show');
          if (onSelect) onSelect(txt);
        });
        listContainer.appendChild(div);
      });
      list.length ? listContainer.classList.add('show') : listContainer.classList.remove('show');
    }
    input.addEventListener('input', () => {
      clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        const f = input.value.toUpperCase();
        render(items.filter(x => x.toUpperCase().includes(f)));
      }, 120);
    });
    input.addEventListener('click', (e) => { e.stopPropagation(); render(items); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') listContainer.classList.remove('show'); });
  }

  async function cargarClientes() {
    try {
      const ss = await db.collection('CLIENTE_UNIDAD').get();
      const clientes = ss.docs.map(d => d.id).sort();
      createSearchableDropdown(registerClienteInput, registerClienteList, clientes, (cli) => {
        registerUnidadInput.disabled = false;
        registerUnidadInput.value = '';
        registerUnidadInput.placeholder = 'Buscar o seleccionar unidad...';
        cargarUnidades(cli);
      });
    } catch (e) { console.error('Error cargando clientes', e); }
  }

  async function cargarUnidades(cliente) {
    try {
      const d = await db.collection('CLIENTE_UNIDAD').doc(cliente).get();
      const unidades = (d.exists ? (d.data().unidades || []) : []).sort();
      createSearchableDropdown(registerUnidadInput, registerUnidadList, unidades);
    } catch (e) { console.error('Error cargando unidades', e); }
  }

  if (registerClienteInput) cargarClientes();
  document.addEventListener('click', () => {
    registerClienteList?.classList.remove('show');
    registerUnidadList?.classList.remove('show');
  });

  // ----------- Iframe modal con validación de origen -----------
  if (addClienteBtn && iframe && iframeModal) {
    addClienteBtn.addEventListener('click', () => {
      iframe.src = 'add_cliente_unidad.html';
      iframeModal.style.display = 'flex';
    });
    closeIframeBtn?.addEventListener('click', () => { iframeModal.style.display = 'none'; });
    window.addEventListener('message', (event) => {
      if (!ORIGIN_ALLOWLIST.includes(event.origin)) return; // <— clave
      if (event.source !== iframe.contentWindow)   return; // <— clave
      if (event.data === 'clienteAgregado') cargarClientes();
    });
  }

  // ----------- Registro -----------
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loadingOverlay.hidden = false;

      const userId    = sanitizeUserId(document.getElementById("register-id").value);
      const nombres   = document.getElementById("register-nombres").value.trim();
      const apellidos = document.getElementById("register-apellidos").value.trim();
      const cliente   = registerClienteInput.value.trim();
      const unidad    = registerUnidadInput.value.trim();
      const tipo      = (document.getElementById("register-tipo").value || 'AGENTE').trim();
      const pass      = document.getElementById("register-password").value;
      const pass2     = document.getElementById("register-password-confirm").value;

      if (!userId || !nombres || !apellidos || !cliente || !unidad || !pass || !pass2) {
        showAuthModal("Por favor, complete todos los campos."); loadingOverlay.hidden = true; return;
      }
      if (pass !== pass2) {
        showAuthModal("Las contraseñas no coinciden."); loadingOverlay.hidden = true; return;
      }

      try {
        await auth.createUserWithEmailAndPassword(emailFromId(userId), pass);
        await db.collection('USUARIOS').doc(userId).set({
          NOMBRES: nombres.toUpperCase(),
          APELLIDOS: apellidos.toUpperCase(),
          CLIENTE: cliente.toUpperCase(),
          UNIDAD:  unidad.toUpperCase(),
          TIPO:    tipo.toUpperCase(),
          ESTADO:  "INACTIVO"
        });
        showAuthModal("¡Usuario registrado! Queda pendiente de activación.");
        registerForm.reset();
        registerUnidadInput.disabled = true;
        registerUnidadInput.placeholder = 'Selecciona un cliente primero...';
        // Cambiar a pestaña "Iniciar Sesión"
        const loginTab = document.querySelector('.tab-link'); // primer botón
        if (loginTab) openTab({ currentTarget: loginTab }, 'login');
      } catch (error) {
        const code = error?.code || '';
        if (code === 'auth/email-already-in-use') showAuthModal("Este ID ya está registrado.");
        else if (code === 'auth/weak-password')   showAuthModal("La contraseña debe tener al menos 6 caracteres.");
        else                                      showAuthModal("Ocurrió un error durante el registro.");
      } finally { loadingOverlay.hidden = true; }
    });
  }
});

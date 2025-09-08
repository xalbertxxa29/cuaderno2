// ui.js — utilidades comunes de UI (overlay, alertas, dropdowns buscables)
(() => {
  const UI = {};

  // ---------- Overlay (look “lindo”) ----------
  function mountOverlay(subText) {
    const old = document.getElementById('loadingOverlay');
    if (old) old.remove(); // ¡IMPORTANTE!: no reutilizar el viejo spinner

    const el = document.createElement('div');
    el.id = 'loadingOverlay';
    Object.assign(el.style, {
      position:'fixed', inset:'0', zIndex:'10000',
      display:'grid', placeItems:'center',
      background:'rgba(0,0,0,.45)', backdropFilter:'blur(2px)'
    });
    el.innerHTML = `
      <div style="width:min(540px,92vw);background:#121826;color:#e6e6e6;padding:24px;
                  border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);text-align:center;">
        <div style="width:64px;height:64px;margin:0 auto 12px;position:relative;">
          <span style="position:absolute;inset:-6px;border-radius:50%;
                       border:3px solid transparent;border-top-color:#e70909;animation:spin 1.2s linear infinite;"></span>
          <span style="position:absolute;inset:-14px;border-radius:50%;
                       border:3px solid transparent;border-top-color:#3fb950;animation:spin 1.6s linear infinite;"></span>
          <span style="position:absolute;inset:2px;border-radius:50%;
                       border:3px solid transparent;border-top-color:#2f81f7;animation:spin 1s linear infinite;"></span>
        </div>
        <div style="font-size:1.1rem;margin:6px 0 10px;">Procesando…</div>
        <div id="overlay-sub" style="font-size:.95rem;color:#a3a3a3;">${subText || 'Cargando…'}</div>
        <div style="height:8px;background:#2a2f3a;border-radius:999px;overflow:hidden;margin-top:12px;">
          <div style="height:100%;width:38%;background:linear-gradient(90deg,#2f81f7,#3fb950);
                      animation:widen 2.2s ease-in-out infinite alternate;"></div>
        </div>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}@keyframes widen{from{width:25%}to{width:86%}}</style>`;
    document.body.appendChild(el);
  }
  UI.showOverlay = (subText) => mountOverlay(subText);
  UI.hideOverlay = () => { const el = document.getElementById('loadingOverlay'); if (el) el.remove(); };

  // ---------- Modal “alert” amigable ----------
  UI.alert = (title = 'Aviso', message = '', onOk) => {
    const existing = document.getElementById('ui-alert-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'ui-alert-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="modal-box" style="text-align:center;">
        <h3 style="margin-top:0;">${title}</h3>
        <p>${message}</p>
        <button id="ui-alert-ok" class="btn-primary" style="width:auto;">Aceptar</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('ui-alert-ok').addEventListener('click', () => {
      overlay.remove();
      if (typeof onOk === 'function') onOk();
    });
  };

  // ---------- Dropdown buscable ----------
  UI.createSearchableDropdown = (input, listContainer, items, onSelect) => {
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
    document.addEventListener('click', () => listContainer.classList.remove('show'));
  };

  window.UI = UI;
})();

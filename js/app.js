// Arranque y router de ELOA Board
import * as api from './api.js';
import { state, savePendingInvite, takePendingInvite } from './state.js';
import { brand, icon, avatar, esc, openModal, toast, toastError, closeAllModals, prepareImage, $ } from './ui.js';
import { renderLogin, renderResetPassword, renderNotConfigured } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderBoard, leaveBoard } from './board.js';
import { renderInvite } from './invite.js';
import { initTheme, themeButton } from './theme.js';

const root = document.getElementById('app');
let recovering = new URLSearchParams(location.search).get('mode') === 'reset';

function cleanUrl() {
  // Quita ?code=… / ?mode=… que deja Supabase después de confirmar o recuperar
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
}

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'invite' && parts[1]) return { name: 'invite', token: parts[1] };
  if (parts[0] === 'p' && parts[1]) return { name: 'board', id: parts[1], sprint: parts[2] === 's' ? parts[3] : null };
  return { name: 'dashboard' };
}

function shell() {
  root.innerHTML = `
    <header class="topbar">
      ${brand()}
      <nav class="topnav">
        <a href="#/" class="navlink">Dashboard</a>
      </nav>
      ${themeButton()}
      <button class="user-btn" id="user-btn" aria-label="Mi cuenta">
        ${avatar(state.profile, 'md')}
        <span class="hide-sm">${esc(state.profile?.full_name || state.user.email)}</span>
      </button>
    </header>
    <main id="main"></main>`;
  $('#user-btn').addEventListener('click', openAccount);
  return $('#main');
}

const AVATAR_COLORS = [
  '#e5487b', '#f472b6', '#e58ea2', '#c026d3', '#8e5cd9', '#6d5bd0',
  '#4f46e5', '#3b82f6', '#0ea5e9', '#0ea5a4', '#14b8a6', '#22a06b',
  '#65a30d', '#84cc16', '#e2b203', '#f59e0b', '#f07a32', '#ef4444',
  '#b45309', '#78716c', '#64748b', '#1d2742', '#0f172a', '#9d174d',
];

function openAccount() {
  const p = state.profile;
  let color = p.avatar_color;
  const custom = !AVATAR_COLORS.includes(color);
  const m = openModal(`
    <h2>Mi cuenta</h2>
    <form class="stack" id="acc">
      <div class="avatar-edit">
        <div id="avatar-preview"></div>
        <div class="stack tight">
          <label class="btn ghost small file-btn">${icon('camera', 16)} <span id="photo-label">${p.avatar_url ? 'Cambiar foto' : 'Subir foto'}</span>
            <input type="file" id="photo" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          </label>
          <button type="button" class="btn ghost small danger-text" id="photo-remove" ${p.avatar_url ? '' : 'hidden'}>Quitar foto</button>
          <p class="muted small">JPG, PNG o WebP. Se recorta en cuadrado.</p>
        </div>
      </div>
      <label>Nombre <input name="full_name" maxlength="80" required value="${esc(p.full_name)}"></label>
      <fieldset><legend>Color <span class="muted">(se usa si no tienes foto)</span></legend>
        <div class="color-pick">
          ${AVATAR_COLORS.map((c) => `<label style="--c:${c}" title="${c}"><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span></span></label>`).join('')}
          <label class="custom-color" title="Elige cualquier color" style="--c:${custom ? esc(color) : '#ffffff'}">
            <input type="radio" name="color" value="custom" ${custom ? 'checked' : ''}>
            <span>${icon('plus', 14)}</span>
            <input type="color" id="color-any" value="${esc(color)}" aria-label="Color personalizado">
          </label>
        </div>
      </fieldset>
      <p class="muted small">Correo: ${esc(state.user.email)}${p.is_admin ? ' · <b>Admin ELOA</b>' : ''}</p>
      <div class="row between">
        <button type="button" class="btn ghost" id="logout">${icon('logout')} Cerrar sesión</button>
        <button class="btn">Guardar</button>
      </div>
    </form>`, { onClose: () => { if (photoChanged) route(); } });

  let photoChanged = false;
  const form = $('#acc', m.el);
  const preview = () => {
    $('#avatar-preview', m.el).innerHTML = avatar({ ...state.profile, full_name: form.full_name.value || p.full_name, avatar_color: color }, 'xl');
  };
  preview();
  form.full_name.addEventListener('input', preview);

  const any = $('#color-any', m.el);
  const customLabel = any.closest('.custom-color');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'color') {
      color = e.target.value === 'custom' ? any.value : e.target.value;
      preview();
    }
  });
  any.addEventListener('input', () => {
    color = any.value;
    customLabel.style.setProperty('--c', color);
    customLabel.querySelector('input[type=radio]').checked = true;
    preview();
  });
  customLabel.querySelector('span').addEventListener('click', () => any.click());

  $('#photo', m.el).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const label = $('#photo-label', m.el);
    label.textContent = 'Subiendo…';
    try {
      const blob = await prepareImage(file, 320, 320);
      state.profile = await api.uploadAvatar(state.user.id, blob);
      photoChanged = true;
      preview();
      $('#photo-remove', m.el).hidden = false;
      toast('Foto actualizada 📸', 'success');
    } catch (ex) { toastError(ex); }
    label.textContent = state.profile.avatar_url ? 'Cambiar foto' : 'Subir foto';
  });
  $('#photo-remove', m.el).addEventListener('click', async (e) => {
    try {
      state.profile = await api.removeAvatar(state.user.id);
      photoChanged = true;
      e.target.hidden = true;
      $('#photo-label', m.el).textContent = 'Subir foto';
      preview();
    } catch (ex) { toastError(ex); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state.profile = await api.updateMyProfile(state.user.id, {
        full_name: form.full_name.value.trim(), avatar_color: /^#[0-9a-f]{6}$/i.test(color) ? color : p.avatar_color,
      });
      photoChanged = true;
      m.close(); toast('Perfil actualizado', 'success');
    } catch (ex) { toastError(ex); }
  });
  $('#logout', m.el).addEventListener('click', async () => { photoChanged = false; m.close(); await api.signOut(); });
}

async function loadUser(session) {
  state.session = session;
  state.user = session?.user || null;
  if (!state.user) { state.profile = null; return; }
  const [profile, areas] = await Promise.all([api.getMyProfile(state.user.id), api.listAreas()]);
  state.profile = profile;
  state.areas = areas;
  state.areaById = new Map(areas.map((a) => [a.id, a]));
}

let routing = Promise.resolve();
function route() { routing = routing.then(doRoute, doRoute); return routing; }

async function doRoute() {
  const r = parseRoute();
  leaveBoard();
  closeAllModals();

  if (recovering && state.user) {
    return renderResetPassword(root, () => { recovering = false; cleanUrl(); route(); });
  }
  if (!state.user) {
    if (r.name === 'invite') {
      savePendingInvite(r.token);
      history.replaceState(null, '', location.pathname + '#/');
    }
    return renderLogin(root);
  }

  if (r.name !== 'invite') {
    const pending = takePendingInvite();
    if (pending) {
      history.replaceState(null, '', location.pathname + '#/invite/' + pending);
      return doRoute();
    }
  }

  const main = shell();
  document.querySelectorAll('.navlink').forEach((a) => a.classList.toggle('on', r.name === 'dashboard'));
  if (r.name === 'invite') {
    history.replaceState(null, '', location.pathname + '#/'); // no dejar el token en la URL
    return renderInvite(main, r.token);
  }
  if (r.name === 'board') return renderBoard(main, r.id, r.sprint);
  return renderDashboard(main);
}

async function boot() {
  initTheme();
  if (!api.configured) return renderNotConfigured(root);

  let initial = true;
  api.onAuthChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    if (event === 'INITIAL_SESSION') return; // lo manejamos abajo
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') { state.session = session; return; }
    if (initial) return;
    // Supabase a veces repite SIGNED_IN al volver a la pestaña: no re-renderizar
    if (event === 'SIGNED_IN' && session?.user?.id === state.user?.id) { state.session = session; return; }
    // diferimos para no bloquear el callback de Supabase
    setTimeout(async () => {
      try { await loadUser(session); } catch (e) { toastError(e); }
      route();
    }, 0);
  });

  try {
    const session = await api.getSession();
    await loadUser(session);
  } catch (e) {
    toastError(e);
    state.user = null;
  }
  initial = false;
  if (!recovering) cleanUrl();
  window.addEventListener('hashchange', route);
  route();
}

boot();

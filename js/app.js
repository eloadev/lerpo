// Arranque y router de ELOA Board
import * as api from './api.js';
import { state, savePendingInvite, takePendingInvite } from './state.js';
import { brand, icon, avatar, esc, openModal, toast, toastError, closeAllModals, $ } from './ui.js';
import { renderLogin, renderResetPassword, renderNotConfigured } from './auth.js';
import { renderDashboard } from './dashboard.js';
import { renderBoard, leaveBoard } from './board.js';
import { renderInvite } from './invite.js';

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
      <button class="user-btn" id="user-btn" aria-label="Mi cuenta">
        ${avatar(state.profile, 'md')}
        <span class="hide-sm">${esc(state.profile?.full_name || state.user.email)}</span>
      </button>
    </header>
    <main id="main"></main>`;
  $('#user-btn').addEventListener('click', openAccount);
  return $('#main');
}

function openAccount() {
  const p = state.profile;
  const colors = ['#6d5bd0', '#3b82f6', '#22a06b', '#e2b203', '#e5487b', '#f07a32', '#1d2742', '#0ea5a4'];
  const m = openModal(`
    <h2>Mi cuenta</h2>
    <form class="stack" id="acc">
      <label>Nombre <input name="full_name" maxlength="80" required value="${esc(p.full_name)}"></label>
      <fieldset><legend>Color de avatar</legend>
        <div class="color-pick">
          ${colors.map((c) => `<label style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === p.avatar_color ? 'checked' : ''}><span></span></label>`).join('')}
        </div>
      </fieldset>
      <p class="muted small">Correo: ${esc(state.user.email)}${p.is_admin ? ' · <b>Admin ELOA</b>' : ''}</p>
      <div class="row between">
        <button type="button" class="btn ghost" id="logout">${icon('logout')} Cerrar sesión</button>
        <button class="btn">Guardar</button>
      </div>
    </form>`);
  $('#acc', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      state.profile = await api.updateMyProfile(state.user.id, {
        full_name: String(f.get('full_name')).trim(), avatar_color: f.get('color') || p.avatar_color,
      });
      m.close(); toast('Perfil actualizado', 'success'); route();
    } catch (ex) { toastError(ex); }
  });
  $('#logout', m.el).addEventListener('click', async () => { m.close(); await api.signOut(); });
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

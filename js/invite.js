// Página para aceptar una invitación (#/invite/<token>)
import * as api from './api.js';
import { esc, icon, toast, toastError, ROLE_LABEL, $ } from './ui.js';

export async function renderInvite(main, token) {
  main.innerHTML = `<div class="page"><div class="empty-state"><p class="muted">Revisando invitación…</p></div></div>`;
  let info = null;
  try { info = await api.invitePreview(token); } catch (e) { toastError(e); }

  if (!info) {
    main.innerHTML = `
      <div class="page"><div class="empty-state">
        ${icon('lock', 40)}
        <h2>Invitación no válida</h2>
        <p class="muted">El link expiró, ya se usó o fue revocado. Pide uno nuevo.</p>
        <a class="btn ghost" href="#/">Ir al dashboard</a>
      </div></div>`;
    return;
  }
  if (info.already_member) {
    toast('Ya eres parte de este board 👌', 'success');
    location.hash = `#/p/${info.project_id}`;
    return;
  }

  main.innerHTML = `
    <div class="page"><div class="empty-state invite-card">
      ${icon('users', 40)}
      <p class="eyebrow">Te invitaron a</p>
      <h2>${esc(info.project_name)}</h2>
      <p class="muted">Entrarás con el rol <b>${ROLE_LABEL[info.role]}</b>.</p>
      <div class="row gap center">
        <a class="btn ghost" href="#/">Ahora no</a>
        <button class="btn" id="accept">Unirme al board</button>
      </div>
    </div></div>`;
  $('#accept', main).addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const pid = await api.acceptInvite(token);
      toast('¡Bienvenida/o al board! 🎉', 'success');
      location.hash = `#/p/${pid}`;
    } catch (ex) { toastError(ex); e.target.disabled = false; }
  });
}

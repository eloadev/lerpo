// Modales: crear/editar proyecto, sprints, miembros e invitaciones
import * as api from './api.js';
import { state } from './state.js';
import {
  esc, icon, avatar, openModal, confirmDialog, toast, toastError, longDate, ROLE_LABEL, $, $$, todayISO,
  prepareImage, isSafeUrl,
} from './ui.js';

// Tamaños finales: portada del dashboard 2:1, banner del board 4:1
const IMG_KINDS = {
  cover:  { w: 960,  h: 480, field: 'image_url',  label: 'Portada', hint: 'en el dashboard' },
  banner: { w: 1800, h: 450, field: 'banner_url', label: 'Banner',  hint: 'arriba del board' },
};

function dropZone(kind, url) {
  const k = IMG_KINDS[kind];
  const has = url && isSafeUrl(url);
  return `
  <div class="img-field" data-kind="${kind}">
    <span class="label">${k.label} <span class="muted">· ${k.hint}</span></span>
    <label class="drop drop-${kind} ${has ? 'has' : ''}" style="aspect-ratio:${k.w}/${k.h}">
      <img alt="" ${has ? `src="${esc(url)}"` : 'hidden'}>
      <span class="drop-empty">${icon('image', 22)}<b>Subir imagen</b><small>o arrástrala aquí</small></span>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
    </label>
    <button type="button" class="btn ghost small danger-text img-remove" ${has ? '' : 'hidden'}>Quitar</button>
  </div>`;
}

// ---------- Proyecto ----------
export function openProjectForm(project, onSaved) {
  const editing = !!project;
  const p = project || { name: '', description: '', image_url: '', area_ids: [], status: 'active' };
  const m = openModal(`
    <h2>${editing ? 'Ajustes del proyecto' : 'Nuevo proyecto'}</h2>
    <form class="stack" id="pform">
      <label>Nombre del proyecto
        <input name="name" required maxlength="80" value="${esc(p.name)}" autofocus>
      </label>
      <label>Descripción <span class="muted">(opcional)</span>
        <textarea name="description" rows="2" maxlength="2000">${esc(p.description)}</textarea>
      </label>
      <div class="img-fields">
        ${dropZone('cover', p.image_url)}
        ${dropZone('banner', p.banner_url)}
      </div>
      <fieldset>
        <legend>Áreas involucradas</legend>
        <div class="area-pick">
          ${state.areas.map((a) => `
            <label class="chip-check" style="--c:${esc(a.color)}">
              <input type="checkbox" name="area" value="${a.id}" ${p.area_ids?.includes(a.id) ? 'checked' : ''}>
              <span>${esc(a.name)}</span>
            </label>`).join('')}
        </div>
      </fieldset>
      ${editing ? `
        <label class="switch"><input type="checkbox" name="archived" ${p.status === 'archived' ? 'checked' : ''}>
          <span>Archivar (se oculta de "en curso")</span></label>` : ''}
      <p class="form-error" role="alert"></p>
      <div class="row between">
        ${editing ? `<button type="button" class="btn ghost danger-text" id="del-project">${icon('trash')} Borrar proyecto</button>` : '<span></span>'}
        <div class="row gap">
          <button type="button" class="btn ghost" data-close>Cancelar</button>
          <button class="btn">${editing ? 'Guardar' : 'Crear proyecto'}</button>
        </div>
      </div>
    </form>`);

  const form = $('#pform', m.el);
  // Imágenes elegidas: { blob } nueva, { remove: true } quitar, o nada = igual
  const pending = {};
  let created = null; // si se creó pero falló una imagen, reintentar no duplica
  const previews = [];
  $$('.img-field', m.el).forEach((box) => {
    const kind = box.dataset.kind;
    const zone = $('.drop', box);
    const img = $('img', zone);
    const input = $('input[type=file]', zone);
    const removeBtn = $('.img-remove', box);
    const use = async (file) => {
      if (!file) return;
      try {
        const blob = await prepareImage(file, IMG_KINDS[kind].w, IMG_KINDS[kind].h);
        const url = URL.createObjectURL(blob);
        previews.push(url);
        pending[kind] = { blob };
        img.src = url; img.hidden = false; zone.classList.add('has'); removeBtn.hidden = false;
      } catch (ex) { toastError(ex); }
    };
    input.addEventListener('change', () => { use(input.files?.[0]); input.value = ''; });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); use(e.dataTransfer.files?.[0]); });
    removeBtn.addEventListener('click', () => {
      pending[kind] = { remove: true };
      img.removeAttribute('src'); img.hidden = true; zone.classList.remove('has'); removeBtn.hidden = true;
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const submit = form.querySelector('button:not([type])');
    const data = {
      name: String(f.get('name')).trim(),
      description: String(f.get('description') || '').trim(),
      area_ids: f.getAll('area').map(Number),
    };
    if (editing) data.status = f.get('archived') ? 'archived' : 'active';
    submit.disabled = true;
    try {
      const target = project || created;
      let saved = target
        ? await api.updateProject(target.id, data)
        : await api.createProject(data, state.user.id);
      if (!target) {
        created = saved;
        await api.createSprint({ project_id: saved.id, name: '1er Sprint', start_date: todayISO() });
      }
      // subir / quitar imágenes (necesitan el id del proyecto)
      const imgPatch = {};
      const keep = {};
      for (const [kind, change] of Object.entries(pending)) {
        const field = IMG_KINDS[kind].field;
        if (change.remove) { imgPatch[field] = null; keep[kind] = null; }
        else if (change.blob) {
          submit.textContent = 'Subiendo imágenes…';
          const up = await api.uploadProjectImage(saved.id, kind, change.blob);
          imgPatch[field] = up.url; keep[kind] = up.path;
          delete pending[kind];
        }
      }
      if (Object.keys(imgPatch).length) {
        saved = await api.updateProject(saved.id, imgPatch);
        for (const [kind, path] of Object.entries(keep)) api.cleanProjectImages(saved.id, kind, path);
      }
      previews.forEach((u) => URL.revokeObjectURL(u));
      m.close();
      toast(editing ? 'Proyecto actualizado' : 'Proyecto creado 🎉', 'success');
      onSaved?.(saved);
    } catch (ex) {
      $('.form-error', form).textContent = ex.message;
      submit.disabled = false;
      submit.textContent = editing || created ? 'Reintentar' : 'Crear proyecto';
    }
  });

  $('#del-project', m.el)?.addEventListener('click', async () => {
    const typed = prompt(`Esto borra el proyecto, sus sprints y TODAS sus tareas.\nEscribe "${project.name}" para confirmar:`);
    if (typed !== project.name) { if (typed !== null) toast('El nombre no coincide', 'error'); return; }
    try {
      await api.deleteProject(project.id);
      m.close();
      toast('Proyecto borrado', 'success');
      location.hash = '#/';
    } catch (ex) { toastError(ex); }
  });
}

// ---------- Sprint ----------
export function openSprintForm(projectId, sprint, onSaved) {
  const editing = !!sprint;
  const s = sprint || { name: '', goal: '', start_date: todayISO(), end_date: '' };
  const m = openModal(`
    <h2>${editing ? 'Editar sprint' : 'Nuevo sprint'}</h2>
    <form class="stack" id="sform">
      <label>Nombre <input name="name" required maxlength="80" value="${esc(s.name)}" placeholder="2do Sprint" autofocus></label>
      <label>Objetivo <span class="muted">(opcional)</span>
        <input name="goal" maxlength="500" value="${esc(s.goal || '')}"></label>
      <div class="row gap">
        <label class="grow">Inicio <input type="date" name="start_date" value="${esc(s.start_date || '')}"></label>
        <label class="grow">Fin <input type="date" name="end_date" value="${esc(s.end_date || '')}"></label>
      </div>
      <p class="form-error" role="alert"></p>
      <div class="row between">
        ${editing ? `<button type="button" class="btn ghost danger-text" id="del-sprint">${icon('trash')} Borrar</button>` : '<span></span>'}
        <div class="row gap">
          <button type="button" class="btn ghost" data-close>Cancelar</button>
          <button class="btn">${editing ? 'Guardar' : 'Crear sprint'}</button>
        </div>
      </div>
    </form>`);
  const form = $('#sform', m.el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const data = {
      name: String(f.get('name')).trim(),
      goal: String(f.get('goal') || '').trim(),
      start_date: f.get('start_date') || null,
      end_date: f.get('end_date') || null,
    };
    if (data.start_date && data.end_date && data.end_date < data.start_date) {
      $('.form-error', form).textContent = 'La fecha de fin no puede ser antes del inicio.';
      return;
    }
    try {
      const saved = editing ? await api.updateSprint(sprint.id, data)
        : await api.createSprint({ ...data, project_id: projectId });
      m.close();
      onSaved?.(saved);
    } catch (ex) { $('.form-error', form).textContent = ex.message; }
  });
  $('#del-sprint', m.el)?.addEventListener('click', async () => {
    if (!(await confirmDialog('Se borra el sprint. Sus tareas NO se borran: pasan al Backlog.', { okText: 'Borrar sprint' }))) return;
    try { await api.deleteSprint(sprint.id); m.close(); onSaved?.(null); }
    catch (ex) { toastError(ex); }
  });
}

// ---------- Miembros e invitaciones ----------
export function openMembers(project, myRole, onChange) {
  const canManage = myRole === 'admin';
  const m = openModal(`
    <h2>Miembros de ${esc(project.name)}</h2>
    <div id="members" class="member-list"><p class="muted">Cargando…</p></div>
    ${canManage ? `
      <hr>
      <h3>${icon('link')} Invitar con link</h3>
      <p class="muted small">Solo quien tenga el link (y una cuenta) puede entrar a este board.
      El link se muestra <b>una sola vez</b>; cópialo y mándalo por privado.</p>
      <form class="invite-form" id="iform">
        <label>Rol
          <select name="role">
            <option value="member">Miembro (edita tareas)</option>
            <option value="viewer">Solo ver (y comentar)</option>
            <option value="admin">Admin (invita y administra)</option>
          </select>
        </label>
        <label>Expira en
          <select name="days">
            <option value="1">1 día</option><option value="7" selected>7 días</option>
            <option value="30">30 días</option><option value="90">90 días</option>
          </select>
        </label>
        <label>Usos
          <select name="uses">
            <option value="1">1 persona</option><option value="5">5 personas</option>
            <option value="">Sin límite</option>
          </select>
        </label>
        <label class="grow">Nota <input name="note" maxlength="80" placeholder="p. ej. para Luis"></label>
        <button class="btn">Generar link</button>
      </form>
      <div id="new-link"></div>
      <h3 class="mt">Links activos</h3>
      <div id="invites" class="invite-list"><p class="muted">Cargando…</p></div>
    ` : ''}`, { wide: true, onClose: onChange });

  async function loadMembers() {
    const host = $('#members', m.el);
    try {
      const members = await api.listMembers(project.id);
      host.innerHTML = members.map((mb) => {
        const me = mb.user_id === state.user.id;
        return `
        <div class="member">
          ${avatar(mb.profiles, 'md')}
          <div class="grow"><b>${esc(mb.profiles?.full_name || 'Sin nombre')}${me ? ' (tú)' : ''}</b>
            <span class="muted small">${esc(mb.profiles?.email || '')}</span></div>
          ${canManage ? `
            <select data-role="${mb.user_id}" aria-label="Rol">
              ${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${k === mb.role ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
            <button class="icon-btn" data-remove="${mb.user_id}" title="Sacar del proyecto">${icon('trash', 16)}</button>
          ` : `<span class="role-pill">${ROLE_LABEL[mb.role]}</span>
            ${me ? `<button class="btn ghost small" data-remove="${mb.user_id}">Salir</button>` : ''}`}
        </div>`;
      }).join('');
      $$('[data-role]', host).forEach((sel) => sel.addEventListener('change', async () => {
        try { await api.setMemberRole(project.id, sel.dataset.role, sel.value); toast('Rol actualizado', 'success'); }
        catch (ex) { toastError(ex); loadMembers(); }
      }));
      $$('[data-remove]', host).forEach((b) => b.addEventListener('click', async () => {
        const self = b.dataset.remove === state.user.id;
        if (!(await confirmDialog(self ? 'Saldrás de este board y necesitarás otra invitación para volver.'
          : 'Esta persona ya no podrá entrar al board.', { okText: self ? 'Salir' : 'Sacar' }))) return;
        try {
          await api.removeMember(project.id, b.dataset.remove);
          if (self) { m.close(); location.hash = '#/'; return; }
          loadMembers();
        } catch (ex) { toastError(ex); }
      }));
    } catch (ex) { host.innerHTML = `<p class="form-error">${esc(ex.message)}</p>`; }
  }

  async function loadInvites() {
    const host = $('#invites', m.el);
    if (!host) return;
    try {
      const list = (await api.listInvites(project.id)).filter((i) =>
        !i.revoked && new Date(i.expires_at) > new Date() && (i.max_uses == null || i.uses < i.max_uses));
      host.innerHTML = list.length ? list.map((i) => `
        <div class="invite">
          <span class="role-pill">${ROLE_LABEL[i.role]}</span>
          <span class="grow">${esc(i.note || 'Link sin nota')}
            <span class="muted small">· usado ${i.uses}${i.max_uses ? '/' + i.max_uses : ''} · vence ${longDate(i.expires_at)}</span></span>
          <button class="btn ghost small danger-text" data-revoke="${i.id}">Revocar</button>
        </div>`).join('') : `<p class="muted small">No hay links activos.</p>`;
      $$('[data-revoke]', host).forEach((b) => b.addEventListener('click', async () => {
        try { await api.revokeInvite(b.dataset.revoke); toast('Link revocado', 'success'); loadInvites(); }
        catch (ex) { toastError(ex); }
      }));
    } catch (ex) { host.innerHTML = `<p class="form-error">${esc(ex.message)}</p>`; }
  }

  $('#iform', m.el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const token = await api.createInvite(project.id, f.get('role'), Number(f.get('days')),
        f.get('uses') ? Number(f.get('uses')) : null, String(f.get('note') || '').trim());
      const url = `${location.origin}${location.pathname}#/invite/${token}`;
      $('#new-link', m.el).innerHTML = `
        <div class="new-link">
          <input readonly value="${esc(url)}" aria-label="Link de invitación">
          <button class="btn" id="copy-link">${icon('copy')} Copiar</button>
        </div>`;
      const input = $('#new-link input', m.el);
      input.select();
      $('#copy-link', m.el).onclick = async () => {
        try { await navigator.clipboard.writeText(url); toast('Link copiado 📋', 'success'); }
        catch { input.select(); document.execCommand('copy'); toast('Link copiado', 'success'); }
      };
      e.target.reset();
      loadInvites();
    } catch (ex) { toastError(ex); }
  });

  loadMembers();
  loadInvites();
}

// Detalle de una tarea: descripción, checklist, entregable, asignados, comentarios
import * as api from './api.js';
import { state } from './state.js';
import {
  esc, icon, avatar, openModal, confirmDialog, toast, toastError, relTime, longDate, STATUS, isSafeUrl, $, $$,
} from './ui.js';

export async function openTask(taskId, ctx) {
  const { project, members, sprints, canEdit, canManage, onChange } = ctx;
  let task;
  try { task = await api.getTask(taskId); } catch (e) { toastError(e); return; }
  if (!task) { toast('Esa tarea ya no existe', 'error'); onChange?.(); return; }

  const memberById = new Map(members.map((m) => [m.user_id, m.profiles]));
  const dis = canEdit ? '' : 'disabled';
  let changed = false;

  const m = openModal(`
    <div class="task-modal">
      <div class="task-main">
        <input class="task-title" id="t-title" value="${esc(task.title)}" maxlength="200" ${dis} aria-label="Título">
        <p class="muted small">en <b>${esc(project.name)}</b> · creada ${relTime(task.created_at)}
          <span class="saved" id="saved" aria-live="polite"></span></p>

        <section>
          <h4>Descripción</h4>
          <textarea id="t-desc" rows="5" maxlength="10000" placeholder="${canEdit ? '¿De qué se trata esta tarea?' : 'Sin descripción'}" ${dis}>${esc(task.description)}</textarea>
        </section>

        <section>
          <div class="row between"><h4>${icon('checklist')} Checklist</h4><span class="muted small" id="ck-count"></span></div>
          <div class="bar thin"><span id="ck-bar"></span></div>
          <ul class="checklist" id="checklist"></ul>
          ${canEdit ? `<form id="ck-add" class="row gap"><input name="text" maxlength="300" placeholder="Agregar elemento" class="grow"><button class="btn ghost small">Agregar</button></form>` : ''}
        </section>

        <section>
          <h4>${icon('link')} Entregable</h4>
          <div class="row gap">
            <input id="t-deliv" class="grow" maxlength="1000" value="${esc(task.deliverable)}" placeholder="Link del PR, Figma, doc, o descripción del entregable" ${dis}>
            <a id="deliv-open" class="btn ghost small" target="_blank" rel="noopener noreferrer" hidden>Abrir</a>
          </div>
        </section>

        <section>
          <h4>${icon('chat')} Comentarios</h4>
          <div id="comments" class="comments"></div>
          <form id="c-add" class="comment-form">
            ${avatar(state.profile, 'sm')}
            <textarea name="body" rows="2" maxlength="4000" placeholder="Escribe un comentario…" class="grow"></textarea>
            <button class="btn small">Enviar</button>
          </form>
        </section>
      </div>

      <aside class="task-side">
        <label>Estado
          <select id="t-status" ${dis}>${STATUS.map((s) => `<option value="${s.id}" ${s.id === task.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
        </label>
        <label>Área
          <select id="t-area" ${dis}>
            <option value="">Sin área</option>
            ${state.areas.map((a) => `<option value="${a.id}" ${a.id === task.area_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          </select>
        </label>
        <label>Sprint
          <select id="t-sprint" ${dis}>
            <option value="">Backlog</option>
            ${sprints.map((s) => `<option value="${s.id}" ${s.id === task.sprint_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
          </select>
        </label>
        <label>Fecha límite
          <input type="date" id="t-due" value="${esc(task.due_date || '')}" ${dis}>
        </label>
        <div>
          <span class="label">Personas asignadas</span>
          <div class="assignees" id="assignees">
            ${members.map((mb) => `
              <label class="assignee">
                <input type="checkbox" value="${mb.user_id}" ${task.task_assignees.some((a) => a.user_id === mb.user_id) ? 'checked' : ''} ${dis}>
                ${avatar(mb.profiles, 'sm')}<span>${esc(mb.profiles?.full_name || mb.profiles?.email)}</span>
              </label>`).join('')}
          </div>
        </div>
        ${canEdit ? `<button class="btn ghost danger-text block" id="t-delete">${icon('trash')} Borrar tarea</button>` : ''}
        <p class="muted small">Actualizada ${relTime(task.updated_at)}</p>
      </aside>
    </div>`, { wide: true, onClose: async () => { await flushPending(); if (changed) onChange?.(); } });

  // Si cierran el modal con Esc mientras escriben, guardamos lo pendiente
  async function flushPending() {
    if (!canEdit) return;
    const patch = {};
    const t = $('#t-title', m.el).value.trim();
    if (t && t !== task.title) patch.title = t;
    const d = $('#t-desc', m.el).value;
    if (d !== task.description) patch.description = d;
    const dv = $('#t-deliv', m.el).value.trim();
    if (dv !== task.deliverable) patch.deliverable = dv;
    if (Object.keys(patch).length) { await save(patch); }
  }

  const el = m.el;
  const savedEl = $('#saved', el);
  let savedTimer;
  const flashSaved = () => {
    changed = true;
    savedEl.textContent = '· Guardado ✓';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (savedEl.textContent = ''), 1600);
  };
  async function save(patch) {
    try { Object.assign(task, await api.updateTask(task.id, patch)); flashSaved(); }
    catch (e) { toastError(e); }
  }

  // campos simples (autoguardado)
  const title = $('#t-title', el);
  title.addEventListener('change', () => {
    const v = title.value.trim();
    if (!v) { title.value = task.title; return; }
    if (v !== task.title) save({ title: v });
  });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') title.blur(); });
  const desc = $('#t-desc', el);
  desc.addEventListener('change', () => { if (desc.value !== task.description) save({ description: desc.value }); });
  $('#t-status', el).addEventListener('change', (e) => save({ status: e.target.value, position: Date.now() / 1e6 }));
  $('#t-area', el).addEventListener('change', (e) => save({ area_id: e.target.value ? Number(e.target.value) : null }));
  $('#t-sprint', el).addEventListener('change', (e) => save({ sprint_id: e.target.value || null }));
  $('#t-due', el).addEventListener('change', (e) => save({ due_date: e.target.value || null }));

  const deliv = $('#t-deliv', el);
  const delivOpen = $('#deliv-open', el);
  const syncDeliv = () => {
    const v = deliv.value.trim();
    delivOpen.hidden = !isSafeUrl(v);
    if (isSafeUrl(v)) delivOpen.href = v;
  };
  syncDeliv();
  deliv.addEventListener('input', syncDeliv);
  deliv.addEventListener('change', () => { const v = deliv.value.trim(); if (v !== task.deliverable) save({ deliverable: v }); });

  // asignados
  $('#assignees', el).addEventListener('change', async () => {
    const prev = task.task_assignees.map((a) => a.user_id);
    const next = $$('#assignees input:checked', el).map((i) => i.value);
    try {
      await api.setAssignees(task.id, next, prev);
      task.task_assignees = next.map((user_id) => ({ user_id }));
      flashSaved();
    } catch (e) { toastError(e); }
  });

  // checklist
  function renderChecklist() {
    const items = task.checklist_items;
    const done = items.filter((i) => i.done).length;
    $('#ck-count', el).textContent = items.length ? `${done}/${items.length}` : '';
    $('#ck-bar', el).style.width = items.length ? `${(done / items.length) * 100}%` : '0%';
    $('#checklist', el).innerHTML = items.map((i) => `
      <li class="${i.done ? 'done' : ''}">
        <label><input type="checkbox" data-ck="${i.id}" ${i.done ? 'checked' : ''} ${dis}><span>${esc(i.text)}</span></label>
        ${canEdit ? `<button class="icon-btn tiny" data-ck-del="${i.id}" aria-label="Quitar">${icon('x', 14)}</button>` : ''}
      </li>`).join('') || (canEdit ? '' : '<li class="muted small">Sin checklist</li>');
  }
  renderChecklist();
  $('#checklist', el).addEventListener('change', async (e) => {
    const id = e.target.dataset.ck;
    if (!id) return;
    const item = task.checklist_items.find((i) => i.id === id);
    item.done = e.target.checked;
    renderChecklist();
    try { await api.updateChecklistItem(id, { done: item.done }); flashSaved(); }
    catch (ex) { toastError(ex); item.done = !item.done; renderChecklist(); }
  });
  $('#checklist', el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ck-del]');
    if (!b) return;
    try {
      await api.deleteChecklistItem(b.dataset.ckDel);
      task.checklist_items = task.checklist_items.filter((i) => i.id !== b.dataset.ckDel);
      renderChecklist(); flashSaved();
    } catch (ex) { toastError(ex); }
  });
  $('#ck-add', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    if (!text) return;
    try {
      const pos = Math.max(0, ...task.checklist_items.map((i) => i.position)) + 1;
      task.checklist_items.push(await api.addChecklistItem(task.id, text, pos));
      e.target.reset(); renderChecklist(); flashSaved();
      e.target.text.focus();
    } catch (ex) { toastError(ex); }
  });

  // comentarios
  function renderComments() {
    $('#comments', el).innerHTML = task.comments.map((c) => `
      <div class="comment">
        ${avatar(c.profiles, 'sm')}
        <div class="grow">
          <p><b>${esc(c.profiles?.full_name || 'Alguien')}</b> <span class="muted small">${relTime(c.created_at)}</span></p>
          <p class="comment-body">${esc(c.body)}</p>
        </div>
        ${c.user_id === state.user.id || canManage ? `<button class="icon-btn tiny" data-c-del="${c.id}" aria-label="Borrar comentario">${icon('trash', 14)}</button>` : ''}
      </div>`).join('') || '<p class="muted small">Aún no hay comentarios.</p>';
  }
  renderComments();
  $('#c-add', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = e.target.body.value.trim();
    if (!body) return;
    try { task.comments.push(await api.addComment(task.id, body)); e.target.reset(); renderComments(); }
    catch (ex) { toastError(ex); }
  });
  $('#c-add textarea', el).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.target.form.requestSubmit();
  });
  $('#comments', el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-c-del]');
    if (!b) return;
    try {
      await api.deleteComment(b.dataset.cDel);
      task.comments = task.comments.filter((c) => c.id !== b.dataset.cDel);
      renderComments();
    } catch (ex) { toastError(ex); }
  });

  $('#t-delete', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Se borra "${task.title}" con su checklist y comentarios.`, { okText: 'Borrar tarea' }))) return;
    try { await api.deleteTask(task.id); changed = true; m.close(); toast('Tarea borrada', 'success'); }
    catch (ex) { toastError(ex); }
  });
}

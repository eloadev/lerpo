// El board: sprints a la izquierda, columnas Upcoming / In progress / Done
import * as api from './api.js';
import { state, lastSprint } from './state.js';
import {
  esc, icon, avatar, toast, toastError, shortDate, todayISO, STATUS, ROLE_LABEL, anyModalOpen, $, $$,
} from './ui.js';
import { openSprintForm, openMembers, openProjectForm } from './project-modals.js';
import { openTask } from './task-modal.js';

let cleanup = null;
export function leaveBoard() { cleanup?.(); cleanup = null; }

function pickSprint(sprints, requested, pid) {
  const ids = new Set(sprints.map((s) => s.id));
  if (requested === 'backlog' || ids.has(requested)) return requested;
  const remembered = lastSprint(pid);
  if (remembered === 'backlog' || ids.has(remembered)) return remembered;
  const today = todayISO();
  const current = sprints.find((s) => (!s.start_date || s.start_date <= today) && (!s.end_date || s.end_date >= today));
  return current?.id || sprints.at(-1)?.id || 'backlog';
}

function sprintRange(s) {
  if (!s?.start_date && !s?.end_date) return 'Sin fechas';
  return `${shortDate(s.start_date) || '…'} – ${shortDate(s.end_date) || '…'}`;
}

export async function renderBoard(main, pid, requestedSprint) {
  leaveBoard();
  main.innerHTML = `<div class="board-loading"><div class="skeleton tall"></div></div>`;

  let project, members, sprints, myProjects;
  try {
    [project, members, sprints, myProjects] = await Promise.all([
      api.getProject(pid), api.listMembers(pid), api.listSprints(pid), api.listMyProjects(),
    ]);
  } catch (e) { toastError(e); }

  const myMember = members?.find((m) => m.user_id === state.user.id);
  const role = myMember?.role || (state.profile?.is_admin ? 'admin' : null);
  if (!project || !role) {
    main.innerHTML = `
      <div class="page"><div class="empty-state">
        ${icon('lock', 40)}
        <h2>No tienes acceso a este board</h2>
        <p class="muted">Necesitas un link de invitación de alguien admin del proyecto.</p>
        <a class="btn ghost" href="#/">${icon('arrowL')} Volver al dashboard</a>
      </div></div>`;
    return;
  }

  const canEdit = role === 'admin' || role === 'member';
  const canManage = role === 'admin';
  const memberById = new Map(members.map((m) => [m.user_id, m.profiles]));
  let sprintId = pickSprint(sprints, requestedSprint, pid);
  lastSprint(pid, sprintId);
  let tasks = [];
  let sortables = [];

  const sprint = () => sprints.find((s) => s.id === sprintId);

  main.innerHTML = `
  <div class="board">
    ${project.banner_url && /^https:\/\//i.test(project.banner_url) ? `
      <div class="board-banner"><img src="${esc(project.banner_url)}" alt="" referrerpolicy="no-referrer"></div>` : ''}
    <header class="board-head">
      <div class="proj-switch">
        <select id="proj-select" aria-label="Cambiar de proyecto">
          ${myProjects.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
        ${icon('chevron', 16)}
      </div>
      <div class="sprint-title">
        <h1 id="sprint-name"></h1>
        <span class="date-chip" id="sprint-dates">${icon('cal', 14)} <span></span></span>
        ${canManage ? '' : `<span class="role-pill">${ROLE_LABEL[role]}</span>`}
      </div>
      <div class="board-actions">
        <span class="progress-mini" id="progress-mini" title="Avance del sprint"></span>
        <div class="avatars">${members.slice(0, 5).map((m) => avatar(m.profiles)).join('')}${members.length > 5 ? `<span class="avatar avatar-sm more">+${members.length - 5}</span>` : ''}</div>
        <button class="btn ghost" id="btn-members">${icon('users')} <span class="hide-sm">${canManage ? 'Invitar' : 'Miembros'}</span></button>
        ${canManage ? `<button class="icon-btn" id="btn-settings" title="Ajustes del proyecto">${icon('gear')}</button>` : ''}
      </div>
    </header>

    <div class="board-body ${canManage ? '' : 'no-sprints'}">
      ${canManage ? `<aside class="sprints" aria-label="Sprints">
        <div class="sprints-head">
          <h2>Sprints</h2>
          <button class="icon-btn" id="new-sprint" title="Nuevo sprint">${icon('plus')}</button>
        </div>
        <nav id="sprint-list"></nav>
        <p class="role-note muted small">Tu rol: <b>${ROLE_LABEL[role]}</b></p>
      </aside>` : ''}

      <section class="columns" id="columns">
        ${STATUS.map((st) => `
          <div class="column" data-status="${st.id}">
            <div class="column-head">
              <h3>${st.label}</h3><span class="count" data-count="${st.id}">0</span>
            </div>
            <div class="cards" data-status="${st.id}"></div>
            ${canManage ? `
              <form class="quick-add" data-status="${st.id}">
                <input name="title" placeholder="+ Añadir tarea" maxlength="200" aria-label="Nueva tarea en ${st.label}">
              </form>` : ''}
          </div>`).join('')}
      </section>
    </div>
  </div>`;

  // ---------- sprints ----------
  function renderSprints() {
    const nav = $('#sprint-list', main);
    const today = todayISO();
    if (nav) nav.innerHTML = [
      ...sprints.map((s) => {
        const live = (!s.start_date || s.start_date <= today) && (!s.end_date || s.end_date >= today) && s.start_date;
        return `
        <a href="#/p/${pid}/s/${s.id}" class="sprint-item ${s.id === sprintId ? 'on' : ''}">
          <span class="grow"><b>${esc(s.name)}</b><small>${sprintRange(s)}</small></span>
          ${live ? '<span class="live-dot" title="En curso"></span>' : ''}
          ${canManage ? `<button class="icon-btn tiny" data-edit-sprint="${s.id}" title="Editar sprint">${icon('edit', 14)}</button>` : ''}
        </a>`;
      }),
      `<a href="#/p/${pid}/s/backlog" class="sprint-item backlog ${sprintId === 'backlog' ? 'on' : ''}">
        <span class="grow"><b>${icon('inbox', 14)} Backlog</b><small>Tareas sin sprint</small></span></a>`,
    ].join('');
    if (nav) $$('[data-edit-sprint]', nav).forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const s = sprints.find((x) => x.id === b.dataset.editSprint);
      openSprintForm(pid, s, async () => { sprints = await api.listSprints(pid); renderBoard(main, pid, sprintId); });
    }));
    const s = sprint();
    $('#sprint-name', main).textContent = s ? s.name : 'Backlog';
    $('#sprint-dates span', main).textContent = s ? sprintRange(s) : 'Sin sprint asignado';
    $('#sprint-dates', main).title = s?.goal || '';
  }

  // ---------- tarjetas ----------
  function cardHTML(t) {
    const area = state.areaById.get(t.area_id);
    const total = t.checklist_items?.length || 0;
    const done = t.checklist_items?.filter((c) => c.done).length || 0;
    const overdue = t.due_date && t.status !== 'done' && t.due_date < todayISO();
    const people = (t.task_assignees || []).map((a) => memberById.get(a.user_id)).filter(Boolean);
    return `
    <article class="tcard" data-id="${t.id}" tabindex="0" style="--area:${esc(area?.color || 'var(--line)')}">
      ${area ? `<span class="tcard-area">${esc(area.name)}</span>` : ''}
      <h4>${esc(t.title)}</h4>
      <div class="tcard-meta">
        ${total ? `<span class="${done === total ? 'ok' : ''}">${icon('checklist', 14)} ${done}/${total}</span>` : ''}
        ${t.due_date ? `<span class="${overdue ? 'late' : ''}">${icon('cal', 14)} ${shortDate(t.due_date)}</span>` : ''}
        ${t.deliverable ? `<span title="Tiene entregable">${icon('link', 14)}</span>` : ''}
        <span class="grow"></span>
        <span class="avatars">${people.slice(0, 3).map((p) => avatar(p, 'xs')).join('')}${people.length > 3 ? `<span class="avatar avatar-xs more">+${people.length - 3}</span>` : ''}</span>
      </div>
    </article>`;
  }

  function renderCards() {
    for (const st of STATUS) {
      const list = tasks.filter((t) => t.status === st.id).sort((a, b) => a.position - b.position);
      const host = $(`.cards[data-status="${st.id}"]`, main);
      host.innerHTML = list.map(cardHTML).join('') || '';
      $(`[data-count="${st.id}"]`, main).textContent = list.length;
    }
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('#progress-mini', main).innerHTML = `<span class="bar"><span style="width:${pct}%"></span></span>${pct}%`;
  }

  async function loadTasks() {
    try { tasks = await api.listTasks(pid, sprintId); renderCards(); }
    catch (e) { toastError(e); }
  }

  // ---------- arrastrar y soltar ----------
  function setupDrag() {
    sortables.forEach((s) => s.destroy());
    sortables = [];
    if (!canEdit || !window.Sortable) return;
    $$('.cards', main).forEach((el) => {
      sortables.push(window.Sortable.create(el, {
        group: 'tasks', animation: 160, ghostClass: 'drag-ghost', chosenClass: 'drag-chosen',
        delay: 120, delayOnTouchOnly: true,
        onEnd: async (evt) => {
          const status = evt.to.dataset.status;
          const ids = $$('.tcard', evt.to).map((c) => c.dataset.id);
          ids.forEach((id, i) => {
            const t = tasks.find((x) => x.id === id);
            if (t) { t.status = status; t.position = i + 1; }
          });
          renderCards();
          try { await api.reorderTasks(status, ids); }
          catch (e) { toastError(e); loadTasks(); }
        },
      }));
    });
  }

  // ---------- eventos ----------
  $('#proj-select', main).addEventListener('change', (e) => { location.hash = `#/p/${e.target.value}`; });
  $('#btn-members', main).addEventListener('click', () => openMembers(project, role, () => {}));
  $('#btn-settings', main)?.addEventListener('click', () =>
    openProjectForm(project, () => renderBoard(main, pid, sprintId)));
  $('#new-sprint', main)?.addEventListener('click', () =>
    openSprintForm(pid, null, (s) => { location.hash = `#/p/${pid}/s/${s.id}`; }));

  $('#columns', main).addEventListener('click', (e) => {
    const c = e.target.closest('.tcard');
    if (c) openTask(c.dataset.id, { project, members, sprints, canEdit, canManage, onChange: loadTasks });
  });
  $('#columns', main).addEventListener('keydown', (e) => {
    const c = e.target.closest('.tcard');
    if (c && e.key === 'Enter') c.click();
  });

  $$('.quick-add', main).forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    if (!title) return;
    const status = form.dataset.status;
    const maxPos = Math.max(0, ...tasks.filter((t) => t.status === status).map((t) => t.position));
    form.title.disabled = true;
    try {
      const t = await api.createTask({
        project_id: pid, sprint_id: sprintId === 'backlog' ? null : sprintId,
        title, status, position: maxPos + 1, area_id: project.area_ids?.[0] || null,
      });
      tasks.push(t);
      renderCards();
      form.title.value = '';
    } catch (ex) { toastError(ex); }
    finally { form.title.disabled = false; form.title.focus(); }
  }));

  // ---------- tiempo real ----------
  let timer;
  let unsubscribe = () => {};
  try {
    unsubscribe = api.subscribeProject(pid, () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (document.querySelector('.drag-chosen')) return;
        const fresh = await api.listSprints(pid).catch(() => sprints);
        if (fresh.length !== sprints.length) { sprints = fresh; renderSprints(); }
        else sprints = fresh;
        if (!anyModalOpen()) loadTasks();
      }, 500);
    });
  } catch {}

  cleanup = () => { unsubscribe(); clearTimeout(timer); sortables.forEach((s) => s.destroy()); };

  renderSprints();
  await loadTasks();
  setupDrag();
}

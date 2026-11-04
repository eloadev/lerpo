// Dashboard general de ELOA: proyectos en curso con su % de avance
import * as api from './api.js';
import { state } from './state.js';
import { esc, icon, toast, toastError, isSafeUrl, $ } from './ui.js';
import { openProjectForm } from './project-modals.js';

function cover(p) {
  if (p.image_url && isSafeUrl(p.image_url)) {
    return `<img src="${esc(p.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  const first = state.areaById.get(p.area_ids?.[0])?.color || '#e9a5b3';
  const second = state.areaById.get(p.area_ids?.[1])?.color || first;
  return `<div class="cover-gen" style="--a:${esc(first)};--b:${esc(second)}"><span>${esc(p.name.slice(0, 2).toUpperCase())}</span></div>`;
}

function areaStrip(ids) {
  const areas = (ids || []).map((id) => state.areaById.get(id)).filter(Boolean);
  if (!areas.length) return `<div class="area-strip empty"></div>`;
  return `<div class="area-strip">${areas.map((a) =>
    `<span style="--c:${esc(a.color)}" title="${esc(a.name)}"></span>`).join('')}</div>`;
}

function card(p) {
  const locked = !p.is_member;
  return `
  <article class="pcard ${locked ? 'locked' : ''}" data-id="${p.id}" tabindex="0"
    aria-label="${esc(p.name)}, ${p.progress}% completado${locked ? ', sin acceso' : ''}">
    <div class="pcard-cover">${cover(p)}
      ${locked ? `<span class="lock-badge">${icon('lock', 14)} Solo con invitación</span>` : ''}
    </div>
    <div class="pcard-body">
      <h3>${esc(p.name)}</h3>
      ${p.description ? `<p class="muted clamp2">${esc(p.description)}</p>` : ''}
      <div class="pcard-areas">
        ${(p.area_ids || []).map((id) => state.areaById.get(id)).filter(Boolean)
          .map((a) => `<span class="chip" style="--c:${esc(a.color)}">${esc(a.name)}</span>`).join('')}
      </div>
    </div>
    ${areaStrip(p.area_ids)}
    <div class="pcard-progress">
      <div class="bar"><span style="width:${p.progress}%"></span></div>
      <strong>${p.progress}%</strong>
    </div>
    <footer class="pcard-foot muted">
      <span>${p.done_tasks}/${p.total_tasks} tareas</span>
      <span>${icon('users', 14)} ${p.member_count}</span>
    </footer>
  </article>`;
}

export async function renderDashboard(main) {
  main.innerHTML = `<div class="page"><div class="skeleton-grid">${'<div class="skeleton"></div>'.repeat(3)}</div></div>`;
  let projects;
  try { projects = await api.dashboard(); }
  catch (e) { toastError(e); main.innerHTML = `<div class="page"><p class="muted">No se pudo cargar el dashboard.</p></div>`; return; }

  const isAdmin = state.profile?.is_admin;
  const active = projects.filter((p) => p.status === 'active');
  const archived = projects.filter((p) => p.status === 'archived');

  if (!projects.length && !isAdmin) {
    main.innerHTML = `
      <div class="page">
        <div class="empty-state">
          ${icon('lock', 40)}
          <h2>Todavía no estás en ningún board</h2>
          <p class="muted">Pídele a quien administra el proyecto un <b>link de invitación</b>.
          Al abrirlo con tu sesión iniciada entrarás directo.</p>
        </div>
      </div>`;
    return;
  }

  const avg = active.length ? Math.round(active.reduce((s, p) => s + p.progress, 0) / active.length) : 0;

  main.innerHTML = `
  <div class="page">
    <header class="page-head">
      <div>
        <p class="eyebrow">Project dashboard</p>
        <h1>Proyectos en curso</h1>
      </div>
      <div class="head-stats">
        <div><b>${active.length}</b><span>activos</span></div>
        <div><b>${avg}%</b><span>avance promedio</span></div>
        ${isAdmin ? `<button class="btn" id="new-project">${icon('plus')} Nuevo proyecto</button>` : ''}
      </div>
    </header>

    ${active.length
      ? `<section class="pgrid">${active.map(card).join('')}</section>`
      : `<div class="empty-state small"><p class="muted">No hay proyectos activos.${isAdmin ? ' Crea el primero ✨' : ''}</p></div>`}

    ${archived.length ? `
      <details class="archived">
        <summary>Archivados (${archived.length})</summary>
        <section class="pgrid">${archived.map(card).join('')}</section>
      </details>` : ''}

    <aside class="legend">
      ${state.areas.map((a) => `<span class="chip" style="--c:${esc(a.color)}">${esc(a.name)}</span>`).join('')}
    </aside>
  </div>`;

  const open = (el) => {
    const p = projects.find((x) => x.id === el.dataset.id);
    if (!p) return;
    if (!p.is_member) {
      toast('Este board es privado. Necesitas un link de invitación para entrar.', 'info');
      return;
    }
    location.hash = `#/p/${p.id}`;
  };
  main.querySelectorAll('.pcard').forEach((el) => {
    el.addEventListener('click', () => open(el));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(el); });
  });
  $('#new-project', main)?.addEventListener('click', () =>
    openProjectForm(null, (p) => { location.hash = `#/p/${p.id}`; }));
}

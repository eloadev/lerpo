// Dashboard de LERPO: buscador, filtros, "Mis boards" y el resto del equipo
import * as api from './api.js';
import { state } from './state.js';
import { esc, icon, toast, toastError, isSafeUrl, lerp, $ } from './ui.js';
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
      ${p.created_by_me ? `<span class="mine-badge">Creado por ti</span>` : ''}
      ${p.progress >= 100 && p.total_tasks ? `<span class="done-badge">¡Completado!</span>${lerp('contentoLado', 'lerp-card')}` : ''}
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

// ---------- filtros (se recuerdan mientras la pestaña esté abierta) ----------
const FKEY = 'lerpo_dash_filters';
const DEFAULTS = { q: '', status: 'active', view: 'all', sort: 'recent', areas: [] };
function loadFilters() {
  try { return { ...DEFAULTS, ...JSON.parse(sessionStorage.getItem(FKEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
function saveFilters(f) { try { sessionStorage.setItem(FKEY, JSON.stringify(f)); } catch {} }

const norm = (t) => String(t || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const SORTS = {
  recent: (a, b) => b.created_at.localeCompare(a.created_at),
  name: (a, b) => a.name.localeCompare(b.name, 'es'),
  most: (a, b) => b.progress - a.progress || a.name.localeCompare(b.name, 'es'),
  least: (a, b) => a.progress - b.progress || a.name.localeCompare(b.name, 'es'),
};

function seg(name, value, options, label) {
  return `<div class="seg" role="radiogroup" aria-label="${label}">
    ${options.map(([v, t]) => `<button type="button" role="radio" data-seg="${name}" data-value="${v}"
      aria-checked="${v === value}" class="${v === value ? 'on' : ''}">${t}</button>`).join('')}
  </div>`;
}

export async function renderDashboard(main) {
  main.innerHTML = `<div class="page"><div class="skeleton-grid">${'<div class="skeleton"></div>'.repeat(3)}</div></div>`;
  let projects;
  try { projects = await api.dashboard(); }
  catch (e) { toastError(e); main.innerHTML = `<div class="page"><p class="muted">No se pudo cargar el dashboard.</p></div>`; return; }

  const isAdmin = state.profile?.is_admin;
  const joined = (p) => p.joined ?? p.is_member;      // si no se ha corrido el SQL 04
  const isMine = (p) => joined(p) || !!p.created_by_me;
  const active = projects.filter((p) => p.status === 'active');
  const avg = active.length ? Math.round(active.reduce((s, p) => s + p.progress, 0) / active.length) : 0;
  const myCount = projects.filter(isMine).length;
  const f = loadFilters();
  f.areas = f.areas.filter((id) => state.areaById.has(id));

  main.innerHTML = `
  <div class="page">
    <header class="hero">
      <div class="hero-text">
        <p class="eyebrow">LERPO · project dashboard</p>
        <h1>Proyectos <span class="hl-orange">en curso</span></h1>
        <p class="hero-sub">Hola, <b>${esc((state.profile?.full_name || '').split(' ')[0] || 'equipo')}</b>. Así va lo que estamos construyendo en ELOA.</p>
        <div class="head-stats">
          <div><b>${active.length}</b><span>activos</span></div>
          <div><b>${myCount}</b><span>mis boards</span></div>
          <div><b>${avg}%</b><span>avance promedio</span></div>
          ${isAdmin ? `<button class="btn" id="new-project">${icon('plus')} Nuevo proyecto</button>` : ''}
        </div>
      </div>
      ${lerp('saludando', 'lerp-hero')}
    </header>

    <section class="finder" aria-label="Buscar y filtrar boards">
      <div class="finder-row">
        <label class="search">
          ${icon('search')}
          <input type="search" id="q" placeholder="Buscar boards…" title="Busca por nombre, descripción o área" value="${esc(f.q)}" autocomplete="off" aria-label="Buscar boards">
          <kbd title="Atajo">/</kbd>
        </label>
        <label class="sort">
          <span class="sr-only">Ordenar</span>
          <select id="sort" aria-label="Ordenar">
            <option value="recent">Más recientes</option>
            <option value="name">Nombre A–Z</option>
            <option value="most">Más avance</option>
            <option value="least">Menos avance</option>
          </select>
        </label>
      </div>
      <div class="finder-row filters">
        ${seg('view', f.view, [['all', 'Todos'], ['mine', 'Mis boards'], ['locked', 'Sin acceso']], 'Qué boards ver')}
        ${seg('status', f.status, [['active', 'Activos'], ['archived', 'Archivados'], ['any', 'Todos los estados']], 'Estado')}
        <div class="area-filter" role="group" aria-label="Filtrar por área">
          ${state.areas.map((a) => `<button type="button" class="chip chip-toggle ${f.areas.includes(a.id) ? 'on' : ''}"
            data-area="${a.id}" aria-pressed="${f.areas.includes(a.id)}" style="--c:${esc(a.color)}">${esc(a.name)}</button>`).join('')}
        </div>
        <button type="button" class="btn ghost small" id="clear" hidden>${icon('x', 14)} Limpiar</button>
      </div>
      <p class="finder-count muted small" id="count" aria-live="polite"></p>
    </section>

    <div id="results"></div>
  </div>
  <footer class="site-foot">
    <span>Hecho con 💙 por <b>ELOA dev team</b></span>
    <span class="mono">Eat <span class="hl-orange">Logic</span> Output <span class="hl-pink">Art</span></span>
    <a href="https://eloadev.github.io/proyects/" target="_blank" rel="noopener">Nuestro portafolio ↗</a>
  </footer>`;

  const results = $('#results', main);
  $('#sort', main).value = f.sort;

  function filtered() {
    const q = norm(f.q.trim());
    return projects.filter((p) => {
      if (f.status !== 'any' && p.status !== f.status) return false;
      if (f.view === 'mine' && !isMine(p)) return false;
      if (f.view === 'locked' && p.is_member) return false;
      if (f.areas.length && !f.areas.some((id) => p.area_ids?.includes(id))) return false;
      if (q) {
        const areaNames = (p.area_ids || []).map((id) => state.areaById.get(id)?.name).join(' ');
        if (!norm(`${p.name} ${p.description} ${areaNames}`).includes(q)) return false;
      }
      return true;
    }).sort(SORTS[f.sort] || SORTS.recent);
  }

  const isFiltering = () => f.q.trim() || f.view !== 'all' || f.status !== 'active' || f.areas.length;

  function section(title, list, extra = '') {
    return `<section class="dash-section">
      <div class="dash-section-head"><h2>${title}</h2><span class="count">${list.length}</span></div>
      ${extra}
      ${list.length ? `<div class="pgrid">${list.map(card).join('')}</div>` : ''}
    </section>`;
  }

  function render() {
    saveFilters(f);
    const list = filtered();
    const mine = list.filter(isMine);
    const others = list.filter((p) => !isMine(p));
    $('#clear', main).hidden = !isFiltering();
    $('#count', main).textContent = isFiltering()
      ? `${list.length} de ${projects.length} boards`
      : '';

    if (!projects.length) {
      results.innerHTML = `<div class="empty-state">
        ${lerp('bombilla', 'lerp-empty')}
        <h2>Aún no hay proyectos</h2>
        <p class="muted">${isAdmin ? 'Crea el primero con <b>Nuevo proyecto</b> ✨' : 'Cuando el equipo cree uno, aparecerá aquí.'}</p>
      </div>`;
      return;
    }
    if (!list.length) {
      results.innerHTML = `<div class="empty-state">
        ${lerp('curioso2', 'lerp-empty')}
        <h2>No encontramos boards</h2>
        <p class="muted">${f.q.trim() ? `Nada coincide con “<b>${esc(f.q.trim())}</b>”` : 'Ningún board coincide con esos filtros'}.</p>
        <button type="button" class="btn ghost" data-clear>Limpiar búsqueda y filtros</button>
      </div>`;
      return;
    }

    const showMine = f.view !== 'locked';
    const showOthers = f.view !== 'mine';
    const mineHint = !mine.length && !isFiltering() ? `
      <div class="notice notice-lerp">${lerp('curioso2', 'lerp-notice')}
        <p>${isAdmin
          ? 'Todavía no creas ni participas en ningún board. Usa <b>Nuevo proyecto</b> para empezar.'
          : `${icon('lock', 14)} Aún no participas en ningún board. Pídele a su admin un <b>link de invitación</b>.`}</p>
      </div>` : '';

    results.innerHTML = [
      showMine && (mine.length || mineHint) ? section(`Mis boards <small>${isAdmin ? 'creados por ti o donde participas' : 'donde participas'}</small>`, mine, mineHint) : '',
      showOthers && others.length ? section(`${showMine ? 'Otros proyectos del equipo' : 'Sin acceso'} <small>se entra con invitación</small>`, others) : '',
    ].join('');
  }

  // ---------- eventos ----------
  let t;
  $('#q', main).addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { f.q = e.target.value; render(); }, 120);
  });
  $('#sort', main).addEventListener('change', (e) => { f.sort = e.target.value; render(); });
  main.addEventListener('click', (e) => {
    const segBtn = e.target.closest('[data-seg]');
    if (segBtn) {
      f[segBtn.dataset.seg] = segBtn.dataset.value;
      segBtn.parentElement.querySelectorAll('button').forEach((b) => {
        const on = b === segBtn; b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
      });
      render(); return;
    }
    const areaBtn = e.target.closest('[data-area]');
    if (areaBtn) {
      const id = Number(areaBtn.dataset.area);
      f.areas = f.areas.includes(id) ? f.areas.filter((x) => x !== id) : [...f.areas, id];
      areaBtn.classList.toggle('on'); areaBtn.setAttribute('aria-pressed', f.areas.includes(id));
      render(); return;
    }
    if (e.target.closest('#clear, [data-clear]')) {
      Object.assign(f, { ...DEFAULTS, sort: f.sort, areas: [] });
      $('#q', main).value = '';
      main.querySelectorAll('[data-seg]').forEach((b) => {
        const on = b.dataset.value === f[b.dataset.seg]; b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
      });
      main.querySelectorAll('[data-area]').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
      render(); $('#q', main).focus(); return;
    }
    const c = e.target.closest('.pcard');
    if (c) openCard(c);
  });
  main.addEventListener('keydown', (e) => {
    const c = e.target.closest('.pcard');
    if (c && e.key === 'Enter') openCard(c);
  });

  function openCard(el) {
    const p = projects.find((x) => x.id === el.dataset.id);
    if (!p) return;
    if (!p.is_member) {
      toast('Este board es privado. Necesitas un link de invitación para entrar.', 'info');
      return;
    }
    location.hash = `#/p/${p.id}`;
  }

  // Atajo: "/" para buscar
  const onSlash = (e) => {
    if (!document.body.contains(main.querySelector('#q'))) { document.removeEventListener('keydown', onSlash); return; }
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault(); $('#q', main).focus();
    }
  };
  document.addEventListener('keydown', onSlash);

  $('#new-project', main)?.addEventListener('click', () =>
    openProjectForm(null, (p) => { location.hash = `#/p/${p.id}`; }));

  render();
}

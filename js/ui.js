// Utilidades de interfaz compartidas
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- marca ELOA / LERPO ----------
const ASSETS = 'assets/';
export const LERP = {
  saludando: 'lerp-saludando', bombilla: 'lerp-bombilla', contento: 'lerp-contento',
  contentoLado: 'lerp-contento-lado', curioso: 'lerp-curioso', curioso2: 'lerp-curioso-2',
  determinado: 'lerp-determinado', parado: 'lerp-parado', mirandoArriba: 'lerp-mirando-arriba',
  triste: 'lerp-triste', bandana: 'lerp-bandana', bandana2: 'lerp-bandana-2',
};
// <img> de LERP. cls para tamaño/posición (ver .lerp-* en styles.css)
export function lerp(pose, cls = '', alt = '') {
  return `<img class="lerp ${cls}" src="${ASSETS}lerp/${LERP[pose] || pose}.svg" alt="${esc(alt)}" ${alt ? '' : 'aria-hidden="true"'} decoding="async">`;
}
// Logo ELOA que cambia a la versión blanca en tema oscuro (sigue el botón ☀️/🌙)
// kind: 'horizontal' | 'vertical' | 'texto' (solo letras, sin la cabeza de LERP)
export function eloaLogo(kind = 'horizontal', cls = '') {
  return `<span class="eloa-logo ${cls}" role="img" aria-label="ELOA dev team">
    <img class="only-light" src="${ASSETS}logos/eloa-${kind}.png" alt="">
    <img class="only-dark" src="${ASSETS}logos/eloa-${kind}-blanco.png" alt="">
  </span>`;
}
export const eloaIcon = (cls = '') => `<img class="eloa-icon ${cls}" src="${ASSETS}logos/eloa-icono.png" alt="" aria-hidden="true">`;

export function brand() {
  return `<a class="brand" href="#/" aria-label="LERPO, inicio">${eloaIcon()}<span><b>LERPO</b><small>by ELOA dev team</small></span></a>`;
}

// ---------- toasts ----------
export function toast(msg, kind = 'info') {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  host.append(el);
  setTimeout(() => el.classList.add('out'), 3600);
  setTimeout(() => el.remove(), 4000);
}
export const toastError = (e) => toast(e?.message || String(e), 'error');

// ---------- modales ----------
let modalStack = [];
export function openModal(html, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
      <button class="icon-btn modal-x" data-close aria-label="Cerrar">${icon('x')}</button>
      ${html}
    </div>`;
  const close = () => {
    wrap.remove();
    modalStack = modalStack.filter((m) => m !== entry);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && modalStack.at(-1) === entry) close();
  };
  const entry = { wrap, close };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  modalStack.push(entry);
  const first = wrap.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 30);
  return { el: wrap.querySelector('.modal'), close };
}
export const anyModalOpen = () => modalStack.length > 0;
export function closeAllModals() { [...modalStack].forEach((m) => m.close()); }

export function confirmDialog(message, { okText = 'Sí, continuar', danger = true } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal(`
      <h3>¿Segura/o?</h3>
      <p class="muted">${esc(message)}</p>
      <div class="row end gap">
        <button class="btn ghost" data-close>Cancelar</button>
        <button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(okText)}</button>
      </div>`, { onClose: () => { if (!answered) resolve(false); } });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; m.close(); resolve(true); });
  });
}

// ---------- avatares ----------
export function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}
export function avatar(p, size = 'sm') {
  if (!p) return '';
  const label = esc(p.full_name || p.email);
  const color = esc(p.avatar_color || '#6d5bd0');
  if (p.avatar_url && /^https:\/\//i.test(p.avatar_url)) {
    return `<span class="avatar avatar-${size} has-img" style="--c:${color}" title="${label}"><img src="${esc(p.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="avatar avatar-${size}" style="--c:${color}" title="${label}">${esc(initials(p.full_name, p.email))}</span>`;
}

// ---------- fechas ----------
const fmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
export function parseDate(d) {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}
export const shortDate = (d) => (d ? fmt.format(parseDate(d)) : '');
export const longDate = (d) => (d ? fmtLong.format(typeof d === 'string' && d.length === 10 ? parseDate(d) : new Date(d)) : '');
export function relTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'justo ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return longDate(iso);
}
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const ROLE_LABEL = { admin: 'Admin', member: 'Miembro', viewer: 'Solo ver' };
export const STATUS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

export function isSafeUrl(u) {
  try { return ['https:', 'http:'].includes(new URL(u).protocol); } catch { return false; }
}

// ---------- íconos (trazos simples) ----------
const PATHS = {
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z',
  users: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M16 3.1a3.5 3.5 0 010 6.8',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  check: 'M5 12l5 5L20 7',
  checklist: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  cal: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  logout: 'M15 17l5-5-5-5M20 12H9M12 20H5V4h7',
  chat: 'M4 5h16v11H8l-4 4z',
  chevron: 'M6 9l6 6 6-6',
  arrowL: 'M15 18l-6-6 6-6',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1.5 1.5 0 100-.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
};
export function icon(name, size = 18) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
}

// Recorta al centro con la proporción w:h, reduce y comprime (webp, o jpg si no hay webp)
export async function prepareImage(file, w, h) {
  if (!file.type.startsWith('image/')) throw new Error('Elige un archivo de imagen.');
  if (file.size > 20 * 1024 * 1024) throw new Error('La imagen es muy grande (máx 20 MB).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('No se pudo leer esa imagen.'));
      i.src = url;
    });
    const ratio = w / h;
    let sw = img.naturalWidth, sh = img.naturalHeight;
    if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio;
    const scale = Math.min(1, w / sw);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext('2d').drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2,
      sw, sh, 0, 0, canvas.width, canvas.height);
    const toBlob = (type) => new Promise((res) => canvas.toBlob(res, type, 0.86));
    let blob = await toBlob('image/webp');
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

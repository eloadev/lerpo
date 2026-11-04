// Estado global mínimo de la app
export const state = {
  session: null,
  user: null,
  profile: null,
  areas: [],
  areaById: new Map(),
};

const PENDING_KEY = 'eloa_pending_invite';
export function savePendingInvite(token) {
  try { localStorage.setItem(PENDING_KEY, token); } catch {}
}
export function takePendingInvite() {
  try {
    const t = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    return t;
  } catch { return null; }
}
export function peekPendingInvite() {
  try { return localStorage.getItem(PENDING_KEY); } catch { return null; }
}

export function lastSprint(pid, value) {
  const k = 'eloa_sprint_' + pid;
  try {
    if (value === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, value);
  } catch {}
}

// Toda la comunicación con Supabase vive aquí.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const configured =
  !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_KEY.startsWith('TU_');

const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// ---------- errores en español ----------
const MESSAGES = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Primero confirma tu correo (revisa tu bandeja y spam).'],
  [/user already registered/i, 'Ya existe una cuenta con ese correo. Inicia sesión.'],
  [/password should be at least (\d+)/i, (m) => `La contraseña debe tener al menos ${m[1]} caracteres.`],
  [/password.*(weak|pwned|leaked)/i, 'Esa contraseña es muy débil o aparece en filtraciones. Usa otra.'],
  [/rate limit|too many/i, 'Demasiados intentos. Espera un momento y vuelve a intentar.'],
  [/same password|different from the old/i, 'La nueva contraseña debe ser diferente a la anterior.'],
  [/row-level security|permission denied/i, 'No tienes permiso para hacer eso.'],
  [/failed to fetch|network/i, 'Sin conexión con el servidor. Revisa tu internet.'],
  [/jwt expired/i, 'Tu sesión expiró. Vuelve a iniciar sesión.'],
];

function friendly(error) {
  const raw = error?.message || String(error);
  for (const [re, msg] of MESSAGES) {
    const m = raw.match(re);
    if (m) return new Error(typeof msg === 'function' ? msg(m) : msg);
  }
  return new Error(raw);
}

function ok({ data, error }) {
  if (error) throw friendly(error);
  return data;
}

const siteUrl = () => location.origin + location.pathname;

// ---------- auth ----------
export async function getSession() {
  return ok(await sb.auth.getSession()).session;
}
export function onAuthChange(cb) {
  return sb.auth.onAuthStateChange((event, session) => cb(event, session));
}
export async function signIn(email, password) {
  return ok(await sb.auth.signInWithPassword({ email, password }));
}
export async function signUp(email, password, fullName) {
  return ok(await sb.auth.signUp({
    email, password,
    options: { data: { full_name: fullName }, emailRedirectTo: siteUrl() },
  }));
}
export async function signOut() {
  await sb.auth.signOut();
}
export async function sendReset(email) {
  return ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() + '?mode=reset' }));
}
export async function updatePassword(password) {
  return ok(await sb.auth.updateUser({ password }));
}

// ---------- perfil y áreas ----------
export async function getMyProfile(userId) {
  return ok(await sb.from('profiles').select('*').eq('id', userId).single());
}
export async function updateMyProfile(userId, patch) {
  return ok(await sb.from('profiles').update(patch).eq('id', userId).select().single());
}
export async function listAreas() {
  return ok(await sb.from('areas').select('*').order('position'));
}

// ---------- proyectos ----------
export async function dashboard() {
  return ok(await sb.rpc('dashboard_projects'));
}
export async function listMyProjects() {
  return ok(await sb.from('projects').select('id, name, status').order('name'));
}
export async function getProject(id) {
  return ok(await sb.from('projects').select('*').eq('id', id).maybeSingle());
}
export async function createProject(p, userId) {
  return ok(await sb.from('projects').insert({ ...p, created_by: userId }).select().single());
}
export async function updateProject(id, patch) {
  return ok(await sb.from('projects').update(patch).eq('id', id).select().single());
}
export async function deleteProject(id) {
  return ok(await sb.from('projects').delete().eq('id', id));
}

// ---------- miembros e invitaciones ----------
export async function listMembers(pid) {
  return ok(await sb.from('project_members')
    .select('user_id, role, joined_at, profiles(id, full_name, email, avatar_color)')
    .eq('project_id', pid).order('joined_at'));
}
export async function setMemberRole(pid, userId, role) {
  return ok(await sb.from('project_members').update({ role }).eq('project_id', pid).eq('user_id', userId));
}
export async function removeMember(pid, userId) {
  return ok(await sb.from('project_members').delete().eq('project_id', pid).eq('user_id', userId));
}
export async function createInvite(pid, role, days, maxUses, note) {
  return ok(await sb.rpc('create_invite', {
    p_project: pid, p_role: role, p_days: days, p_max_uses: maxUses || null, p_note: note || '',
  }));
}
export async function listInvites(pid) {
  return ok(await sb.from('invitations')
    .select('id, role, note, created_at, expires_at, max_uses, uses, revoked')
    .eq('project_id', pid).order('created_at', { ascending: false }));
}
export async function revokeInvite(id) {
  return ok(await sb.from('invitations').update({ revoked: true }).eq('id', id));
}
export async function invitePreview(token) {
  const rows = ok(await sb.rpc('invite_preview', { p_token: token }));
  return rows?.[0] || null;
}
export async function acceptInvite(token) {
  return ok(await sb.rpc('accept_invite', { p_token: token }));
}

// ---------- sprints ----------
export async function listSprints(pid) {
  return ok(await sb.from('sprints').select('*').eq('project_id', pid)
    .order('start_date', { ascending: true, nullsFirst: false }).order('created_at'));
}
export async function createSprint(s) {
  return ok(await sb.from('sprints').insert(s).select().single());
}
export async function updateSprint(id, patch) {
  return ok(await sb.from('sprints').update(patch).eq('id', id).select().single());
}
export async function deleteSprint(id) {
  return ok(await sb.from('sprints').delete().eq('id', id));
}

// ---------- tareas ----------
export async function listTasks(pid, sprintId) {
  let q = sb.from('tasks')
    .select('*, task_assignees(user_id), checklist_items(id, done)')
    .eq('project_id', pid);
  q = sprintId === 'backlog' ? q.is('sprint_id', null) : q.eq('sprint_id', sprintId);
  return ok(await q.order('position').order('created_at'));
}
export async function getTask(id) {
  const t = ok(await sb.from('tasks')
    .select('*, task_assignees(user_id), checklist_items(*), comments(*, profiles(full_name, avatar_color, email))')
    .eq('id', id).maybeSingle());
  if (t) {
    t.checklist_items.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    t.comments.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return t;
}
export async function createTask(t) {
  return ok(await sb.from('tasks').insert(t).select('*, task_assignees(user_id), checklist_items(id, done)').single());
}
export async function updateTask(id, patch) {
  return ok(await sb.from('tasks').update(patch).eq('id', id).select().single());
}
export async function deleteTask(id) {
  return ok(await sb.from('tasks').delete().eq('id', id));
}
export async function reorderTasks(status, ids) {
  return ok(await sb.rpc('reorder_tasks', { p_status: status, p_ids: ids }));
}
export async function setAssignees(taskId, userIds, previous) {
  const add = userIds.filter((u) => !previous.includes(u));
  const remove = previous.filter((u) => !userIds.includes(u));
  if (remove.length) ok(await sb.from('task_assignees').delete().eq('task_id', taskId).in('user_id', remove));
  if (add.length) ok(await sb.from('task_assignees').insert(add.map((user_id) => ({ task_id: taskId, user_id }))));
}
export async function addChecklistItem(taskId, text, position) {
  return ok(await sb.from('checklist_items').insert({ task_id: taskId, text, position }).select().single());
}
export async function updateChecklistItem(id, patch) {
  return ok(await sb.from('checklist_items').update(patch).eq('id', id));
}
export async function deleteChecklistItem(id) {
  return ok(await sb.from('checklist_items').delete().eq('id', id));
}
export async function addComment(taskId, body) {
  return ok(await sb.from('comments').insert({ task_id: taskId, body })
    .select('*, profiles(full_name, avatar_color, email)').single());
}
export async function deleteComment(id) {
  return ok(await sb.from('comments').delete().eq('id', id));
}

// ---------- tiempo real ----------
export function subscribeProject(pid, cb) {
  const ch = sb.channel('project-' + pid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${pid}` }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sprints', filter: `project_id=eq.${pid}` }, cb)
    .subscribe();
  return () => sb.removeChannel(ch);
}

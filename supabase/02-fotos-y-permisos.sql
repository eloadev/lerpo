-- =====================================================================
--  ELOA Board · actualización 02: fotos de perfil + permisos de admin
--  Pega TODO este archivo en Supabase → SQL Editor → Run (una sola vez).
--  (Si vas a instalar desde cero, schema.sql ya trae esto incluido.)
-- =====================================================================

-- ---------- 1) Foto de perfil -------------------------------------------

alter table public.profiles
  add column if not exists avatar_url text
  check (avatar_url is null or avatar_url ~* '^https://');

grant update (full_name, avatar_color, avatar_url) on public.profiles to authenticated;

-- Carpeta pública "avatars" (máx 2 MB, solo imágenes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada quien solo puede tocar su propia carpeta: avatars/<su-id>/...
drop policy if exists "avatars: ver mi carpeta" on storage.objects;
drop policy if exists "avatars: subir mi foto" on storage.objects;
drop policy if exists "avatars: cambiar mi foto" on storage.objects;
drop policy if exists "avatars: borrar mi foto" on storage.objects;

create policy "avatars: ver mi carpeta" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: subir mi foto" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: cambiar mi foto" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: borrar mi foto" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 2) Solo admins: sprints, crear/borrar tareas, asignar --------
-- Miembros: pueden mover tarjetas entre columnas y editar título,
-- descripción, checklist y entregable. Lo demás es del admin.

drop policy if exists "crear sprints"  on public.sprints;
drop policy if exists "editar sprints" on public.sprints;
drop policy if exists "borrar sprints" on public.sprints;
create policy "crear sprints" on public.sprints for insert to authenticated
  with check (public.can_manage(project_id));
create policy "editar sprints" on public.sprints for update to authenticated
  using (public.can_manage(project_id)) with check (public.can_manage(project_id));
create policy "borrar sprints" on public.sprints for delete to authenticated
  using (public.can_manage(project_id));

drop policy if exists "crear tareas"  on public.tasks;
drop policy if exists "borrar tareas" on public.tasks;
create policy "crear tareas" on public.tasks for insert to authenticated
  with check (public.can_manage(project_id));
create policy "borrar tareas" on public.tasks for delete to authenticated
  using (public.can_manage(project_id));

drop policy if exists "asignar"    on public.task_assignees;
drop policy if exists "desasignar" on public.task_assignees;
create policy "asignar" on public.task_assignees for insert to authenticated
  with check (public.can_manage(public.task_project(task_id))
              and public.user_in_project(public.task_project(task_id), user_id));
create policy "desasignar" on public.task_assignees for delete to authenticated
  using (public.can_manage(public.task_project(task_id)));

-- Los campos del panel lateral (área, sprint, fecha límite) solo los cambia un admin
create or replace function public.guard_task_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and not public.can_manage(old.project_id)
     and (new.project_id is distinct from old.project_id
          or new.sprint_id is distinct from old.sprint_id
          or new.area_id   is distinct from old.area_id
          or new.due_date  is distinct from old.due_date) then
    raise exception 'Solo un admin del proyecto puede cambiar área, sprint o fecha límite'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tasks_guard_fields on public.tasks;
create trigger tasks_guard_fields before update on public.tasks
  for each row execute function public.guard_task_fields();

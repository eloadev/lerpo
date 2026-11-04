-- =====================================================================
--  ELOA Board · actualización 03
--   • El dashboard muestra TODOS los proyectos a cualquiera con cuenta
--     (entrar al board sigue necesitando invitación).
--   • Portada y banner del proyecto se SUBEN como archivo.
--  Pega TODO este archivo en Supabase → SQL Editor → Run (una sola vez).
-- =====================================================================

-- ---------- 1) Dashboard para todas las cuentas -------------------------
-- Solo expone: nombre, descripción, portada, áreas y % de avance.
-- Las tareas, sprints y miembros siguen protegidos.
create or replace function public.dashboard_projects()
returns table (
  id uuid, name text, description text, image_url text, area_ids smallint[],
  status text, total_tasks int, done_tasks int, progress int,
  member_count int, is_member boolean, my_role text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.description, p.image_url, p.area_ids, p.status,
         coalesce(t.total, 0)::int,
         coalesce(t.done, 0)::int,
         case when coalesce(t.total, 0) = 0 then 0
              else round(100.0 * t.done / t.total)::int end,
         (select count(*) from public.project_members m where m.project_id = p.id)::int,
         public.is_member(p.id),
         coalesce(public.project_role(p.id), case when public.is_admin() then 'admin' end),
         p.created_at
  from public.projects p
  left join lateral (
    select count(*) as total, count(*) filter (where x.status = 'done') as done
    from public.tasks x where x.project_id = p.id
  ) t on true
  where auth.uid() is not null
  order by p.created_at desc;
$$;

-- ---------- 2) Banner del proyecto --------------------------------------
alter table public.projects
  add column if not exists banner_url text
  check (banner_url is null or banner_url ~* '^https://');

-- ---------- 3) Carpeta "project-images" (máx 5 MB, solo imágenes) -------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ruta: project-images/<id-del-proyecto>/...  → solo los admins de ESE proyecto
create or replace function public.can_manage_folder(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id::text = (storage.foldername(object_name))[1]
      and public.can_manage(p.id)
  );
$$;
revoke execute on function public.can_manage_folder(text) from public, anon;
grant execute on function public.can_manage_folder(text) to authenticated;

drop policy if exists "proyectos: ver archivos"   on storage.objects;
drop policy if exists "proyectos: subir imagen"   on storage.objects;
drop policy if exists "proyectos: cambiar imagen" on storage.objects;
drop policy if exists "proyectos: borrar imagen"  on storage.objects;

create policy "proyectos: ver archivos" on storage.objects for select to authenticated
  using (bucket_id = 'project-images' and public.can_manage_folder(name));
create policy "proyectos: subir imagen" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-images' and public.can_manage_folder(name));
create policy "proyectos: cambiar imagen" on storage.objects for update to authenticated
  using (bucket_id = 'project-images' and public.can_manage_folder(name))
  with check (bucket_id = 'project-images' and public.can_manage_folder(name));
create policy "proyectos: borrar imagen" on storage.objects for delete to authenticated
  using (bucket_id = 'project-images' and public.can_manage_folder(name));

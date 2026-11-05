-- =====================================================================
--  LERPO · actualización 04: datos para "Mis boards"
--  El dashboard ahora sabe si de verdad estás dentro de cada board
--  (joined) y si tú lo creaste (created_by_me).
--  Pega TODO este archivo en Supabase → SQL Editor → Run (una sola vez).
-- =====================================================================

drop function if exists public.dashboard_projects();

create function public.dashboard_projects()
returns table (
  id uuid, name text, description text, image_url text, area_ids smallint[],
  status text, total_tasks int, done_tasks int, progress int,
  member_count int, is_member boolean, my_role text,
  joined boolean, created_by_me boolean, created_at timestamptz
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
         public.user_in_project(p.id, auth.uid()),
         p.created_by = auth.uid(),
         p.created_at
  from public.projects p
  left join lateral (
    select count(*) as total, count(*) filter (where x.status = 'done') as done
    from public.tasks x where x.project_id = p.id
  ) t on true
  where auth.uid() is not null
  order by p.created_at desc;
$$;

revoke execute on function public.dashboard_projects() from public, anon;
grant execute on function public.dashboard_projects() to authenticated;

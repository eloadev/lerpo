-- =====================================================================
--  LERPO · actualización 05: áreas reales de ELOA
--    azul     → Web
--    verde    → Game Dev
--    amarillo → Visuals
--    morado   → Narrative
--  Las tareas y proyectos que ya tenían un área la conservan
--  (solo cambia el nombre). Pega en Supabase → SQL Editor → Run.
-- =====================================================================

update public.areas set name = 'Web',       color = '#3b82f6' where position = 1;
update public.areas set name = 'Game Dev',  color = '#22a06b' where position = 2;
update public.areas set name = 'Visuals',   color = '#e2b203' where position = 3;
update public.areas set name = 'Narrative', color = '#8e5cd9' where position = 4;

select id, name, color, position from public.areas order by position;

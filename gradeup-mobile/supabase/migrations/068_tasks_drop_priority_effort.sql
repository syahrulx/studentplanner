-- Remove priority and estimated effort from planner tasks (UI and product no longer use them).
--
-- Deploy order: ship the mobile update that omits `priority` / `effort_hours` in upserts first,
-- then apply this migration (or old clients would error on insert/update).

alter table public.tasks
  drop column if exists priority;

alter table public.tasks
  drop column if exists effort_hours;

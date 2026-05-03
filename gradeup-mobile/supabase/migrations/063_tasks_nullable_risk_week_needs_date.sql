-- Calendar import: allow NULL deadline_risk / suggested_week; ensure needs_date exists for taskDb.
--
-- Existing defaults ('Medium', 1) remain for INSERTs that omit these columns.
-- Google Classroom, manual tasks, and SOW flows still send explicit values from the app;
-- only device-calendar import omits them (stored as NULL). Sync recomputes Classroom fields each time.

alter table public.tasks alter column deadline_risk drop not null;
alter table public.tasks alter column suggested_week drop not null;

alter table public.tasks
  add column if not exists needs_date boolean not null default false;

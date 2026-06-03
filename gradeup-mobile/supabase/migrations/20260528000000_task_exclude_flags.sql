alter table public.tasks
  add column if not exists hide_from_focus boolean not null default false,
  add column if not exists hide_from_pulse boolean not null default false;

comment on column public.tasks.hide_from_focus is 'If true, do not show in Today''s focus section on dashboard.';
comment on column public.tasks.hide_from_pulse is 'If true, exclude from Semester Pulse charts and workload counts.';

-- Class attendance events (per timetable occurrence)
-- Records student responses to the 5-min-before-class notification.

create extension if not exists pgcrypto;

create table if not exists public.class_attendance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  timetable_entry_id text not null,
  scheduled_start_at timestamptz not null,
  status text not null check (status in ('present','absent','cancelled')),
  recorded_at timestamptz not null default now(),
  source text not null default 'notification',
  subject_code text not null default '',
  subject_name text not null default ''
);

-- De-dupe retries / allow updates to the same occurrence.
create unique index if not exists class_attendance_events_unique_occurrence
  on public.class_attendance_events (user_id, timetable_entry_id, scheduled_start_at);

create index if not exists class_attendance_events_user_time
  on public.class_attendance_events (user_id, scheduled_start_at desc);

create index if not exists class_attendance_events_time
  on public.class_attendance_events (scheduled_start_at desc);

alter table public.class_attendance_events enable row level security;

-- Students: manage their own events
drop policy if exists class_attendance_events_own_select on public.class_attendance_events;
create policy class_attendance_events_own_select
on public.class_attendance_events for select
to authenticated
using (user_id = auth.uid());

drop policy if exists class_attendance_events_own_insert on public.class_attendance_events;
create policy class_attendance_events_own_insert
on public.class_attendance_events for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists class_attendance_events_own_update on public.class_attendance_events;
create policy class_attendance_events_own_update
on public.class_attendance_events for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Admins: read all events (for admin-web analytics)
drop policy if exists class_attendance_events_admin_select on public.class_attendance_events;
create policy class_attendance_events_admin_select
on public.class_attendance_events for select
to authenticated
using (public.is_admin());


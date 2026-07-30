-- UiTM community calendar submissions are deliberately separate from
-- university_calendar_offers. They never update a student's personal calendar
-- automatically and must be approved before other UiTM students can view them.

create table if not exists public.uitm_calendar_contributions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  group_code text not null check (group_code in ('A', 'B')),
  calendar_variant text not null default 'standard' check (calendar_variant in ('standard', 'kkt')),
  term_code text,
  semester_label text not null,
  start_date date not null,
  end_date date not null,
  total_weeks smallint not null default 14 check (total_weeks > 0 and total_weeks <= 52),
  break_start_date date,
  break_end_date date,
  periods_json jsonb,
  source_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uitm_calendar_contributions_dates check (start_date <= end_date)
);

create index if not exists uitm_calendar_contributions_status_created_idx
  on public.uitm_calendar_contributions (status, created_at desc);
create index if not exists uitm_calendar_contributions_approved_group_dates_idx
  on public.uitm_calendar_contributions (group_code, calendar_variant, start_date)
  where status = 'approved';
create index if not exists uitm_calendar_contributions_creator_idx
  on public.uitm_calendar_contributions (created_by, created_at desc);

alter table public.uitm_calendar_contributions enable row level security;

create policy uitm_calendar_contributions_read_own_or_approved
  on public.uitm_calendar_contributions
  for select to authenticated
  using (created_by = auth.uid() or status = 'approved');

create policy uitm_calendar_contributions_insert_own_pending
  on public.uitm_calendar_contributions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

create policy uitm_calendar_contributions_admin_all
  on public.uitm_calendar_contributions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.uitm_calendar_contributions is
  'UiTM-only community calendar submissions. Admin approval is required and approved records remain opt-in for each student.';

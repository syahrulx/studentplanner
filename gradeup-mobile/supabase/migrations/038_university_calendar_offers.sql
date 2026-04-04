-- Admin-published academic calendar proposals per university (excludes UiTM).
-- Users at that university see the latest offer until they accept or dismiss; accept applies to academic_calendars.

create table if not exists public.university_calendar_offers (
  id uuid primary key default gen_random_uuid(),
  university_id text not null references public.universities (id) on delete cascade,
  semester_label text not null,
  start_date date not null,
  end_date date not null,
  total_weeks smallint not null default 14,
  break_start_date date,
  break_end_date date,
  periods_json jsonb,
  official_url text,
  reference_pdf_url text,
  admin_note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint university_calendar_offers_not_uitm check (university_id <> 'uitm'),
  constraint university_calendar_offers_weeks_range check (total_weeks > 0 and total_weeks <= 52)
);

create index if not exists university_calendar_offers_university_created_idx
  on public.university_calendar_offers (university_id, created_at desc);

comment on table public.university_calendar_offers is
  'Admin-published semester calendar for a university; users confirm before academic_calendars is updated. UiTM uses existing portal flow.';

alter table public.university_calendar_offers enable row level security;

create policy university_calendar_offers_admin_all
  on public.university_calendar_offers
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy university_calendar_offers_read_own_university
  on public.university_calendar_offers
  for select
  to authenticated
  using (
    university_id <> 'uitm'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.university_id is not null
        and p.university_id = university_calendar_offers.university_id
    )
  );

create table if not exists public.user_calendar_offer_responses (
  offer_id uuid not null references public.university_calendar_offers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('accepted', 'dismissed')),
  responded_at timestamptz not null default now(),
  primary key (offer_id, user_id)
);

create index if not exists user_calendar_offer_responses_user_idx
  on public.user_calendar_offer_responses (user_id);

comment on table public.user_calendar_offer_responses is
  'Per-user decision on a calendar offer; absence of a row means the user has not responded yet.';

alter table public.user_calendar_offer_responses enable row level security;

create policy user_calendar_offer_responses_own_all
  on public.user_calendar_offer_responses
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Public read bucket for reference PDFs.
insert into storage.buckets (id, name, public)
values ('academic-calendar-refs', 'academic-calendar-refs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists academic_calendar_refs_select_public on storage.objects;
create policy academic_calendar_refs_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'academic-calendar-refs');

drop policy if exists academic_calendar_refs_insert_admin on storage.objects;
create policy academic_calendar_refs_insert_admin
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'academic-calendar-refs'
    and public.is_admin()
  );

drop policy if exists academic_calendar_refs_update_admin on storage.objects;
create policy academic_calendar_refs_update_admin
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'academic-calendar-refs'
    and public.is_admin()
  )
  with check (
    bucket_id = 'academic-calendar-refs'
    and public.is_admin()
  );

drop policy if exists academic_calendar_refs_delete_admin on storage.objects;
create policy academic_calendar_refs_delete_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'academic-calendar-refs'
    and public.is_admin()
  );

-- MANUAL MIGRATION — DO NOT AUTO-RUN.
--
-- Purpose:
--   • persist custom per-subject grade tables;
--   • remember explicit calendar choices so background imports cannot win;
--   • add UTS/Sibu and UKM Kuala Lumpur only when equivalent rows do not exist;
--   • reject future university, campus and calendar duplicates without deleting history;
--   • make campus-calendar matching case/spacing tolerant;
--   • add focused support-report categories.
--
-- This migration never deletes or merges a university, campus, calendar,
-- profile, or user-owned academic calendar row. Existing duplicate records
-- remain visible for an administrator to review individually.

begin;

-- 1. Durable grading and explicit calendar source priority.
alter table public.subject_grade_configs
  add column if not exists custom_grade_rows jsonb not null default '[]'::jsonb,
  add column if not exists client_updated_at timestamptz;

alter table public.academic_calendars
  add column if not exists selection_source text not null default 'automatic',
  add column if not exists selected_at timestamptz;

alter table public.academic_calendars
  drop constraint if exists academic_calendars_selection_source_check,
  add constraint academic_calendars_selection_source_check
    check (selection_source in ('automatic', 'user', 'manual'));

-- Recognise previously saved manual calendars without touching their dates or
-- any other user's row. A matching crowdsourced offer created by that same
-- owner provides the user-safe identity link.
update public.academic_calendars a
set selection_source = 'manual',
    selected_at = coalesce(a.created_at, now())
where exists (
  select 1
  from public.university_calendar_offers o
  where o.created_by = a.user_id
    and o.source = 'crowdsourced'
    and lower(regexp_replace(trim(o.semester_label), '\s+', ' ', 'g')) =
        lower(regexp_replace(trim(a.semester_label), '\s+', ' ', 'g'))
    and o.start_date = a.start_date
    and o.end_date = a.end_date
);

-- 2. Additive institution/campus seeds. Existing equivalent records win.
insert into public.universities (
  id, name, country, api_endpoint, login_method, request_method, required_params
)
select
  'uts', 'University of Technology Sarawak', 'MY', null, 'manual', 'GET', '[]'::jsonb
where not exists (
  select 1 from public.universities u
  where lower(u.id) in ('uts', 'ucts')
     or lower(regexp_replace(trim(u.name), '\s+', ' ', 'g')) in (
       'university of technology sarawak',
       'universiti teknologi sarawak',
       'university college of technology sarawak',
       'university college of technology sarawak (ucts)'
     )
)
on conflict (id) do nothing;

insert into public.campuses (university_id, name)
select u.id, 'Universiti Kebangsaan Malaysia – Kuala Lumpur Campus'
from public.universities u
where (
    lower(u.id) = 'ukm'
    or lower(regexp_replace(trim(u.name), '\s+', ' ', 'g')) =
       'universiti kebangsaan malaysia'
  )
  and not exists (
    select 1 from public.campuses c
    where c.university_id = u.id
      and lower(regexp_replace(trim(c.name), '\s+', ' ', 'g')) in (
        'kuala lumpur',
        'kuala lumpur campus',
        'ukm kuala lumpur',
        'universiti kebangsaan malaysia – kuala lumpur campus',
        'universiti kebangsaan malaysia - kuala lumpur campus'
      )
  )
order by case when lower(u.id) = 'ukm' then 0 else 1 end
limit 1;

insert into public.campuses (university_id, name)
select u.id, 'Sibu Campus'
from public.universities u
where (
    lower(u.id) in ('uts', 'ucts')
    or lower(regexp_replace(trim(u.name), '\s+', ' ', 'g')) in (
      'university of technology sarawak',
      'universiti teknologi sarawak',
      'university college of technology sarawak',
      'university college of technology sarawak (ucts)'
    )
  )
  and not exists (
    select 1 from public.campuses c
    where c.university_id = u.id
      and lower(regexp_replace(trim(c.name), '\s+', ' ', 'g')) in (
        'sibu', 'sibu campus', 'uts sibu', 'university of technology sarawak, sibu'
      )
  )
order by case when lower(u.id) = 'uts' then 0 else 1 end
limit 1;

-- 3. Prevent future duplicates. These guards do not touch historical rows.
-- The older index treated the label alone as identity, which incorrectly blocks
-- a new academic year that reuses a label such as "Semester 1". The guarded
-- identity below includes the actual term dates.
drop index if exists public.university_calendar_offers_unique_sem;

create or replace function public.reject_redundant_university()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    upper(coalesce(new.country, 'MY')) || '|' ||
    lower(regexp_replace(trim(new.name), '\s+', ' ', 'g')),
    0
  ));
  if exists (
    select 1 from public.universities u
    where u.id <> new.id
      and upper(coalesce(u.country, 'MY')) = upper(coalesce(new.country, 'MY'))
      and lower(regexp_replace(trim(u.name), '\s+', ' ', 'g')) =
          lower(regexp_replace(trim(new.name), '\s+', ' ', 'g'))
  ) then
    raise exception 'An equivalent university already exists.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists universities_redundancy_guard on public.universities;
create trigger universities_redundancy_guard
before insert or update of name, country on public.universities
for each row execute function public.reject_redundant_university();

create or replace function public.reject_redundant_campus()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(new.university_id, '') || '|' ||
    lower(regexp_replace(trim(new.name), '\s+', ' ', 'g')),
    0
  ));
  if exists (
    select 1 from public.campuses c
    where c.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and c.university_id = new.university_id
      and lower(regexp_replace(trim(c.name), '\s+', ' ', 'g')) =
          lower(regexp_replace(trim(new.name), '\s+', ' ', 'g'))
  ) then
    raise exception 'An equivalent campus already exists for this university.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists campuses_redundancy_guard on public.campuses;
create trigger campuses_redundancy_guard
before insert or update of university_id, name on public.campuses
for each row execute function public.reject_redundant_campus();

create or replace function public.reject_redundant_calendar_offer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(new.university_id, '') || '|' ||
    coalesce(new.campus_id::text, '') || '|' ||
    lower(regexp_replace(trim(new.semester_label), '\s+', ' ', 'g')) || '|' ||
    coalesce(new.start_date::text, '') || '|' || coalesce(new.end_date::text, ''),
    0
  ));
  if exists (
    select 1 from public.university_calendar_offers o
    where o.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and o.university_id = new.university_id
      and o.campus_id is not distinct from new.campus_id
      and lower(regexp_replace(trim(o.semester_label), '\s+', ' ', 'g')) =
          lower(regexp_replace(trim(new.semester_label), '\s+', ' ', 'g'))
      and o.start_date = new.start_date
      and o.end_date = new.end_date
  ) then
    raise exception 'This academic calendar already exists.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_offers_redundancy_guard on public.university_calendar_offers;
create trigger calendar_offers_redundancy_guard
before insert or update of university_id, campus_id, semester_label, start_date, end_date
on public.university_calendar_offers
for each row execute function public.reject_redundant_calendar_offer();

-- 4. Campus-specific calendar reads tolerate harmless casing/spacing differences.
drop policy if exists university_calendar_offers_read_own_university
  on public.university_calendar_offers;

create policy university_calendar_offers_read_own_university
  on public.university_calendar_offers
  for select
  to authenticated
  using (
    university_id <> 'uitm'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.university_id = university_calendar_offers.university_id
        and (
          university_calendar_offers.campus_id is null
          or exists (
            select 1 from public.campuses c
            where c.id = university_calendar_offers.campus_id
              and c.university_id = p.university_id
              and lower(regexp_replace(trim(c.name), '\s+', ' ', 'g')) =
                  lower(regexp_replace(trim(coalesce(p.campus, '')), '\s+', ' ', 'g'))
          )
        )
    )
  );

drop policy if exists university_calendar_offers_insert_own
  on public.university_calendar_offers;

create policy university_calendar_offers_insert_own
  on public.university_calendar_offers
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and source = 'crowdsourced'
    and university_id is distinct from 'uitm'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.university_id = university_calendar_offers.university_id
        and (
          (
            university_calendar_offers.campus_id is not null
            and exists (
              select 1
              from public.campuses c
              where c.id = university_calendar_offers.campus_id
                and c.university_id = p.university_id
                and lower(regexp_replace(trim(c.name), '\s+', ' ', 'g')) =
                    lower(regexp_replace(trim(coalesce(p.campus, '')), '\s+', ' ', 'g'))
            )
          )
          or (
            university_calendar_offers.campus_id is null
            and (
              nullif(trim(coalesce(p.campus, '')), '') is null
              or trim(coalesce(p.campus, '')) = '-'
              or not exists (
                select 1 from public.campuses c
                where c.university_id = p.university_id
              )
            )
          )
        )
    )
  );

-- 5. Focused support-report routing.
alter table public.support_reports
  drop constraint if exists support_reports_kind_check;
alter table public.support_reports
  add constraint support_reports_kind_check check (kind in (
    'bug', 'issue', 'faq', 'app_complaint', 'user_complaint',
    'semester_calendar', 'campus_request', 'grading', 'widget', 'other'
  ));

create or replace function public.submit_my_support_report(
  p_kind text,
  p_subject text,
  p_message text,
  p_target_user_handle text default null,
  p_contact_info text default null,
  p_screenshot_url text default null,
  p_app_version text default null,
  p_platform text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_name text;
  v_email text;
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_subject text := left(trim(coalesce(p_subject, '')), 200);
  v_message text := left(trim(coalesce(p_message, '')), 4000);
  v_target text := nullif(left(trim(coalesce(p_target_user_handle, '')), 200), '');
  v_contact text := nullif(left(trim(coalesce(p_contact_info, '')), 200), '');
  v_screenshot text := nullif(left(trim(coalesce(p_screenshot_url, '')), 2000), '');
  v_version text := nullif(left(trim(coalesce(p_app_version, '')), 80), '');
  v_platform text := lower(trim(coalesce(p_platform, '')));
begin
  if v_user_id is null then
    raise exception 'Please sign in again before sending a report.' using errcode = '28000';
  end if;
  if v_kind not in (
    'bug', 'issue', 'faq', 'app_complaint', 'user_complaint',
    'semester_calendar', 'campus_request', 'grading', 'widget', 'other'
  ) then
    raise exception 'Choose a valid report type.' using errcode = '22023';
  end if;
  if char_length(v_subject) = 0 then
    raise exception 'Subject is required.' using errcode = '22023';
  end if;
  if char_length(v_message) = 0 then
    raise exception 'Details are required.' using errcode = '22023';
  end if;
  if v_platform <> '' and v_platform not in ('ios', 'android', 'web', 'other') then
    raise exception 'Invalid app platform.' using errcode = '22023';
  end if;

  select nullif(trim(p.name), '') into v_name
  from public.profiles p where p.id = v_user_id;
  select u.email into v_email from auth.users u where u.id = v_user_id;

  insert into public.support_reports (
    reporter_id, reporter_name_snapshot, reporter_email_snapshot, kind,
    subject, message, target_user_handle, contact_info, screenshot_url,
    app_version, platform
  ) values (
    v_user_id, v_name, v_email, v_kind, v_subject, v_message, v_target,
    v_contact, v_screenshot, v_version, nullif(v_platform, '')
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_my_support_report(text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_my_support_report(text, text, text, text, text, text, text, text) to authenticated;

commit;

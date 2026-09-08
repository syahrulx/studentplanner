-- Allow calendar contributors whose profile uses a common campus alias.
-- The app still resolves the submitted campus_id from the user's own
-- university, while this function keeps RLS in sync with the client matcher.

create or replace function public.campus_names_match(canonical_name text, profile_name text)
returns boolean
language sql
immutable
strict
set search_path = public
as $$
  with normalized as (
    select
      trim(regexp_replace(regexp_replace(lower(trim(canonical_name)), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')) as canonical,
      trim(regexp_replace(regexp_replace(lower(trim(profile_name)), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')) as profile
  )
  select
    canonical = profile
    or (length(profile) >= 6 and position(profile in canonical) > 0)
    or (length(canonical) >= 6 and position(canonical in profile) > 0)
  from normalized;
$$;

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
              and public.campus_names_match(c.name, p.campus)
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
                and public.campus_names_match(c.name, p.campus)
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

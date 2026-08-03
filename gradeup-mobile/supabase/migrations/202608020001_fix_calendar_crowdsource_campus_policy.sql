-- Safely allow non-UiTM users without a usable campus mapping to contribute a
-- university-wide academic calendar. Existing records are not modified.
-- UiTM remains isolated in its separately reviewed contribution workflow.

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
          -- When a campus is supplied, it must belong to the same university
          -- and match the authenticated user's legacy profile campus name.
          (
            university_calendar_offers.campus_id is not null
            and exists (
              select 1
              from public.campuses c
              where c.id = university_calendar_offers.campus_id
                and c.university_id = p.university_id
                and lower(trim(c.name)) = lower(trim(coalesce(p.campus, '')))
            )
          )
          or
          -- University-wide is allowed only when the profile has no campus,
          -- or this university has no canonical campus records to target.
          (
            university_calendar_offers.campus_id is null
            and (
              nullif(trim(coalesce(p.campus, '')), '') is null
              or trim(coalesce(p.campus, '')) = '-'
              or not exists (
                select 1
                from public.campuses c
                where c.university_id = p.university_id
              )
            )
          )
        )
    )
  );

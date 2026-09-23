-- Profiles: store the canonical campus name at the source.
--
-- The Profile screen already offers a campus picker, but profiles.campus is
-- also written by the UiTM timetable/portal sync (fetchUitmTimetablePublic →
-- the portal's "kampus" field, e.g. "UiTM SHAH ALAM", "UITM PUNCAK
-- PERDANA") and by the free-text fallback. Every feature that reads it
-- (confessions, Campus Map, services, events) then had to repair it.
--
-- A BEFORE trigger resolves the value through _resolve_campus_name whenever
-- campus or university changes, whoever writes it. A value that can't be
-- resolved is kept as typed (nothing is thrown away); the app prompts the
-- student to pick from the list instead.
-- Existing rows are rewritten once, only where the resolved name differs.

set lock_timeout = '5s';

create or replace function public.profiles_normalise_campus()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_resolved text;
begin
  if new.campus is null or trim(new.campus) = '' or new.university_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.campus is not distinct from old.campus
     and new.university_id is not distinct from old.university_id then
    return new;
  end if;
  v_resolved := public._resolve_campus_name(new.university_id, new.campus);
  if v_resolved is not null then
    new.campus := v_resolved;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_normalise_campus on public.profiles;
create trigger profiles_normalise_campus
  before insert or update of campus, university_id on public.profiles
  for each row execute function public.profiles_normalise_campus();

-- ─── One-time backfill ────────────────────────────────────────────────────

with fixed as (
  select p.id, public._resolve_campus_name(p.university_id, p.campus) as campus
  from public.profiles p
  where p.campus is not null and trim(p.campus) <> '' and p.university_id is not null
)
update public.profiles p
   set campus = fixed.campus
  from fixed
 where fixed.id = p.id
   and fixed.campus is not null
   and p.campus is distinct from fixed.campus;

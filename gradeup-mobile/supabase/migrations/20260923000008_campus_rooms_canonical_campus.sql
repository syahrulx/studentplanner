-- Campus Map: store canonical campus names on rooms and faculties.
--
-- _campus_room_assert_scope copied profiles.campus verbatim, so rooms were
-- saved under "UITM PUNCAK PERDANA" / "Shah Alam" instead of the campuses.name
-- the Campus Map chips filter by ("Puncak Perdana", "Shah Alam (Main Campus)").
-- 84 Puncak Perdana rooms were invisible under their own campus chip.
--
-- 1. The scope helper resolves the campus through _resolve_campus_name (the
--    normalising version from 20260923000006). At a university with a campus
--    list, an unresolvable profile campus is rejected with the same "update
--    your campus in Profile" message already used for an empty one.
-- 2. Existing campus_rooms / campus_faculties rows are rewritten to the
--    canonical name — skipping any row whose rewrite would collide with an
--    existing row under the unique (university, campus, faculty, code) key,
--    so this can never fail on a duplicate.

set lock_timeout = '5s';

create or replace function public._campus_room_assert_scope(out out_uni text, out out_campus text, out out_faculty text)
returns record
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_status text;
  v_raw    text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.university_id,
         nullif(trim(coalesce(p.campus, '')), ''),
         case when position('@' in coalesce(p.faculty, '')) > 0 then null
              else nullif(trim(coalesce(p.faculty, '')), '') end,
         coalesce(p.status, 'active')
  into out_uni, v_raw, out_faculty, v_status
  from public.profiles p
  where p.id = v_uid;

  if out_uni is null or trim(out_uni) = '' then
    raise exception 'Connect your university in Profile before adding room locations.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.campuses c where c.university_id = out_uni) then
    -- Canonical name only ("UITM PUNCAK PERDANA" → "Puncak Perdana").
    out_campus := public._resolve_campus_name(out_uni, v_raw);
    if out_campus is null then
      raise exception 'Sila kemas kini (update) nama kampus di Profil anda sebelum memuat naik peta.' using errcode = 'P0001';
    end if;
  else
    out_campus := v_raw;
  end if;

  if v_status is distinct from 'active' then
    raise exception 'Your account cannot contribute right now.'
      using errcode = 'P0001';
  end if;
end;
$function$;

-- ─── Rewrite existing rooms ───────────────────────────────────────────────

with fixed as (
  select r.id, public._resolve_campus_name(r.university_id, r.campus) as campus
  from public.campus_rooms r
  where r.campus is not null
)
update public.campus_rooms r
   set campus = fixed.campus
  from fixed
 where fixed.id = r.id
   and fixed.campus is not null
   and r.campus is distinct from fixed.campus
   and not exists (
     select 1 from public.campus_rooms o
     where o.id <> r.id
       and o.status <> 'removed'
       and o.university_id = r.university_id
       and coalesce(o.campus, '') = fixed.campus
       and coalesce(o.faculty, '') = coalesce(r.faculty, '')
       and o.room_code_norm = r.room_code_norm
   );

-- ─── Rewrite existing faculties ───────────────────────────────────────────

with fixed as (
  select f.id, public._resolve_campus_name(f.university_id, f.campus) as campus
  from public.campus_faculties f
  where f.campus is not null
)
update public.campus_faculties f
   set campus = fixed.campus
  from fixed
 where fixed.id = f.id
   and fixed.campus is not null
   and f.campus is distinct from fixed.campus
   and not exists (
     select 1 from public.campus_faculties o
     where o.id <> f.id
       and o.university_id = f.university_id
       and coalesce(o.campus, '') = fixed.campus
       and o.name_norm = f.name_norm
   );

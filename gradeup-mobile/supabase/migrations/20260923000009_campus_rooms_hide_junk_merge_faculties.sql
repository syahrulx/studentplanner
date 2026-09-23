-- Campus Map data cleanup (UiTM).
--
-- 1. Hide two junk rooms: status 'flagged' drops them from get_campus_rooms
--    and match_room but keeps the row for admin review (nothing deleted).
--    • "Bilik BK09" with random-letter fields (label "Aryrsj", building "Rwltza",
--      level "Hzpbxa") — test data.
--    • BL 214 labelled "Online" with building/level "0" — not a place.
-- 2. Merge faculty spellings that name the same faculty onto its code:
--    "BUSINESS AND MANAGEMENT" → FBM, "account" → FPA (Accountancy).
--    Rooms whose merge would collide with an existing FBM/FPA room of the
--    same code are left as they are; duplicate registry names are removed
--    only when the code already exists for that campus.

set lock_timeout = '5s';

-- ─── 1. Hide junk ─────────────────────────────────────────────────────────

update public.campus_rooms
   set status = 'flagged', updated_at = now()
 where university_id = 'uitm'
   and status = 'active'
   and (
     -- code is stored as "Bilik BK09"; the two random-letter fields identify it on their own
     (building = 'Rwltza' and level = 'Hzpbxa')
     or (room_code_norm = public._norm_room('BL 214') and room_label = 'Online'
         and coalesce(building, '0') = '0' and coalesce(level, '0') = '0')
   );

-- ─── 2. Merge faculties ───────────────────────────────────────────────────

with alias(from_name, to_name) as (
  values ('business and management', 'FBM'), ('account', 'FPA')
)
update public.campus_rooms r
   set faculty = a.to_name, updated_at = now()
  from alias a
 where r.university_id = 'uitm'
   and lower(trim(r.faculty)) = a.from_name
   and not exists (
     select 1 from public.campus_rooms o
     where o.id <> r.id
       and o.status <> 'removed'
       and o.university_id = r.university_id
       and coalesce(o.campus, '') = coalesce(r.campus, '')
       and lower(coalesce(o.faculty, '')) = lower(a.to_name)
       and o.room_code_norm = r.room_code_norm
   );

-- Registry: drop the alias where the code is already registered for that
-- campus, otherwise rename it to the code.
with alias(from_name, to_name) as (
  values ('business and management', 'FBM'), ('account', 'FPA')
)
delete from public.campus_faculties f
 using alias a
 where f.university_id = 'uitm'
   and lower(trim(f.name)) = a.from_name
   and exists (
     select 1 from public.campus_faculties o
     where o.university_id = f.university_id
       and coalesce(o.campus, '') = coalesce(f.campus, '')
       and o.name_norm = public._norm_room(a.to_name)  -- the unique key's own column
   );

with alias(from_name, to_name) as (
  values ('business and management', 'FBM'), ('account', 'FPA')
)
update public.campus_faculties f
   set name = a.to_name, name_norm = public._norm_room(a.to_name)  -- same rule add_campus_faculty uses
  from alias a
 where f.university_id = 'uitm'
   and lower(trim(f.name)) = a.from_name;

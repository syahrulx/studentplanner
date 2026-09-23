-- Confessions: store a canonical campus name, never a free-text profile value.
--
-- create_confession copies the poster's campus through _resolve_campus_name,
-- which only matched when one string contained the other. Profile values like
-- "UiTM SHAH ALAM" (vs campuses.name "Shah Alam (Main Campus)") or the bare
-- university name "UNIVERSITI TEKNOLOGI MARA" fell through, and the raw text
-- was saved as-is. Those posts dropped out of campus filters and the map
-- bubbles, and got numbered in their own bogus sequence.
--
-- 1. Resolver also compares normalised forms: leading "UiTM" / "Universiti
--    Teknologi MARA" / "… Kampus|Campus|Cawangan" stripped from the raw value,
--    trailing "(…)" stripped from the campus name.
-- 2. At a university that has a campus list, an unresolvable value is stored
--    as NULL (the post still shows under All Campuses) instead of raw text.
--    Universities with no campus list keep the raw value, as before.
-- 3. Existing rows are rewritten with the same rule, then confession_no is
--    renumbered per campus in posting order (numbers are one day old).

set lock_timeout = '5s';

create or replace function public._resolve_campus_name(p_university_id text, p_raw_campus text)
returns text
language sql
stable security definer
set search_path to 'public'
as $function$
  with raw as (
    select
      lower(trim(p_raw_campus)) as full_raw,
      -- "UiTM Cawangan Perak Kampus Tapah" → "tapah"; "UiTM SHAH ALAM" → "shah alam"
      trim(regexp_replace(
        regexp_replace(lower(trim(p_raw_campus)), '^.*\m(kampus|campus|cawangan)\s+', ''),
        '^(uitm|universiti teknologi mara)\s+', ''
      )) as norm_raw
  )
  select c.name
  from public.campuses c, raw r
  where c.university_id = p_university_id
    and p_raw_campus is not null
    and trim(p_raw_campus) <> ''
    and (
      -- 1. Exact match (case-insensitive)
      r.full_raw = lower(c.name)
      -- 2. Campus name is contained within the raw profile string
      --    e.g. raw="UiTM Kampus Sungai Petani" contains name="Sungai Petani"
      or position(lower(c.name) in r.full_raw) > 0
      -- 3. Raw string is contained within the campus name
      --    e.g. raw="Shah Alam" is inside name="Shah Alam (Main Campus)"
      or position(r.full_raw in lower(c.name)) > 0
      -- 4. Normalised forms match: raw="UiTM SHAH ALAM" vs name="Shah Alam (Main Campus)"
      or (
        r.norm_raw <> ''
        and r.norm_raw = trim(regexp_replace(lower(c.name), '\s*\(.*?\)', '', 'g'))
      )
    )
  order by
    -- Exact match first
    case when r.full_raw = lower(c.name) then 0 else 1 end,
    -- Then prefer smallest edit distance (closest string length)
    abs(length(trim(p_raw_campus)) - length(c.name)) asc
  limit 1;
$function$;

create or replace function public._confession_caller_profile()
returns table(user_id uuid, university_id text, campus text, status text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    p.id,
    p.university_id,
    -- Resolve "UiTM Kampus Sungai Petani" → "Sungai Petani". If the university
    -- has a campus list and nothing matches, NULL rather than the raw string.
    coalesce(
      public._resolve_campus_name(p.university_id, p.campus),
      case
        when exists (select 1 from public.campuses c where c.university_id = p.university_id) then null
        else nullif(trim(coalesce(p.campus, '')), '')
      end
    ),
    coalesce(p.status, 'active')
  from public.profiles p
  where p.id = auth.uid();
$function$;

-- ─── Rewrite existing rows ────────────────────────────────────────────────

with fixed as (
  select c.id,
         coalesce(
           public._resolve_campus_name(c.university_id, c.campus),
           case
             when exists (select 1 from public.campuses k where k.university_id = c.university_id) then null
             else c.campus
           end
         ) as campus
  from public.confessions c
  where c.campus is not null
)
update public.confessions c
   set campus = fixed.campus
  from fixed
 where fixed.id = c.id
   and c.campus is distinct from fixed.campus;

with numbered as (
  select id,
         row_number() over (
           partition by university_id, coalesce(campus, '')
           order by created_at, id
         ) as n
  from public.confessions
)
update public.confessions c
   set confession_no = numbered.n
  from numbered
 where numbered.id = c.id
   and c.confession_no is distinct from numbered.n;

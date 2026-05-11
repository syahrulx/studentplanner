-- =============================================================================
-- One-shot cleanup: merge back-to-back same-subject timetable_entries per user.
--
-- Context:
--   The PDF/picture timetable extractor used to emit one row per portal period
--   row, so a single 2-hour BM lesson became 3 small rows
--     (08:20-09:00, 09:00-09:40, 09:40-10:20).
--   The student-ID flow always returned the merged shape (08:20-10:20).
--   The mobile app now merges client-side on new imports, but existing users
--   still have the split rows in Supabase.  This migration retroactively
--   collapses contiguous (touching) intervals of the same subject so all
--   users' timetables look consistent.
--
-- Strictly safe rules (no break is ever merged across):
--   * Group by user_id, day, subject_code, subject_name, lecturer, location,
--     group_name, semester_label  (case-insensitive, trimmed).
--   * Within a group, slots are merged only when the next slot's start_time
--     is <= the current slot's end_time (touching or overlapping).
--   * Non-contiguous slots (real breaks) stay separate.
--   * Rows with a non HH:MM start/end format are ignored so they aren't
--     altered or deleted.
--
-- The kept row is the one with the earliest start_time; its start/end get
-- widened to the merged interval and display_name/slot_color are coalesced
-- from any row in the group that had them set.  Other rows in the group
-- are then deleted.
-- =============================================================================

set local search_path = public;

-- 1. Compute which rows belong to which merge-group.
create temp table _tt_groups on commit drop as
with valid as (
  select
    t.id,
    t.user_id,
    t.day,
    t.subject_code,
    t.subject_name,
    t.lecturer,
    t.location,
    t.group_name,
    t.semester_label,
    t.display_name,
    t.slot_color,
    t.start_time,
    t.end_time,
    t.start_time::time as start_t,
    t.end_time::time   as end_t
  from public.timetable_entries t
  where t.start_time ~ '^[0-9]{1,2}:[0-9]{2}$'
    and t.end_time   ~ '^[0-9]{1,2}:[0-9]{2}$'
    and t.start_time::time < t.end_time::time
),
flagged as (
  select
    v.*,
    case
      when lag(end_t) over w is null or lag(end_t) over w < start_t
      then 1 else 0
    end as new_group
  from valid v
  window w as (
    partition by
      user_id, day,
      upper(btrim(subject_code)),
      upper(btrim(subject_name)),
      upper(btrim(lecturer)),
      upper(btrim(location)),
      coalesce(upper(btrim(group_name)), ''),
      coalesce(upper(btrim(semester_label)), '')
    order by start_t, end_t, id
  )
)
select
  f.*,
  sum(new_group) over (
    partition by
      user_id, day,
      upper(btrim(subject_code)),
      upper(btrim(subject_name)),
      upper(btrim(lecturer)),
      upper(btrim(location)),
      coalesce(upper(btrim(group_name)), ''),
      coalesce(upper(btrim(semester_label)), '')
    order by start_t, end_t, id
    rows between unbounded preceding and current row
  ) as grp_id
from flagged f;

-- 2. Plan one consolidated row per merge-group, keeping the earliest id.
create temp table _tt_plan on commit drop as
select
  user_id,
  day,
  upper(btrim(subject_code))                              as code_key,
  upper(btrim(subject_name))                              as name_key,
  upper(btrim(lecturer))                                  as lect_key,
  upper(btrim(location))                                  as loc_key,
  coalesce(upper(btrim(group_name)), '')                  as group_key,
  coalesce(upper(btrim(semester_label)), '')              as sem_key,
  grp_id,
  count(*)                                                as cnt,
  min(start_t)                                            as new_start,
  max(end_t)                                              as new_end,
  (array_agg(id order by start_t, end_t, id))[1]          as keep_id,
  array_agg(id order by start_t, end_t, id)               as all_ids,
  (array_remove(array_agg(display_name order by start_t, end_t, id), null))[1] as merged_display,
  (array_remove(array_agg(slot_color   order by start_t, end_t, id), null))[1] as merged_color
from _tt_groups
group by
  user_id, day,
  upper(btrim(subject_code)),
  upper(btrim(subject_name)),
  upper(btrim(lecturer)),
  upper(btrim(location)),
  coalesce(upper(btrim(group_name)), ''),
  coalesce(upper(btrim(semester_label)), ''),
  grp_id;

-- Quick visibility before destructive ops run
do $$
declare
  to_resize bigint;
  to_delete bigint;
begin
  select count(*) into to_resize from _tt_plan where cnt > 1;
  select coalesce(sum(cnt) - count(*), 0) into to_delete from _tt_plan where cnt > 1;
  raise notice 'merge plan: % groups will be merged, % rows will be removed', to_resize, to_delete;
end $$;

-- 3. Delete the redundant rows first (everything in a group except the keep_id).
with del as (
  select t.id, t.user_id
  from public.timetable_entries t
  join _tt_plan p
    on p.user_id = t.user_id
   and t.id = any(p.all_ids)
   and t.id <> p.keep_id
  where p.cnt > 1
)
delete from public.timetable_entries t
using del
where t.id = del.id and t.user_id = del.user_id;

-- 4. Widen the kept row to the merged interval; coalesce display/colour.
update public.timetable_entries t
set
  start_time   = to_char(p.new_start, 'HH24:MI'),
  end_time     = to_char(p.new_end,   'HH24:MI'),
  display_name = coalesce(t.display_name, p.merged_display),
  slot_color   = coalesce(t.slot_color,   p.merged_color)
from _tt_plan p
where p.cnt > 1
  and t.user_id = p.user_id
  and t.id      = p.keep_id;

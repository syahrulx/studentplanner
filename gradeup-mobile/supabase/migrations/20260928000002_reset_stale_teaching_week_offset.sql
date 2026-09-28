-- Clear teaching-week alignments that belong to a semester the student has left.
--
-- A student aligns their teaching week, the app stores the delta in
-- teaching_week_offset, and the automatic calendar providers then refresh that
-- same row for the next semester without naming an offset. Until the fix in
-- academicCalendarDb.ts the save path read `undefined` as "keep the old value",
-- so the new term inherited the previous term's correction.
--
-- It stays invisible for weeks. getAcademicProgressFromCalendar skips the
-- offset while the phase is before_start, and the on-break branch returns
-- before applying it at all, so the whole semester break looks correct. The
-- offset lands in full on the first morning of teaching: a student reported
-- "semester break" one day and "WEEK 10" the next, on day one of a new
-- semester.
--
-- Only alignments made before the current semester started are cleared.
-- selected_at records when the student last chose a week, and it is carried
-- forward untouched by the automatic refreshes, so `selected_at < start_date`
-- means the choice was made for an earlier term. A student who aligned the
-- semester they are actually in keeps their setting.

update public.academic_calendars
set teaching_week_offset = 0
where teaching_week_offset <> 0
  and selected_at is not null
  and start_date is not null
  and selected_at::date < start_date::date;

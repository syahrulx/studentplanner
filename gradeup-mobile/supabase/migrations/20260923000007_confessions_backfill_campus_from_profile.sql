-- Confessions with no campus: try the author's *current* profile campus.
--
-- After 20260923000006, posts whose stored campus couldn't be resolved are
-- NULL — typically the author's profile had no campus, or only the
-- university name, at posting time. Many have set a real campus since.
-- Only a value that resolves to a campuses.name is used (never raw text),
-- and only when the author is still at the same university. Posts that
-- still can't be placed stay NULL and show under All Campuses.
-- confession_no is then renumbered per campus in posting order.

set lock_timeout = '5s';

with fixed as (
  select c.id,
         public._resolve_campus_name(c.university_id, p.campus) as campus
  from public.confessions c
  join public.profiles p on p.id = c.author_id
  where c.campus is null
    and p.university_id = c.university_id
)
update public.confessions c
   set campus = fixed.campus
  from fixed
 where fixed.id = c.id
   and fixed.campus is not null;

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

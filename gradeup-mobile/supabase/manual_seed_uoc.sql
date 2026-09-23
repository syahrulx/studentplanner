-- Run this in the Supabase SQL editor to add University of Cyberjaya (UoC)
-- and its campuses. It is safe to run more than once.
--
-- UoC's branch colleges in Kota Kinabalu and Kuching are recorded as UoC
-- campuses. Cyberjaya College Central sits inside the main Cyberjaya campus,
-- so students there use the main campus entry.

begin;

-- universities has a unique index on lower(id), so a differently-cased row
-- ('UOC', 'UoC') would still collide with 'uoc'.
insert into public.universities (
  id,
  name,
  country,
  login_method,
  request_method,
  required_params
)
select
  'uoc',
  'University of Cyberjaya',
  'MY',
  'manual',
  'GET',
  '[]'::jsonb
where not exists (
  select 1 from public.universities u where lower(u.id) = 'uoc'
)
on conflict (id) do nothing;

insert into public.campuses (university_id, name)
select u.id, data.campus_name
from public.universities u
cross join (values
  ('University of Cyberjaya – Cyber 11, Cyberjaya (Main Campus)'),
  ('University of Cyberjaya – Cyberjaya College Kota Kinabalu'),
  ('University of Cyberjaya – Cyberjaya College Kuching')
) as data(campus_name)
where lower(u.id) = 'uoc'
  and not exists (
    select 1
    from public.campuses c
    where c.university_id = u.id
      and lower(regexp_replace(trim(c.name), '\s+', ' ', 'g')) =
          lower(regexp_replace(trim(data.campus_name), '\s+', ' ', 'g'))
  );

commit;

-- Check the result:
select u.id, u.name, c.name as campus
from public.universities u
left join public.campuses c on c.university_id = u.id
where lower(u.id) = 'uoc'
order by c.name;

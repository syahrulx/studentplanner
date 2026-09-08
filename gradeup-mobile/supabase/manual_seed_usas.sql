-- Run this in the Supabase SQL editor to add Universiti Sultan Azlan Shah
-- and its main campus. It is safe to run more than once.

begin;

insert into public.universities (
  id,
  name,
  country,
  login_method,
  request_method,
  required_params
)
values (
  'usas',
  'Universiti Sultan Azlan Shah',
  'MY',
  'manual',
  'GET',
  '[]'::jsonb
)
on conflict (id) do nothing;

insert into public.campuses (university_id, name)
select
  'usas',
  'Universiti Sultan Azlan Shah – Bukit Chandan, Kuala Kangsar (Main Campus)'
where not exists (
  select 1
  from public.campuses c
  where c.university_id = 'usas'
    and lower(regexp_replace(trim(c.name), '\s+', ' ', 'g')) =
        lower(regexp_replace(
          trim('Universiti Sultan Azlan Shah – Bukit Chandan, Kuala Kangsar (Main Campus)'),
          '\s+', ' ', 'g'
        ))
);

commit;

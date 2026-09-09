-- Run this in the Supabase SQL editor to add the former Penang
-- International Dental College under its current identity. MAHSA University
-- remains a separate university record; this is a separate institution under
-- the same MAHSA group. Safe to run more than once.

begin;

insert into public.universities (
  id,
  name,
  country,
  api_endpoint,
  login_method,
  request_method,
  required_params
)
values (
  'micp',
  'MAHSA International College (Penang)',
  'MY',
  null,
  'manual',
  'GET',
  '[]'::jsonb
)
on conflict (id) do nothing;

insert into public.campuses (university_id, name)
select
  'micp',
  'NB Tower, Jalan Bagan Luar, Butterworth, Penang (Main Campus)'
where not exists (
  select 1
  from public.campuses c
  where c.university_id = 'micp'
    and lower(regexp_replace(trim(c.name), '\s+', ' ', 'g')) =
        lower(regexp_replace(
          trim('NB Tower, Jalan Bagan Luar, Butterworth, Penang (Main Campus)'),
          '\s+', ' ', 'g'
        ))
);

commit;

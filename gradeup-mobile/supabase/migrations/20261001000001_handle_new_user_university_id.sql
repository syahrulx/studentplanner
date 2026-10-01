-- New email sign-ups: set university_id and country when the account is created.
--
-- WHAT WAS WRONG
-- handle_new_user (the trigger on auth.users) only copied name and university
-- (the display name) into profiles. university_id and country came from the
-- client's profiles.upsert in sign-up.tsx, which runs right after
-- auth.signUp(). When email confirmation is on, signUp returns no session, so
-- that upsert goes out as anon. auth.uid() is null, "Users can insert own
-- profile" rejects it, and Postgres logs 42501 "new row violates row-level
-- security policy for table profiles", roughly once per email sign-up. The
-- app ignored the error. The profile still had a university name, so the
-- profile-setup gate (which checks university) never fired, and those users
-- were left with university_id NULL and country at the 'MY' default.
--
-- WHAT THIS DOES
-- * handle_new_user resolves university_id from metadata.university_id. If
--   that is missing or unknown it falls back to the university name, which
--   every app version sends, so older builds are fixed too. Country comes from
--   metadata.country if it is a valid code, otherwise from the university's
--   own country, otherwise 'MY'.
-- * Backfill: profiles with no university_id whose university name exactly
--   matches one row in universities get that id, and that university's
--   country. The sign-up form only lists a country's own universities, so
--   for these rows the university's country is the one the user picked.
--   Names that match nothing are left alone.

set lock_timeout = '5s';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_uni_id text;
  v_uni_country text;
  v_country text := upper(nullif(trim(v_meta->>'country'), ''));
begin
  select u.id, u.country into v_uni_id, v_uni_country
  from public.universities u
  where u.id = nullif(trim(v_meta->>'university_id'), '');

  if v_uni_id is null then
    select u.id, u.country into v_uni_id, v_uni_country
    from public.universities u
    where u.name = nullif(trim(v_meta->>'university'), '');
  end if;

  if v_country is null or v_country !~ '^[A-Z]{2}$' then
    v_country := coalesce(upper(v_uni_country), 'MY');
  end if;

  insert into public.profiles (id, name, university, university_id, country, updated_at)
  values (
    new.id,
    coalesce(v_meta->>'full_name', ''),
    coalesce(v_meta->>'university', null),
    v_uni_id,
    v_country,
    now()
  )
  on conflict (id) do update set
    name = coalesce(excluded.name, profiles.name),
    university = coalesce(excluded.university, profiles.university),
    university_id = coalesce(profiles.university_id, excluded.university_id),
    updated_at = now();
  return new;
end;
$function$;

update public.profiles p
set university_id = u.id,
    country = upper(u.country)
from public.universities u
where p.university_id is null
  and p.university is not null
  and u.name = p.university
  and upper(u.country) ~ '^[A-Z]{2}$';

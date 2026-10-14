-- Profile card: the banner a student picks, and the details they keep private.
--
-- Both columns are additive and nullable, so every existing row keeps working
-- untouched: a null banner means "use the app theme's colour", which is what
-- every profile card draws today, and a null hidden-fields list means "show
-- everything", which is also what it does today. Nobody's card changes until
-- they go and change it.

alter table public.profiles
  add column if not exists profile_banner text,
  add column if not exists profile_hidden_fields text[];

comment on column public.profiles.profile_banner is
  'Chosen profile-card banner id (see src/lib/profileBanners.ts). Null = the app theme colour, the free default.';

comment on column public.profiles.profile_hidden_fields is
  'Detail rows this student does not want on their card: any of university, campus, faculty, course. Null or empty = show all.';

-- Guard against a typo in a client ever writing a row nobody can interpret.
-- Checked as a subset so the order and length do not matter.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'profile_hidden_fields_known'
      and table_name = 'profiles'
  ) then
    alter table public.profiles
      add constraint profile_hidden_fields_known
      check (
        profile_hidden_fields is null
        or profile_hidden_fields <@ array['university','campus','faculty','course']::text[]
      );
  end if;
end $$;

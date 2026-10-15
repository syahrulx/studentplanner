-- Let a student hide their RenTaman avatar on their profile card.
--
-- Same widening as 20261008000004: profile_hidden_fields is pinned to a known
-- list, and the card has gained a row it can hide ('rentaman'). Hiding it only
-- keeps the avatar off what other students see; it still shows on the
-- student's own profile.
--
-- Widening a CHECK cannot fail an existing row: anything that satisfied the
-- old constraint satisfies this one. Changes no data. Safe to run twice.

alter table public.profiles
  drop constraint if exists profile_hidden_fields_known;

alter table public.profiles
  add constraint profile_hidden_fields_known
  check (
    profile_hidden_fields is null
    or profile_hidden_fields <@ array['photo','university','campus','faculty','course','status','song','rentaman']::text[]
  );

comment on column public.profiles.profile_hidden_fields is
  'Rows this student keeps off their card: any of photo, university, campus, faculty, course, status, song, rentaman. Null or empty = show all.';

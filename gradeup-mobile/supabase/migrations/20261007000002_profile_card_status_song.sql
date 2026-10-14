-- Let a student also hide their status and their song on their profile card.
--
-- 20261007000001 pinned profile_hidden_fields to the four academic rows. The
-- card now carries what they are doing and what they are listening to, taken
-- live from the community screen, and those are the two most personal things
-- on it — so they are the two most worth being able to switch off.
--
-- Widening a CHECK is safe for every existing row: anything that satisfied the
-- old constraint satisfies this one, so nothing is revalidated into failure.

alter table public.profiles
  drop constraint if exists profile_hidden_fields_known;

alter table public.profiles
  add constraint profile_hidden_fields_known
  check (
    profile_hidden_fields is null
    or profile_hidden_fields <@ array['university','campus','faculty','course','status','song']::text[]
  );

comment on column public.profiles.profile_hidden_fields is
  'Rows this student keeps off their card: any of university, campus, faculty, course, status, song. Null or empty = show all.';

-- Let a student hide their photograph on their profile card too.
--
-- Same widening as 20261007000002, for the same reason: profile_hidden_fields
-- is pinned to a known list, and the card has gained a row it can hide.
--
-- Hiding the photo does not blank it — the card falls back to initials. The
-- row is listed here only so the choice can be stored.
--
-- Widening a CHECK cannot fail an existing row: anything that satisfied the
-- old constraint satisfies this one.

alter table public.profiles
  drop constraint if exists profile_hidden_fields_known;

alter table public.profiles
  add constraint profile_hidden_fields_known
  check (
    profile_hidden_fields is null
    or profile_hidden_fields <@ array['photo','university','campus','faculty','course','status','song']::text[]
  );

comment on column public.profiles.profile_hidden_fields is
  'Rows this student keeps off their card: any of photo, university, campus, faculty, course, status, song. Null or empty = show all.';

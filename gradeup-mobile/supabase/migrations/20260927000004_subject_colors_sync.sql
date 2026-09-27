-- Sync per-subject colours across devices.
--
-- Colours were kept only in AsyncStorage under 'subjectColors', so each device
-- held its own map and anything it had not seen fell back to the hash-of-id
-- default palette. The same subject therefore showed a different colour on the
-- phone, the iPad and the web app, in both the timetable and the Study section.
--
-- Shape mirrors theme_preferences (migration 069): a nullable jsonb bag on the
-- profile, written whole. NULL means "this user has never set a colour", which
-- is every existing row — adding a nullable column with no default is
-- metadata-only, so nothing is rewritten and no backfill runs.
--
-- Last write wins: the client pushes its entire map on change, so the most
-- recent device to set a colour defines the map for all of them.

alter table public.profiles
  add column if not exists subject_colors jsonb;

comment on column public.profiles.subject_colors is
  'Per-subject colour map synced across devices: { "<courseId>": "#RRGGBB" }. NULL = never set.';

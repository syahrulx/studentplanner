-- Foundation for international expansion: add a `country` field to profiles
-- and universities. ISO 3166-1 alpha-2 codes (e.g. 'MY', 'US', 'GB', 'CA',
-- 'AU') — matches App Store Connect / Play Console territory codes, which
-- matters once regional pricing is configured, and gives a standard key for
-- a phone-dialing-code lookup later.
--
-- SAFE FOR EXISTING DATA: both ALTER TABLE ... ADD COLUMN ... DEFAULT
-- statements below are metadata-only operations in Postgres (no full table
-- rewrite, no row lock) when the default is a constant. Every existing row
-- in both tables — all ~9k profiles and all 25 existing universities, which
-- are 100% Malaysian today — gets 'MY' automatically as part of adding the
-- column itself. No separate UPDATE/backfill statement is needed or run.
-- New signups also default to 'MY' unless a user actively picks otherwise.
--
-- Nothing else in this migration changes: no existing column, policy, or
-- row is touched.

alter table public.profiles
  add column if not exists country text not null default 'MY'
  check (country = upper(country) and char_length(country) = 2);

alter table public.universities
  add column if not exists country text not null default 'MY'
  check (country = upper(country) and char_length(country) = 2);

create index if not exists idx_profiles_country on public.profiles (country);
create index if not exists idx_universities_country on public.universities (country);

comment on column public.profiles.country is
  'ISO 3166-1 alpha-2 country code. Defaults to MY (Malaysia) for all existing users. User-editable in Settings.';
comment on column public.universities.country is
  'ISO 3166-1 alpha-2 country code the university belongs to. Defaults to MY for all pre-existing (Malaysian) rows.';

-- ==============================================================================
-- 20260826000001_universities_case_insensitive_id.sql
-- Description: One row per university id, regardless of casing.
--
-- `universities` had accumulated case-variant duplicates of the same institution
-- (`usim`/`USIM`, `unisza`/`UniSZA`/`UNISZA`, plus a row literally named
-- "Universiti Sultan Zainal Abidin1"). Each variant is a separate key for
-- profiles, calendar offers and campuses, so students at one spelling could not
-- see the calendar published under another — 531 students were split this way.
--
-- Run the id merge script before this migration; it fails while duplicates exist,
-- which is the intended safeguard.
-- ==============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS universities_id_lower_key
ON public.universities (lower(id));

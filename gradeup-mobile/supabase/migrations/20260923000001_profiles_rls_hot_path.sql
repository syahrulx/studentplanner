-- =============================================================================
-- profiles: make the UPDATE path cheap again.
--
-- Applied by hand on 2026-09-23 during the incident; committed so that a fresh
-- environment matches production. Every statement is idempotent.
--
-- What was wrong
-- --------------
-- A single-row `UPDATE profiles ... WHERE id = $1` touched ~31,480 buffer pages
-- and took 4–5 s. The table is 611 pages. Two things stacked:
--
--   1. profiles_admin_update carried a bare `is_admin()`. Permissive policies
--      are OR'd before the RESTRICTIVE one is AND'd, and Postgres does not
--      reorder the arms of that OR — so for every row that was not the
--      caller's, `auth.uid() = id` was false and `is_admin()` (SECURITY
--      DEFINER, one admin_users probe each) ran to resolve it. 15,097 rows,
--      15,096 calls per UPDATE: 24 million admin_users index scans in 18
--      minutes against a table with zero rows.
--
--   2. rencana_profiles_no_plan_elevation's WITH CHECK compares against the
--      row's current values via two `(SELECT ... FROM profiles p WHERE p.id =
--      auth.uid())` subqueries. Inlined, auth.uid() becomes
--      current_setting(...)::jsonb ->> 'sub', and current_setting is not
--      LEAKPROOF — so the qual could not be pushed inside the nested RLS
--      barrier. Each subquery seq-scanned profiles and re-parsed the JWT
--      claims on every row: ~30,000 JSONB parses per UPDATE, ~1 s of CPU.
--
-- Slow UPDATEs held row locks; the two background writes the shipped app makes
-- on every launch then blocked each other in chains; PostgREST ran out of
-- workers; the pooler's own auth query timed out. Memory and CPU upgrades did
-- not help because neither was the constraint.
--
-- What changed, and why in this form
-- ----------------------------------
-- The two profiles_admin_* policies are DROPPED rather than rewritten. Hoisting
-- them to `(select is_admin())` was tried first and broke every profiles
-- UPDATE with 42P17 "infinite recursion detected in policy". Postgres only runs
-- its RLS recursion check when a policy expression contains a subquery; adding
-- one to profiles' SELECT policies armed the check exactly where the
-- RESTRICTIVE policy's `FROM profiles p` re-enters the table. admin_users has
-- no rows, so the two policies granted nothing to anyone; removing them is a
-- no-op for access and removes the trap.
--
-- rencana_profiles_no_plan_elevation keeps its logic exactly and only wraps
-- auth.uid() as (select auth.uid()). That yields a Param, which is leakproof
-- and pushable, so the two subqueries become primary-key lookups. Measured
-- after: 16 pages and 1 ms per UPDATE, zero lock waits.
--
-- CONSTRAINT this leaves behind: while rencana_profiles_no_plan_elevation
-- references profiles from inside a profiles policy, the SELECT policies on
-- profiles must stay free of subqueries — including (select auth.uid()).
-- Adding one re-arms the recursion check and breaks every UPDATE.
-- =============================================================================

set lock_timeout = '5s';

drop policy if exists profiles_admin_read   on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;

alter policy rencana_profiles_no_plan_elevation on public.profiles
  using (((select auth.uid()) = id))
  with check ((((select auth.uid()) = id) AND (subscription_plan = ( SELECT p.subscription_plan
   FROM profiles p
  WHERE (p.id = (select auth.uid())))) AND (NOT (ai_token_limit_override IS DISTINCT FROM ( SELECT p.ai_token_limit_override
   FROM profiles p
  WHERE (p.id = (select auth.uid())))))));

reset lock_timeout;

-- =============================================================================
-- Same mechanism, other tables — applied by hand the same day.
--
-- Three policies read `FROM profiles p WHERE p.id = auth.uid()` from inside
-- another table's policy. The nested profiles scan hit the same non-leakproof
-- wall: 611 pages and a JWT parse per row, once per outer row. The
-- university_calendar_offers SELECT sits on the boot path and measured 429 ms
-- and 4,306 pages per call before; 1 ms and 50 pages after. Logic unchanged.
--
-- Safe with respect to the recursion constraint above: none of these tables
-- reference themselves, and profiles' SELECT policies remain subquery-free.
-- =============================================================================

set lock_timeout = '5s';

alter policy university_calendar_offers_read_own_university on public.university_calendar_offers
  using (((university_id <> 'uitm'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.university_id = university_calendar_offers.university_id) AND ((university_calendar_offers.campus_id IS NULL) OR (EXISTS ( SELECT 1
           FROM campuses c
          WHERE ((c.id = university_calendar_offers.campus_id) AND (c.university_id = p.university_id) AND (lower(regexp_replace(TRIM(BOTH FROM c.name), '\s+'::text, ' '::text, 'g'::text)) = lower(regexp_replace(TRIM(BOTH FROM COALESCE(p.campus, ''::text)), '\s+'::text, ' '::text, 'g'::text))))))))))));

alter policy university_calendar_offers_insert_own on public.university_calendar_offers
  with check (((created_by = (select auth.uid())) AND (source = 'crowdsourced'::text) AND (university_id IS DISTINCT FROM 'uitm'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.university_id = university_calendar_offers.university_id) AND (((university_calendar_offers.campus_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM campuses c
          WHERE ((c.id = university_calendar_offers.campus_id) AND (c.university_id = p.university_id) AND (lower(regexp_replace(TRIM(BOTH FROM c.name), '\s+'::text, ' '::text, 'g'::text)) = lower(regexp_replace(TRIM(BOTH FROM COALESCE(p.campus, ''::text)), '\s+'::text, ' '::text, 'g'::text))))))) OR ((university_calendar_offers.campus_id IS NULL) AND ((NULLIF(TRIM(BOTH FROM COALESCE(p.campus, ''::text)), ''::text) IS NULL) OR (TRIM(BOTH FROM COALESCE(p.campus, ''::text)) = '-'::text) OR (NOT (EXISTS ( SELECT 1
           FROM campuses c
          WHERE (c.university_id = p.university_id))))))))))));

alter policy "Users can create community posts" on public.community_posts
  with check ((((select auth.uid()) = author_id) AND ((post_type = 'service'::text) OR ((post_type = ANY (ARRAY['event'::text, 'memo'::text])) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.authority_status = 'approved'::text))))))));

reset lock_timeout;

-- tasks_pkey is (id, user_id) — id first — so `WHERE user_id = $1` could not use
-- it and read ~215 pages per boot query for ~20 rows. Run outside a transaction.
create index concurrently if not exists idx_tasks_user_id on public.tasks (user_id);

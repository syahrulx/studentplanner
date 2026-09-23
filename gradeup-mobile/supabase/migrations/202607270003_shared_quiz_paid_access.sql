-- Recovered on 2026-09-23 from supabase_migrations.schema_migrations.
-- This migration was applied to production through the CLI from a checkout
-- whose file was never committed; the statements below are the recorded ones,
-- verbatim, so the repo and the history table agree. Version kept as-is.

-- Quiz Together is launched from paid private messaging, so its database
-- records receive the same Plus/Pro subscription enforcement.

drop policy if exists "paid subscribers can select quiz sessions" on public.quiz_sessions;

create policy "paid subscribers can select quiz sessions"
  on public.quiz_sessions
  as restrictive
  for select
  to authenticated
  using (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can insert quiz sessions" on public.quiz_sessions;

create policy "paid subscribers can insert quiz sessions"
  on public.quiz_sessions
  as restrictive
  for insert
  to authenticated
  with check (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can update quiz sessions" on public.quiz_sessions;

create policy "paid subscribers can update quiz sessions"
  on public.quiz_sessions
  as restrictive
  for update
  to authenticated
  using (public.has_paid_messaging_access(auth.uid()))
  with check (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can select quiz participants" on public.quiz_participants;

create policy "paid subscribers can select quiz participants"
  on public.quiz_participants
  as restrictive
  for select
  to authenticated
  using (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can insert quiz participants" on public.quiz_participants;

create policy "paid subscribers can insert quiz participants"
  on public.quiz_participants
  as restrictive
  for insert
  to authenticated
  with check (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can update quiz participants" on public.quiz_participants;

create policy "paid subscribers can update quiz participants"
  on public.quiz_participants
  as restrictive
  for update
  to authenticated
  using (public.has_paid_messaging_access(auth.uid()))
  with check (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can select quiz scores" on public.quiz_scores;

create policy "paid subscribers can select quiz scores"
  on public.quiz_scores
  as restrictive
  for select
  to authenticated
  using (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can insert quiz scores" on public.quiz_scores;

create policy "paid subscribers can insert quiz scores"
  on public.quiz_scores
  as restrictive
  for insert
  to authenticated
  with check (public.has_paid_messaging_access(auth.uid()));

-- MANUAL MIGRATION — DO NOT AUTO-RUN.
--
-- Purpose:
--   • enforce at most five quick reactions/bumps per sender per minute;
--   • prevent university/campus deletion while related user or app records exist;
--   • save support replies, report status, and in-app notifications atomically;
--   • make quick_reactions self-contained for databases that did not run the
--     legacy standalone community schema.
--
-- This migration deletes or rewrites no user data. It adds missing schema,
-- policies, indexes, functions, and BEFORE triggers. Administrators must
-- explicitly reassign/remove dependencies before an unused redundant
-- institution record can be deleted.

begin;

create table if not exists public.quick_reactions (
  id uuid not null default gen_random_uuid() primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null,
  message text,
  created_at timestamptz not null default now(),
  read boolean not null default false
);

alter table public.quick_reactions enable row level security;
revoke all on table public.quick_reactions from anon;
grant select, insert, update, delete on table public.quick_reactions to authenticated;

drop policy if exists "Users can read own reactions" on public.quick_reactions;
create policy "Users can read own reactions" on public.quick_reactions
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "Users can send reactions" on public.quick_reactions;
create policy "Users can send reactions" on public.quick_reactions
  for insert with check (auth.uid() = sender_id);
drop policy if exists "Receiver can update reactions" on public.quick_reactions;
create policy "Receiver can update reactions" on public.quick_reactions
  for update using (auth.uid() = receiver_id) with check (auth.uid() = receiver_id);
drop policy if exists "Users can delete own reactions" on public.quick_reactions;
create policy "Users can delete own reactions" on public.quick_reactions
  for delete using (auth.uid() = sender_id or auth.uid() = receiver_id);

create index if not exists quick_reactions_sender_created_idx
  on public.quick_reactions (sender_id, created_at desc);

create or replace function public.enforce_quick_reaction_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count integer;
begin
  if new.sender_id is null then
    raise exception 'A reaction sender is required.' using errcode = '23502';
  end if;

  if auth.uid() is not null and new.sender_id <> auth.uid() then
    raise exception 'You cannot send a reaction as another user.' using errcode = '42501';
  end if;

  -- Serialise concurrent sends from the same account so parallel requests
  -- cannot pass the count at the same time.
  perform pg_advisory_xact_lock(hashtextextended(new.sender_id::text, 0));
  select count(*) into v_recent_count
  from public.quick_reactions r
  where r.sender_id = new.sender_id
    and r.created_at >= now() - interval '1 minute';

  if v_recent_count >= 5 then
    raise exception 'Reaction limit reached: maximum 5 reactions or bumps per minute.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists quick_reactions_rate_limit_guard on public.quick_reactions;
create trigger quick_reactions_rate_limit_guard
before insert on public.quick_reactions
for each row execute function public.enforce_quick_reaction_rate_limit();

create or replace function public.prevent_university_delete_with_dependencies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profiles bigint;
  v_campuses bigint;
  v_organizations bigint;
  v_calendars bigint;
  v_mappings bigint;
  v_courses bigint;
  v_posts bigint;
  v_authority bigint;
  v_confessions bigint;
  v_rooms bigint;
  v_faculties bigint;
begin
  select count(*) into v_profiles from public.profiles where university_id = old.id;
  select count(*) into v_campuses from public.campuses where university_id = old.id;
  select count(*) into v_organizations from public.organizations where university_id = old.id;
  select count(*) into v_calendars from public.university_calendar_offers where university_id = old.id;
  select count(*) into v_mappings from public.university_mappings where university_id = old.id;
  select count(*) into v_courses from public.courses where university_id = old.id;
  select count(*) into v_posts from public.community_posts where university_id = old.id;
  select count(*) into v_authority from public.authority_requests where university_id = old.id;
  select count(*) into v_confessions from public.confessions where university_id = old.id;
  select count(*) into v_rooms from public.campus_rooms where university_id = old.id;
  select count(*) into v_faculties from public.campus_faculties where university_id = old.id;

  if v_profiles + v_campuses + v_organizations + v_calendars + v_mappings + v_courses
      + v_posts + v_authority + v_confessions + v_rooms + v_faculties > 0 then
    raise exception
      'University is still in use (profiles %, campuses %, organizations %, calendars %, mappings %, courses %, posts %, authority requests %, confessions %, rooms %, faculties %). Reassign dependencies first.',
      v_profiles, v_campuses, v_organizations, v_calendars, v_mappings, v_courses,
      v_posts, v_authority, v_confessions, v_rooms, v_faculties
      using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists universities_safe_delete_guard on public.universities;
create trigger universities_safe_delete_guard
before delete on public.universities
for each row execute function public.prevent_university_delete_with_dependencies();

create or replace function public.prevent_campus_delete_with_dependencies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profiles bigint;
  v_organizations bigint;
  v_posts bigint;
  v_authority bigint;
  v_calendars bigint;
  v_confessions bigint;
  v_rooms bigint;
  v_faculties bigint;
begin
  select count(*) into v_profiles
  from public.profiles p
  where p.university_id = old.university_id
    and lower(regexp_replace(trim(coalesce(p.campus, '')), '\s+', ' ', 'g')) =
        lower(regexp_replace(trim(old.name), '\s+', ' ', 'g'));
  select count(*) into v_organizations from public.organizations where campus_id = old.id;
  select count(*) into v_posts from public.community_posts where campus_id = old.id;
  select count(*) into v_authority from public.authority_requests where campus_id = old.id;
  select count(*) into v_calendars from public.university_calendar_offers where campus_id = old.id;
  select count(*) into v_confessions
  from public.confessions c
  where c.university_id = old.university_id
    and lower(regexp_replace(trim(coalesce(c.campus, '')), '\s+', ' ', 'g')) =
        lower(regexp_replace(trim(old.name), '\s+', ' ', 'g'));
  select count(*) into v_rooms
  from public.campus_rooms r
  where r.university_id = old.university_id
    and lower(regexp_replace(trim(coalesce(r.campus, '')), '\s+', ' ', 'g')) =
        lower(regexp_replace(trim(old.name), '\s+', ' ', 'g'));
  select count(*) into v_faculties
  from public.campus_faculties f
  where f.university_id = old.university_id
    and lower(regexp_replace(trim(coalesce(f.campus, '')), '\s+', ' ', 'g')) =
        lower(regexp_replace(trim(old.name), '\s+', ' ', 'g'));

  if v_profiles + v_organizations + v_posts + v_authority + v_calendars
      + v_confessions + v_rooms + v_faculties > 0 then
    raise exception
      'Campus is still in use (profiles %, organizations %, posts %, authority requests %, calendars %, confessions %, rooms %, faculties %). Reassign dependencies first.',
      v_profiles, v_organizations, v_posts, v_authority, v_calendars,
      v_confessions, v_rooms, v_faculties
      using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists campuses_safe_delete_guard on public.campuses;
create trigger campuses_safe_delete_guard
before delete on public.campuses
for each row execute function public.prevent_campus_delete_with_dependencies();

-- Save the admin-visible reply, report status, and user notification in one
-- transaction. The Edge Function sends the OS push only after this succeeds.
create or replace function public.admin_reply_support_report(
  p_report_id uuid,
  p_admin_id uuid,
  p_body text,
  p_status text default 'in_progress'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.support_reports%rowtype;
  v_message public.support_report_messages%rowtype;
  v_notification_id uuid;
begin
  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'A reply message is required.' using errcode = '22023';
  end if;
  if char_length(trim(p_body)) > 4000 then
    raise exception 'Reply message is too long.' using errcode = '22001';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'dismissed') then
    raise exception 'Invalid support report status.' using errcode = '22023';
  end if;

  select * into v_report
  from public.support_reports
  where id = p_report_id
  for update;
  if not found or v_report.reporter_id is null then
    raise exception 'Support report not found.' using errcode = 'P0002';
  end if;

  insert into public.support_report_messages (report_id, author_id, author_role, body)
  values (p_report_id, p_admin_id, 'admin', trim(p_body))
  returning * into v_message;

  update public.support_reports
  set status = p_status,
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
  where id = p_report_id
  returning * into v_report;

  insert into public.in_app_notifications (user_id, title, body, category, data)
  values (
    v_report.reporter_id,
    'Reply to your support report',
    left(trim(p_body), 500),
    'support',
    jsonb_build_object(
      'type', 'support_reply',
      'route', '/support-ticket',
      'params', jsonb_build_object('reportId', p_report_id)
    )
  )
  returning id into v_notification_id;

  return jsonb_build_object(
    'row', to_jsonb(v_report),
    'message', to_jsonb(v_message),
    'notification_id', v_notification_id
  );
end;
$$;

revoke all on function public.admin_reply_support_report(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_reply_support_report(uuid, uuid, text, text) to service_role;

commit;

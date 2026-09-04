-- MANUAL MIGRATION — DO NOT AUTO-RUN.
--
-- Purpose:
--   • enforce at most five quick reactions/bumps per sender per minute;
--   • prevent university/campus deletion while related user or app records exist.
--
-- This migration deletes or rewrites no user data. It only adds indexes and
-- BEFORE triggers. Administrators must explicitly reassign/remove dependencies
-- before an unused redundant institution record can be deleted.

begin;

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
begin
  select count(*) into v_profiles from public.profiles where university_id = old.id;
  select count(*) into v_campuses from public.campuses where university_id = old.id;
  select count(*) into v_organizations from public.organizations where university_id = old.id;
  select count(*) into v_calendars from public.university_calendar_offers where university_id = old.id;
  select count(*) into v_mappings from public.university_mappings where university_id = old.id;
  select count(*) into v_courses from public.courses where university_id = old.id;

  if v_profiles + v_campuses + v_organizations + v_calendars + v_mappings + v_courses > 0 then
    raise exception
      'University is still in use (profiles %, campuses %, organizations %, calendars %, mappings %, courses %). Reassign dependencies first.',
      v_profiles, v_campuses, v_organizations, v_calendars, v_mappings, v_courses
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

  if v_profiles + v_organizations + v_posts + v_authority + v_calendars > 0 then
    raise exception
      'Campus is still in use (profiles %, organizations %, posts %, authority requests %, calendars %). Reassign dependencies first.',
      v_profiles, v_organizations, v_posts, v_authority, v_calendars
      using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists campuses_safe_delete_guard on public.campuses;
create trigger campuses_safe_delete_guard
before delete on public.campuses
for each row execute function public.prevent_campus_delete_with_dependencies();

commit;

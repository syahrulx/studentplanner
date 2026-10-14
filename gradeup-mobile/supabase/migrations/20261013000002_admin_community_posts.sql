-- =============================================================================
-- Admin website: post Events and Memos to the app's Community, as
-- "Admin Rencana".
--
-- The app shows a post's author from the poster's profile name
-- (src/lib/eventsApi.ts), so every admin post is made under ONE account whose
-- profile name is "Admin Rencana". That works in every app version already on
-- phones, with no app release.
--
-- 1. admin_settings 'rencana_post_author' = the account posts are made as.
--    Set here to admin@rencana.com if that account exists.
-- 2. That account's profile name becomes "Admin Rencana" (ONE row changed).
-- 3. admin_create_community_post(): admins only; inserts the post as that
--    account (bypasses the "approved authority" rule students need), and logs
--    which admin posted it.
--
-- Creating a post sends no push (the event push trigger was removed in
-- 20260502140000), so a post never notifies anyone by itself.
-- =============================================================================

-- 1. Which account admin posts are made as.
insert into public.admin_settings (key, value)
select 'rencana_post_author', jsonb_build_object('user_id', u.id, 'email', u.email)
  from auth.users u
 where lower(u.email) = 'admin@rencana.com'
on conflict (key) do nothing;

-- 2. Its public name in the app. Only this one admin account is changed.
update public.profiles p
   set name = 'Admin Rencana'
  from public.admin_settings s
 where s.key = 'rencana_post_author'
   and p.id = (s.value->>'user_id')::uuid
   and p.name is distinct from 'Admin Rencana';

-- 3. Post as Admin Rencana.
create or replace function public.admin_create_community_post(
  p_type text,
  p_title text,
  p_body text default null,
  p_university_id text default null,
  p_campus text default null,
  p_event_date date default null,
  p_event_time text default null,
  p_location text default null,
  p_expires_at timestamptz default null,
  p_pinned boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_uni text := nullif(btrim(coalesce(p_university_id, '')), '');
  v_campus text := nullif(btrim(coalesce(p_campus, '')), '');
  v_campus_id uuid;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if p_type not in ('event', 'memo') then
    raise exception 'Post type must be event or memo.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'Give it a title (at least 3 characters).' using errcode = 'P0001';
  end if;
  if v_campus is not null and v_uni is null then
    raise exception 'Pick a university for a campus post.' using errcode = 'P0001';
  end if;

  select (s.value->>'user_id')::uuid into v_author
    from public.admin_settings s where s.key = 'rencana_post_author';
  if v_author is null or not exists (select 1 from auth.users u where u.id = v_author) then
    raise exception 'No "Admin Rencana" account is set. Run migration 20261013000002 or set admin_settings.rencana_post_author.'
      using errcode = 'P0001';
  end if;

  if v_campus is not null then
    select c.id into v_campus_id
      from public.campuses c
     where c.university_id = v_uni and lower(btrim(c.name)) = lower(v_campus)
     limit 1;
  end if;

  insert into public.community_posts (
    author_id, post_type, title, body, university_id, campus, campus_id,
    event_date, event_time, location, expires_at, pinned, status
  ) values (
    v_author, p_type, btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''), v_uni, v_campus, v_campus_id,
    p_event_date, nullif(btrim(coalesce(p_event_time, '')), ''), nullif(btrim(coalesce(p_location, '')), ''),
    p_expires_at, coalesce(p_pinned, false), 'active'
  )
  returning id into v_id;

  insert into public.admin_logs (type, status, meta)
  values ('api_request', 'success', jsonb_build_object(
    'action', 'admin_community_post', 'actor', auth.uid(), 'post_id', v_id,
    'post_type', p_type, 'title', btrim(p_title), 'university_id', v_uni, 'campus', v_campus));

  return v_id;
end;
$$;

revoke all on function public.admin_create_community_post(text, text, text, text, text, date, text, text, timestamptz, boolean) from public, anon;
grant execute on function public.admin_create_community_post(text, text, text, text, text, date, text, text, timestamptz, boolean) to authenticated;

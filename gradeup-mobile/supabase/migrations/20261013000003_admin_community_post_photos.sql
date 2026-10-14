-- =============================================================================
-- Admin "Post as Admin Rencana": add up to 3 photos.
-- Run AFTER 20261013000002_admin_community_posts.sql.
--
-- Photos are uploaded by the admin website to the same storage bucket the app
-- uses (community-images, the admin's own folder); this only saves their
-- public URLs on the post (image_urls, and image_url = the first for older
-- app versions). Replaces the function; changes no data.
-- =============================================================================

drop function if exists public.admin_create_community_post(text, text, text, text, text, date, text, text, timestamptz, boolean);

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
  p_pinned boolean default false,
  p_image_urls text[] default '{}'
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
  v_images text[];
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

  -- Only https links, at most 3 (the app shows up to 3).
  select coalesce(array_agg(u order by ord), '{}')
    into v_images
    from unnest(coalesce(p_image_urls, '{}')) with ordinality as t(u, ord)
   where u ~ '^https://' and ord <= 3;

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
    event_date, event_time, location, expires_at, pinned, status,
    image_url, image_urls
  ) values (
    v_author, p_type, btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''), v_uni, v_campus, v_campus_id,
    p_event_date, nullif(btrim(coalesce(p_event_time, '')), ''), nullif(btrim(coalesce(p_location, '')), ''),
    p_expires_at, coalesce(p_pinned, false), 'active',
    v_images[1], v_images
  )
  returning id into v_id;

  insert into public.admin_logs (type, status, meta)
  values ('api_request', 'success', jsonb_build_object(
    'action', 'admin_community_post', 'actor', auth.uid(), 'post_id', v_id,
    'post_type', p_type, 'title', btrim(p_title), 'university_id', v_uni, 'campus', v_campus,
    'photos', coalesce(array_length(v_images, 1), 0)));

  return v_id;
end;
$$;

revoke all on function public.admin_create_community_post(text, text, text, text, text, date, text, text, timestamptz, boolean, text[]) from public, anon;
grant execute on function public.admin_create_community_post(text, text, text, text, text, date, text, text, timestamptz, boolean, text[]) to authenticated;

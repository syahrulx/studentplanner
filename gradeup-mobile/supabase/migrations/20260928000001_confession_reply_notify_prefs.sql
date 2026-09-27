-- Let students choose whether they hear about replies to their confessions.
--
-- Two switches, both on by default so nobody's behaviour changes:
--
--   confessions.notify_replies               per confession, set in the composer.
--                                            Off = the author is never told about
--                                            replies in that thread, neither by
--                                            push nor in the inbox.
--   profiles.push_confession_replies_enabled Community Settings category switch,
--                                            same shape as push_circle_enabled
--                                            etc. Read by the community-push Edge
--                                            Function for category 'confession'.
--
-- Until now confession reply pushes (20260927000005) went out under category
-- 'reaction', so the only way to silence them was to turn off Reactions & bumps.
-- They now go out as 'confession'. An Edge Function that predates this category
-- falls through to its default branch, which is the reactions switch — the same
-- behaviour as before, so the migration and the function deploy can land in
-- either order.
--
-- Both columns are NOT NULL with a constant default: metadata-only on PG 11+,
-- no table rewrite, no backfill.

set lock_timeout = '5s';

alter table public.confessions
  add column if not exists notify_replies boolean not null default true;

comment on column public.confessions.notify_replies is
  'Author wants to be notified about replies in this thread. Set when posting.';

alter table public.profiles
  add column if not exists push_confession_replies_enabled boolean not null default true;

comment on column public.profiles.push_confession_replies_enabled is
  'Per-category toggle for replies to your confessions and confession comments.';

-- ─── create_confession: optional p_notify_replies ───────────────────────────
-- A new parameter needs a new signature. The old 3-argument overload is dropped
-- rather than kept: with both present, a 3-argument call matches each of them
-- and PostgREST refuses to choose. Old clients that never send p_notify_replies
-- land on the default.
--
-- Body recreated verbatim from 20260923000002 (identical to prod) with only
-- notify_replies added to the insert.

drop function if exists public.create_confession(text, text, boolean);

create function public.create_confession(
  p_content text,
  p_tag text default null,
  p_anonymous boolean default true,
  p_notify_replies boolean default true
)
returns table (
  id uuid, content text, campus text, tag text, created_at timestamptz,
  like_count integer, comment_count integer, my_reaction text, reaction_counts jsonb,
  is_mine boolean, is_anonymous boolean, confession_no integer,
  author_name text, author_avatar text
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_uni    text;
  v_campus text;
  v_trimmed text;
  v_plan   text;
  v_recent_30m int;
  v_recent_24h int;
  v_anon   boolean := coalesce(p_anonymous, true);
  v_no     integer;
  v_name   text;
  v_avatar text;
  v_row public.confessions%rowtype;
begin
  select out_uni, out_campus into v_uni, v_campus from public._confession_assert_can_post();
  v_trimmed := trim(coalesce(p_content, ''));
  if char_length(v_trimmed) < 1 or char_length(v_trimmed) > 500 then
    raise exception 'Confession must be between 1 and 500 characters.' using errcode = 'P0001';
  end if;

  select coalesce(p.subscription_plan, 'free'), p.name, p.avatar_url
    into v_plan, v_name, v_avatar
  from public.profiles p where p.id = v_uid;

  -- Rate limits only apply to free users
  if v_plan = 'free' then
    select count(*)::int into v_recent_30m from public.confessions cr
    where cr.author_id = v_uid and cr.created_at > now() - interval '30 minutes';
    if v_recent_30m >= 1 then
      raise exception 'Please wait 30 minutes between confessions.' using errcode = 'P0001';
    end if;

    select count(*)::int into v_recent_24h from public.confessions cr
    where cr.author_id = v_uid and cr.created_at > now() - interval '24 hours';
    if v_recent_24h >= 5 then
      raise exception 'You can post at most 5 confessions per 24 hours.' using errcode = 'P0001';
    end if;
  end if;

  -- Serialise numbering per campus so two simultaneous posts never share a number.
  perform pg_advisory_xact_lock(hashtext('confession_no:' || v_uni || ':' || coalesce(v_campus, '')));
  select coalesce(max(cn.confession_no), 0) + 1 into v_no
  from public.confessions cn
  where cn.university_id = v_uni and coalesce(cn.campus, '') = coalesce(v_campus, '');

  insert into public.confessions (author_id, university_id, campus, content, tag, is_anonymous, confession_no, notify_replies)
  values (v_uid, v_uni, v_campus, v_trimmed, p_tag, v_anon, v_no, coalesce(p_notify_replies, true))
  returning * into v_row;

  return query select v_row.id, v_row.content, v_row.campus, v_row.tag, v_row.created_at,
    v_row.like_count, v_row.comment_count, null::text, '{}'::jsonb, true::boolean,
    v_row.is_anonymous, v_row.confession_no,
    case when v_anon then null else v_name end,
    case when v_anon then null else v_avatar end;
end;
$$;

revoke all on function public.create_confession(text, text, boolean, boolean) from public, anon;
grant execute on function public.create_confession(text, text, boolean, boolean) to authenticated, service_role;

-- ─── add_confession_comment: honour notify_replies, category 'confession' ────
-- Recreated verbatim from 20260927000005_confession_reply_push.sql. Changes:
--   * reads notify_replies alongside the author in the existing lookup
--   * the author is not notified when they turned replies off for this post —
--     including replies to their own comments in that thread, since "don't
--     notify me about this confession" means the whole thread
--   * both pushes use category 'confession' instead of 'reaction'

CREATE OR REPLACE FUNCTION public.add_confession_comment(p_confession_id uuid, p_content text, p_parent_id uuid DEFAULT NULL)
RETURNS TABLE (
  id          uuid,
  content     text,
  created_at  timestamptz,
  alias       text,
  is_mine     boolean,
  parent_id   uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uni text;
  v_trimmed text;
  v_plan text;
  v_recent_2m int;
  v_recent_24h int;
  v_conf_author uuid;
  v_conf_notify boolean;
  v_parent_author uuid;
  v_row public.confession_comments%ROWTYPE;
  v_alias text;
BEGIN
  SELECT out_uni INTO v_uni FROM public._confession_assert_can_post();
  v_trimmed := trim(coalesce(p_content, ''));
  IF char_length(v_trimmed) < 1 OR char_length(v_trimmed) > 300 THEN
    RAISE EXCEPTION 'Comment must be between 1 and 300 characters.' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.author_id, c.notify_replies INTO v_conf_author, v_conf_notify FROM public.confessions c
  WHERE c.id = p_confession_id AND c.university_id = v_uni AND c.status = 'active';
  IF v_conf_author IS NULL THEN RAISE EXCEPTION 'Confession not found' USING ERRCODE = 'P0001'; END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT cc.author_id INTO v_parent_author FROM public.confession_comments cc
    WHERE cc.id = p_parent_id AND cc.confession_id = p_confession_id;
    IF v_parent_author IS NULL THEN
      RAISE EXCEPTION 'Parent comment not found' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Check subscription plan
  SELECT coalesce(p.subscription_plan, 'free') INTO v_plan
  FROM public.profiles p WHERE p.id = v_uid;

  -- Rate limits only apply to free users
  IF v_plan = 'free' THEN
    -- Spam detection: max 5 comments within 2 minutes
    SELECT COUNT(*)::int INTO v_recent_2m FROM public.confession_comments cc
    WHERE cc.author_id = v_uid AND cc.created_at > now() - interval '2 minutes';
    IF v_recent_2m >= 5 THEN
      RAISE EXCEPTION 'Slow down! You''re commenting too fast.' USING ERRCODE = 'P0001';
    END IF;

    -- Daily cap: 30 comments per 24 hours
    SELECT COUNT(*)::int INTO v_recent_24h FROM public.confession_comments cc
    WHERE cc.author_id = v_uid AND cc.created_at > now() - interval '24 hours';
    IF v_recent_24h >= 30 THEN
      RAISE EXCEPTION 'You can post at most 30 comments per 24 hours.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.confession_comments (confession_id, author_id, content, parent_id)
  VALUES (p_confession_id, v_uid, v_trimmed, p_parent_id)
  RETURNING * INTO v_row;

  UPDATE public.confessions c SET comment_count = c.comment_count + 1 WHERE c.id = p_confession_id;

  IF v_conf_author = v_uid THEN
    v_alias := 'OP';
  ELSE
    SELECT 'Anon ' || COALESCE((
      SELECT am.anon_num::text FROM (
        SELECT cc2.author_id, dense_rank() OVER (ORDER BY MIN(cc2.created_at))::int AS anon_num
        FROM public.confession_comments cc2
        WHERE cc2.confession_id = p_confession_id AND cc2.status = 'active' AND cc2.author_id <> v_conf_author
        GROUP BY cc2.author_id
      ) am WHERE am.author_id = v_uid
    ), '1') INTO v_alias;
  END IF;

  -- Notifications. Nobody is ever told about their own comment, and nobody is
  -- told twice: when the confession author is also the commenter being replied
  -- to, they get the more specific "your comment" push and not both.
  --
  -- The confession author can turn replies off for this post (notify_replies).
  -- That silences them for the whole thread, including replies to their own
  -- comments in it; other commenters are unaffected.
  --
  -- Each push is wrapped: _send_community_push reads Vault and calls pg_net,
  -- and a failure there must not roll back a comment the user already posted.

  -- Replying to a comment: tell whoever wrote it.
  IF v_parent_author IS NOT NULL AND v_parent_author IS DISTINCT FROM v_uid
     AND (v_parent_author IS DISTINCT FROM v_conf_author OR v_conf_notify) THEN
    BEGIN
      PERFORM public._send_community_push(jsonb_build_object(
        'recipientUserIds', jsonb_build_array(v_parent_author),
        'title',            'New reply to your comment',
        'body',             'Someone replied. Tap to read it.',
        'category',         'confession',
        'collapseKey',      'confession_comment_reply:' || p_parent_id::text,
        'data', jsonb_build_object(
          'type',         'confession_reply',
          'confessionId', p_confession_id
        )
      ));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Tell the confession author, unless they were just told as the commenter
  -- being replied to. collapseKey folds a burst of replies on one confession
  -- into a single notification instead of one per reply.
  --
  -- Its own block: if notifying the commenter fails, the author must still be
  -- told, and vice versa.
  IF v_conf_notify
     AND v_conf_author IS DISTINCT FROM v_uid
     AND v_conf_author IS DISTINCT FROM v_parent_author THEN
    BEGIN
      PERFORM public._send_community_push(jsonb_build_object(
        'recipientUserIds', jsonb_build_array(v_conf_author),
        'title',            'New reply to your confession',
        'body',             'Someone replied. Tap to read it.',
        'category',         'confession',
        'collapseKey',      'confession_reply:' || p_confession_id::text,
        'data', jsonb_build_object(
          'type',         'confession_reply',
          'confessionId', p_confession_id
        )
      ));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.content, v_row.created_at, v_alias, true::boolean, v_row.parent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_confession_comment(uuid, text, uuid) TO authenticated;

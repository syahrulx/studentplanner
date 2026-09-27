-- Notify a confession's author when someone replies to it, and a commenter
-- when someone replies to their comment.
--
-- Nothing told the author a reply had arrived, so a confession was effectively
-- fire-and-forget: the only way to find a reply was to reopen the post and
-- look. The push carries the confession id so tapping it lands on that thread.
--
-- Anonymity is preserved. The notification names nobody and quotes nothing:
-- confessions are sensitive, and the reply text would otherwise show on a lock
-- screen anyone can see. The author opens the thread to read it, where the
-- existing "Anon N" aliasing applies as usual.
--
-- Recreated verbatim from 20260615000001_fix_confession_campus_match.sql with
-- only the notification block added, so the campus-match and rate-limit fixes
-- that live in this function are preserved.

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
  v_parent_author uuid;
  v_row public.confession_comments%ROWTYPE;
  v_alias text;
BEGIN
  SELECT out_uni INTO v_uni FROM public._confession_assert_can_post();
  v_trimmed := trim(coalesce(p_content, ''));
  IF char_length(v_trimmed) < 1 OR char_length(v_trimmed) > 300 THEN
    RAISE EXCEPTION 'Comment must be between 1 and 300 characters.' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.author_id INTO v_conf_author FROM public.confessions c
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
  -- Each push is wrapped: _send_community_push reads Vault and calls pg_net,
  -- and a failure there must not roll back a comment the user already posted.

  -- Replying to a comment: tell whoever wrote it.
  IF v_parent_author IS NOT NULL AND v_parent_author IS DISTINCT FROM v_uid THEN
    BEGIN
      PERFORM public._send_community_push(jsonb_build_object(
        'recipientUserIds', jsonb_build_array(v_parent_author),
        'title',            'New reply to your comment',
        'body',             'Someone replied. Tap to read it.',
        'category',         'reaction',
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
  IF v_conf_author IS DISTINCT FROM v_uid
     AND v_conf_author IS DISTINCT FROM v_parent_author THEN
    BEGIN
      PERFORM public._send_community_push(jsonb_build_object(
        'recipientUserIds', jsonb_build_array(v_conf_author),
        'title',            'New reply to your confession',
        'body',             'Someone replied. Tap to read it.',
        'category',         'reaction',
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

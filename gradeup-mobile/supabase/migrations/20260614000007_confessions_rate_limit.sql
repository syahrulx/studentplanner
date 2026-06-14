-- Migration: Stricter rate-limiting for confessions
-- • New posts: 1 every 30 minutes (replies are exempt)
-- • Replies: spam detection — max 5 comments in 2 minutes

-- Drop existing functions to update them
DROP FUNCTION IF EXISTS public.create_confession(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.add_confession_comment(uuid, text, uuid) CASCADE;

-- ─── 1. create_confession (1 per 30 min + 5 per 24h) ─────────────────────────

CREATE OR REPLACE FUNCTION public.create_confession(p_content text, p_tag text DEFAULT NULL)
RETURNS TABLE (
  id             uuid,
  content        text,
  campus         text,
  tag            text,
  created_at     timestamptz,
  like_count     int,
  comment_count  int,
  my_reaction    text,
  reaction_counts jsonb,
  is_mine        boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_uni    text;
  v_campus text;
  v_trimmed text;
  v_recent_30m int;
  v_recent_24h int;
  v_row public.confessions%ROWTYPE;
BEGIN
  SELECT out_uni, out_campus INTO v_uni, v_campus FROM public._confession_assert_can_post();
  v_trimmed := trim(coalesce(p_content, ''));
  IF char_length(v_trimmed) < 1 OR char_length(v_trimmed) > 500 THEN
    RAISE EXCEPTION 'Confession must be between 1 and 500 characters.' USING ERRCODE = 'P0001';
  END IF;

  -- Rate limit: 1 confession per 30 minutes
  SELECT COUNT(*)::int INTO v_recent_30m FROM public.confessions cr
  WHERE cr.author_id = v_uid AND cr.created_at > now() - interval '30 minutes';

  IF v_recent_30m >= 1 THEN
    RAISE EXCEPTION 'Please wait 30 minutes between confessions.' USING ERRCODE = 'P0001';
  END IF;

  -- Daily cap: 5 confessions per 24 hours
  SELECT COUNT(*)::int INTO v_recent_24h FROM public.confessions cr
  WHERE cr.author_id = v_uid AND cr.created_at > now() - interval '24 hours';

  IF v_recent_24h >= 5 THEN
    RAISE EXCEPTION 'You can post at most 5 confessions per 24 hours.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.confessions (author_id, university_id, campus, content, tag)
  VALUES (v_uid, v_uni, v_campus, v_trimmed, p_tag)
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.content, v_row.campus, v_row.tag, v_row.created_at,
    v_row.like_count, v_row.comment_count, NULL::text, '{}'::jsonb, true::boolean;
END;
$$;

-- ─── 2. add_confession_comment (replies exempt, but spam detection) ───────────

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
  v_recent_2m int;
  v_recent_24h int;
  v_conf_author uuid;
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
    IF NOT EXISTS (SELECT 1 FROM public.confession_comments cc WHERE cc.id = p_parent_id AND cc.confession_id = p_confession_id) THEN
      RAISE EXCEPTION 'Parent comment not found' USING ERRCODE = 'P0001';
    END IF;
  END IF;

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

  RETURN QUERY SELECT v_row.id, v_row.content, v_row.created_at, v_alias, true::boolean, v_row.parent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_confession(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_confession_comment(uuid, text, uuid) TO authenticated;

-- Migration: Add Tags and Nested Replies to Confessions

ALTER TABLE public.confessions ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE public.confession_comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.confession_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS confessions_tag_idx ON public.confessions (tag);

-- Drop old functions so signatures update
DROP FUNCTION IF EXISTS public.create_confession(text) CASCADE;
DROP FUNCTION IF EXISTS public.create_confession(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_confessions(timestamptz, int, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_confessions(timestamptz, int, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_confession(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.add_confession_comment(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.add_confession_comment(uuid, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_confession_comments(uuid) CASCADE;

-- 1. create_confession
CREATE OR REPLACE FUNCTION public.create_confession(p_content text, p_tag text DEFAULT NULL)
RETURNS TABLE (
  id             uuid,
  content        text,
  campus         text,
  tag            text,
  created_at     timestamptz,
  like_count     int,
  comment_count  int,
  liked_by_me    boolean,
  is_mine        boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_uni    text;
  v_campus text;
  v_trimmed text;
  v_recent int;
  v_row public.confessions%ROWTYPE;
BEGIN
  SELECT out_uni, out_campus INTO v_uni, v_campus FROM public._confession_assert_can_post();
  v_trimmed := trim(coalesce(p_content, ''));
  IF char_length(v_trimmed) < 1 OR char_length(v_trimmed) > 500 THEN
    RAISE EXCEPTION 'Confession must be between 1 and 500 characters.' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)::int INTO v_recent FROM public.confessions cr
  WHERE cr.author_id = v_uid AND cr.created_at > now() - interval '24 hours';
  
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'You can post at most 5 confessions per 24 hours.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.confessions (author_id, university_id, campus, content, tag)
  VALUES (v_uid, v_uni, v_campus, v_trimmed, p_tag)
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.content, v_row.campus, v_row.tag, v_row.created_at, v_row.like_count, v_row.comment_count, false::boolean, true::boolean;
END;
$$;

-- 2. get_confessions
CREATE OR REPLACE FUNCTION public.get_confessions(p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 20, p_campus text DEFAULT NULL, p_tag text DEFAULT NULL)
RETURNS TABLE (
  id             uuid,
  content        text,
  campus         text,
  tag            text,
  created_at     timestamptz,
  like_count     int,
  comment_count  int,
  liked_by_me    boolean,
  is_mine        boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uni text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT cp.university_id INTO v_uni FROM public._confession_caller_profile() cp;
  IF v_uni IS NULL OR trim(v_uni) = '' THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id, c.content, c.campus, c.tag, c.created_at, c.like_count, c.comment_count,
    EXISTS (SELECT 1 FROM public.confession_likes cl WHERE cl.confession_id = c.id AND cl.user_id = v_uid)::boolean AS liked_by_me,
    (c.author_id = v_uid)::boolean AS is_mine
  FROM public.confessions c
  WHERE c.university_id = v_uni AND c.status = 'active'
    AND (p_before IS NULL OR c.created_at < p_before)
    AND (p_campus IS NULL OR c.campus = p_campus)
    AND (p_tag IS NULL OR c.tag = p_tag)
  ORDER BY c.created_at DESC LIMIT p_limit;
END;
$$;

-- 3. get_confession
CREATE OR REPLACE FUNCTION public.get_confession(p_id uuid)
RETURNS TABLE (
  id             uuid,
  content        text,
  campus         text,
  tag            text,
  created_at     timestamptz,
  like_count     int,
  comment_count  int,
  liked_by_me    boolean,
  is_mine        boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uni text;
BEGIN
  IF v_uid IS NULL OR p_id IS NULL THEN RETURN; END IF;
  SELECT cp.university_id INTO v_uni FROM public._confession_caller_profile() cp;
  IF v_uni IS NULL OR trim(v_uni) = '' THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.id, c.content, c.campus, c.tag, c.created_at, c.like_count, c.comment_count,
    EXISTS (SELECT 1 FROM public.confession_likes cl WHERE cl.confession_id = c.id AND cl.user_id = v_uid)::boolean AS liked_by_me,
    (c.author_id = v_uid)::boolean AS is_mine
  FROM public.confessions c
  WHERE c.id = p_id AND c.university_id = v_uni AND c.status = 'active';
END;
$$;

-- 4. add_confession_comment
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
  v_recent int;
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

  SELECT COUNT(*)::int INTO v_recent FROM public.confession_comments cc
  WHERE cc.author_id = v_uid AND cc.created_at > now() - interval '24 hours';
  IF v_recent >= 30 THEN RAISE EXCEPTION 'You can post at most 30 comments per 24 hours.' USING ERRCODE = 'P0001'; END IF;

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

-- 5. get_confession_comments
CREATE OR REPLACE FUNCTION public.get_confession_comments(p_confession_id uuid)
RETURNS TABLE (
  id          uuid,
  content     text,
  created_at  timestamptz,
  alias       text,
  is_mine     boolean,
  parent_id   uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uni text;
  v_conf_author uuid;
BEGIN
  IF v_uid IS NULL OR p_confession_id IS NULL THEN RETURN; END IF;
  SELECT cp.university_id INTO v_uni FROM public._confession_caller_profile() cp;
  
  SELECT c.author_id INTO v_conf_author FROM public.confessions c
  WHERE c.id = p_confession_id AND c.university_id = v_uni AND c.status = 'active';
  IF v_conf_author IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH ordered AS (
    SELECT cc.id, cc.content, cc.created_at, cc.author_id, cc.parent_id,
      (cc.author_id = v_conf_author) AS is_op,
      ROW_NUMBER() OVER (ORDER BY cc.created_at ASC) AS seq
    FROM public.confession_comments cc
    WHERE cc.confession_id = p_confession_id AND cc.status = 'active'
  ),
  anon_map AS (
    SELECT o.author_id, dense_rank() OVER (ORDER BY MIN(o.seq))::int AS anon_num
    FROM ordered o WHERE NOT o.is_op GROUP BY o.author_id
  )
  SELECT o.id, o.content, o.created_at,
    CASE WHEN o.is_op THEN 'OP' ELSE 'Anon ' || am.anon_num::text END AS alias,
    (o.author_id = v_uid)::boolean AS is_mine,
    o.parent_id
  FROM ordered o
  LEFT JOIN anon_map am ON am.author_id = o.author_id AND NOT o.is_op
  ORDER BY o.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_confession(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confessions(timestamptz, int, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confession(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_confession_comment(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confession_comments(uuid) TO authenticated;

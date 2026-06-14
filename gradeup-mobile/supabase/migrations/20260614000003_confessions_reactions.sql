-- Migration: Add Emoji Reactions to Confessions

ALTER TABLE public.confession_likes ADD COLUMN IF NOT EXISTS reaction text NOT NULL DEFAULT '❤️';

-- Drop old functions so signatures update
DROP FUNCTION IF EXISTS public.create_confession(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_confessions(timestamptz, int, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_confession(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.toggle_confession_like(uuid) CASCADE;

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
  my_reaction    text,
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

  RETURN QUERY SELECT v_row.id, v_row.content, v_row.campus, v_row.tag, v_row.created_at, v_row.like_count, v_row.comment_count, NULL::text, true::boolean;
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
  my_reaction    text,
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
    (SELECT cl.reaction FROM public.confession_likes cl WHERE cl.confession_id = c.id AND cl.user_id = v_uid LIMIT 1) AS my_reaction,
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
  my_reaction    text,
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
    (SELECT cl.reaction FROM public.confession_likes cl WHERE cl.confession_id = c.id AND cl.user_id = v_uid LIMIT 1) AS my_reaction,
    (c.author_id = v_uid)::boolean AS is_mine
  FROM public.confessions c
  WHERE c.id = p_id AND c.university_id = v_uni AND c.status = 'active';
END;
$$;

-- 4. set_confession_reaction (Replaces toggle_confession_like)
CREATE OR REPLACE FUNCTION public.set_confession_reaction(p_confession_id uuid, p_reaction text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uni text;
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT cp.university_id INTO v_uni FROM public._confession_caller_profile() cp;
  IF v_uni IS NULL OR trim(v_uni) = '' THEN RAISE EXCEPTION 'Not a student'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.confessions 
    WHERE id = p_confession_id AND university_id = v_uni AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Confession not found';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.confession_likes WHERE confession_id = p_confession_id AND user_id = v_uid) INTO v_exists;

  IF p_reaction IS NULL THEN
    IF v_exists THEN
      DELETE FROM public.confession_likes WHERE confession_id = p_confession_id AND user_id = v_uid;
      UPDATE public.confessions SET like_count = like_count - 1 WHERE id = p_confession_id;
    END IF;
  ELSE
    IF v_exists THEN
      UPDATE public.confession_likes SET reaction = p_reaction WHERE confession_id = p_confession_id AND user_id = v_uid;
    ELSE
      INSERT INTO public.confession_likes (confession_id, user_id, reaction) VALUES (p_confession_id, v_uid, p_reaction);
      UPDATE public.confessions SET like_count = like_count + 1 WHERE id = p_confession_id;
    END IF;
  END IF;
END;
$$;

-- Re-grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_confession(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confessions(timestamptz, int, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confession(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_confession_reaction(uuid, text) TO authenticated;

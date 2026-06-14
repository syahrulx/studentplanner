-- Migration: Add search to confessions

DROP FUNCTION IF EXISTS public.get_confessions(timestamptz, int, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_confessions(timestamptz, int, text, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.get_confessions(p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 20, p_campus text DEFAULT NULL, p_tag text DEFAULT NULL, p_search text DEFAULT NULL)
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
    COALESCE((
      SELECT jsonb_object_agg(reaction, count)
      FROM (
        SELECT reaction, count(*) as count 
        FROM public.confession_likes cl 
        WHERE cl.confession_id = c.id 
        GROUP BY reaction
      ) agg
    ), '{}'::jsonb) AS reaction_counts,
    (c.author_id = v_uid)::boolean AS is_mine
  FROM public.confessions c
  WHERE c.university_id = v_uni AND c.status = 'active'
    AND (p_before IS NULL OR c.created_at < p_before)
    AND (p_campus IS NULL OR c.campus = p_campus)
    AND (p_tag IS NULL OR c.tag = p_tag)
    AND (p_search IS NULL OR c.content ILIKE '%' || p_search || '%')
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships f 
      WHERE f.status = 'blocked' AND (
        (f.requester_id = v_uid AND f.addressee_id = c.author_id) OR
        (f.requester_id = c.author_id AND f.addressee_id = v_uid)
      )
    )
  ORDER BY c.created_at DESC LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_confessions(timestamptz, int, text, text, text) TO authenticated;

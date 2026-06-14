-- Migration: Confession Blocking (Apple App Store Guideline 1.2 UGC Compliance)

-- 1. Block Author by Confession ID
CREATE OR REPLACE FUNCTION public.block_confession_author(p_confession_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_author_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT author_id INTO v_author_id
  FROM public.confessions
  WHERE id = p_confession_id;

  IF v_author_id IS NOT NULL AND v_author_id != v_uid THEN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (v_uid, v_author_id, 'blocked')
    ON CONFLICT (requester_id, addressee_id) 
    DO UPDATE SET status = 'blocked';
  END IF;
END;
$$;

-- 2. Block Author by Comment ID
CREATE OR REPLACE FUNCTION public.block_confession_comment_author(p_comment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_author_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT author_id INTO v_author_id
  FROM public.confession_comments
  WHERE id = p_comment_id;

  IF v_author_id IS NOT NULL AND v_author_id != v_uid THEN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (v_uid, v_author_id, 'blocked')
    ON CONFLICT (requester_id, addressee_id) 
    DO UPDATE SET status = 'blocked';
  END IF;
END;
$$;

-- 3. Update get_confessions to filter blocked users
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

-- 4. Update get_confession_comments to filter blocked users
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
      AND NOT EXISTS (
        SELECT 1 FROM public.friendships f 
        WHERE f.status = 'blocked' AND (
          (f.requester_id = v_uid AND f.addressee_id = cc.author_id) OR
          (f.requester_id = cc.author_id AND f.addressee_id = v_uid)
        )
      )
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

GRANT EXECUTE ON FUNCTION public.block_confession_author(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_confession_comment_author(uuid) TO authenticated;

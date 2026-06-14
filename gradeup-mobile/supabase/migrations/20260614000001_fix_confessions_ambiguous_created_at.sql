-- Fix: column reference "created_at" is ambiguous in confession RPCs.
--
-- Root cause: RETURNS TABLE declares output columns (id, content, campus,
-- created_at, …) which become implicit PL/pgSQL variables. Postgres cannot
-- tell whether an unqualified "created_at" means the output variable or the
-- table column.
--
-- Fix: qualify every column reference with a table alias so there is zero
-- ambiguity. No #variable_conflict needed — just careful aliasing.

-- ─── Ensure all confession tables exist ──────────────────────────────────────
-- The original migration may have been partially applied.

CREATE TABLE IF NOT EXISTS public.confessions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id  text        NOT NULL,
  campus         text,
  content        text        NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 500),
  status         text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'flagged', 'removed')),
  like_count     int         NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count  int         NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- If the table exists but campus column is missing, add it.
ALTER TABLE public.confessions ADD COLUMN IF NOT EXISTS campus text;

CREATE INDEX IF NOT EXISTS confessions_uni_feed_idx
  ON public.confessions (university_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS confessions_campus_feed_idx
  ON public.confessions (university_id, campus, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.confession_likes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  confession_id  uuid        NOT NULL REFERENCES public.confessions(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (confession_id, user_id)
);
CREATE INDEX IF NOT EXISTS confession_likes_user_idx
  ON public.confession_likes (user_id);

CREATE TABLE IF NOT EXISTS public.confession_comments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  confession_id  uuid        NOT NULL REFERENCES public.confessions(id) ON DELETE CASCADE,
  author_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content        text        NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 300),
  status         text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'flagged', 'removed')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS confession_comments_confession_idx
  ON public.confession_comments (confession_id, status, created_at ASC);

CREATE TABLE IF NOT EXISTS public.confession_reports (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  confession_id  uuid        NOT NULL REFERENCES public.confessions(id) ON DELETE CASCADE,
  comment_id     uuid        REFERENCES public.confession_comments(id) ON DELETE CASCADE,
  reporter_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason         text        NOT NULL DEFAULT 'inappropriate',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS confession_reports_unique_confession
  ON public.confession_reports (confession_id, reporter_id)
  WHERE comment_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS confession_reports_unique_comment
  ON public.confession_reports (comment_id, reporter_id)
  WHERE comment_id IS NOT NULL;

-- ─── Content moderation trigger ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_confession_content()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_text text;
  v_banned text[] := array[
    'onlyfans', 'only fans', 'escort', 'prostitut', 'hookup',
    'sugar daddy', 'sugar baby', 'porn', 'xxx', 'nude', 'nudes',
    'cocaine', 'meth', 'syabu', 'dadah',
    'write my exam', 'take my exam', 'fake degree'
  ];
  v_word text;
BEGIN
  v_text := lower(trim(coalesce(NEW.content, '')));
  FOREACH v_word IN ARRAY v_banned LOOP
    IF v_text LIKE '%' || v_word || '%' THEN
      RAISE EXCEPTION 'This content violates our community guidelines.'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_confession_content ON public.confessions;
CREATE TRIGGER trg_check_confession_content
  BEFORE INSERT OR UPDATE OF content ON public.confessions
  FOR EACH ROW EXECUTE FUNCTION public.check_confession_content();

DROP TRIGGER IF EXISTS trg_check_confession_comment_content ON public.confession_comments;
CREATE TRIGGER trg_check_confession_comment_content
  BEFORE INSERT OR UPDATE OF content ON public.confession_comments
  FOR EACH ROW EXECUTE FUNCTION public.check_confession_content();

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.confessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confession_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confession_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confession_reports ENABLE ROW LEVEL SECURITY;

-- Reports: users can insert for their university
REVOKE ALL ON public.confessions FROM authenticated;
REVOKE ALL ON public.confession_likes FROM authenticated;
REVOKE ALL ON public.confession_comments FROM authenticated;
REVOKE ALL ON public.confession_reports FROM authenticated;
GRANT INSERT ON public.confession_reports TO authenticated;

-- Drop existing functions first — Postgres won't let CREATE OR REPLACE change
-- the return type of an existing function. CASCADE removes dependent grants.
DROP FUNCTION IF EXISTS public.create_confession(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_confessions(timestamptz, int, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_confessions(timestamptz, int) CASCADE;
DROP FUNCTION IF EXISTS public.get_confession(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.add_confession_comment(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_confession_comments(uuid) CASCADE;
DROP FUNCTION IF EXISTS public._confession_assert_can_post() CASCADE;
DROP FUNCTION IF EXISTS public._confession_caller_profile() CASCADE;

-- ─── Ensure helper functions exist with correct signatures ──────────────────

CREATE OR REPLACE FUNCTION public._confession_caller_profile()
RETURNS TABLE (
  user_id        uuid,
  university_id  text,
  campus         text,
  status         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.university_id, nullif(trim(coalesce(p.campus, '')), ''), coalesce(p.status, 'active')
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public._confession_assert_can_post(
  OUT out_uni    text,
  OUT out_campus text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT cp.university_id, cp.campus, cp.status
  INTO out_uni, out_campus, v_status
  FROM public._confession_caller_profile() cp;

  IF out_uni IS NULL OR trim(out_uni) = '' THEN
    RAISE EXCEPTION 'Connect your university in Profile before posting confessions.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Your account cannot post right now.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ─── Re-create create_confession ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_confession(p_content text)
RETURNS TABLE (
  id             uuid,
  content        text,
  campus         text,
  created_at     timestamptz,
  like_count     int,
  comment_count  int,
  liked_by_me    boolean,
  is_mine        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_uni    text;
  v_campus text;
  v_trimmed text;
  v_recent int;
  v_row public.confessions%ROWTYPE;
BEGIN
  SELECT out_uni, out_campus
  INTO v_uni, v_campus
  FROM public._confession_assert_can_post();

  v_trimmed := trim(coalesce(p_content, ''));

  IF char_length(v_trimmed) < 1 OR char_length(v_trimmed) > 500 THEN
    RAISE EXCEPTION 'Confession must be between 1 and 500 characters.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)::int INTO v_recent
  FROM public.confessions cr
  WHERE cr.author_id = v_uid
    AND cr.created_at > now() - interval '24 hours';

  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'You can post at most 5 confessions per 24 hours.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.confessions (author_id, university_id, campus, content)
  VALUES (v_uid, v_uni, v_campus, v_trimmed)
  RETURNING * INTO v_row;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.content,
    v_row.campus,
    v_row.created_at,
    v_row.like_count,
    v_row.comment_count,
    false::boolean,
    true::boolean;
END;
$$;

-- ─── Re-create get_confessions ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_confessions(
  p_before timestamptz DEFAULT NULL,
  p_limit  int         DEFAULT 20,
  p_campus text        DEFAULT NULL
)
RETURNS TABLE (
  id             uuid,
  content        text,
  campus         text,
  created_at     timestamptz,
  like_count     int,
  comment_count  int,
  liked_by_me    boolean,
  is_mine        boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_uni   text;
  v_limit int  := greatest(1, least(coalesce(p_limit, 20), 50));
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT cp.university_id INTO v_uni
  FROM public._confession_caller_profile() cp;

  IF v_uni IS NULL OR trim(v_uni) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.campus,
    c.created_at,
    c.like_count,
    c.comment_count,
    EXISTS (
      SELECT 1 FROM public.confession_likes cl
      WHERE cl.confession_id = c.id AND cl.user_id = v_uid
    )::boolean AS liked_by_me,
    (c.author_id = v_uid)::boolean AS is_mine
  FROM public.confessions c
  WHERE c.university_id = v_uni
    AND c.status = 'active'
    AND (p_before IS NULL OR c.created_at < p_before)
    AND (p_campus IS NULL OR c.campus = p_campus)
  ORDER BY c.created_at DESC
  LIMIT v_limit;
END;
$$;

-- ─── Re-create get_confession ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_confession(p_id uuid)
RETURNS TABLE (
  id             uuid,
  content        text,
  campus         text,
  created_at     timestamptz,
  like_count     int,
  comment_count  int,
  liked_by_me    boolean,
  is_mine        boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uni text;
BEGIN
  IF v_uid IS NULL OR p_id IS NULL THEN
    RETURN;
  END IF;

  SELECT cp.university_id INTO v_uni
  FROM public._confession_caller_profile() cp;

  IF v_uni IS NULL OR trim(v_uni) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.content,
    c.campus,
    c.created_at,
    c.like_count,
    c.comment_count,
    EXISTS (
      SELECT 1 FROM public.confession_likes cl
      WHERE cl.confession_id = c.id AND cl.user_id = v_uid
    )::boolean AS liked_by_me,
    (c.author_id = v_uid)::boolean AS is_mine
  FROM public.confessions c
  WHERE c.id = p_id
    AND c.university_id = v_uni
    AND c.status = 'active';
END;
$$;

-- ─── Re-create add_confession_comment ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_confession_comment(
  p_confession_id uuid,
  p_content text
)
RETURNS TABLE (
  id          uuid,
  content     text,
  created_at  timestamptz,
  alias       text,
  is_mine     boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE EXCEPTION 'Comment must be between 1 and 300 characters.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT c.author_id INTO v_conf_author
  FROM public.confessions c
  WHERE c.id = p_confession_id
    AND c.university_id = v_uni
    AND c.status = 'active';

  IF v_conf_author IS NULL THEN
    RAISE EXCEPTION 'Confession not found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)::int INTO v_recent
  FROM public.confession_comments cc
  WHERE cc.author_id = v_uid
    AND cc.created_at > now() - interval '24 hours';

  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'You can post at most 30 comments per 24 hours.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.confession_comments (confession_id, author_id, content)
  VALUES (p_confession_id, v_uid, v_trimmed)
  RETURNING * INTO v_row;

  UPDATE public.confessions c
  SET comment_count = c.comment_count + 1
  WHERE c.id = p_confession_id;

  IF v_conf_author = v_uid THEN
    v_alias := 'OP';
  ELSE
    SELECT 'Anon ' || COALESCE((
      SELECT am.anon_num::text
      FROM (
        SELECT
          cc2.author_id,
          dense_rank() OVER (ORDER BY MIN(cc2.created_at))::int AS anon_num
        FROM public.confession_comments cc2
        WHERE cc2.confession_id = p_confession_id
          AND cc2.status = 'active'
          AND cc2.author_id <> v_conf_author
        GROUP BY cc2.author_id
      ) am
      WHERE am.author_id = v_uid
    ), '1') INTO v_alias;
  END IF;

  RETURN QUERY
  SELECT v_row.id, v_row.content, v_row.created_at, v_alias, true::boolean;
END;
$$;

-- ─── Re-create get_confession_comments ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_confession_comments(p_confession_id uuid)
RETURNS TABLE (
  id          uuid,
  content     text,
  created_at  timestamptz,
  alias       text,
  is_mine     boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uni text;
  v_conf_author uuid;
BEGIN
  IF v_uid IS NULL OR p_confession_id IS NULL THEN
    RETURN;
  END IF;

  SELECT cp.university_id INTO v_uni
  FROM public._confession_caller_profile() cp;

  SELECT c.author_id INTO v_conf_author
  FROM public.confessions c
  WHERE c.id = p_confession_id
    AND c.university_id = v_uni
    AND c.status = 'active';

  IF v_conf_author IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ordered AS (
    SELECT
      cc.id,
      cc.content,
      cc.created_at,
      cc.author_id,
      (cc.author_id = v_conf_author) AS is_op,
      ROW_NUMBER() OVER (ORDER BY cc.created_at ASC) AS seq
    FROM public.confession_comments cc
    WHERE cc.confession_id = p_confession_id
      AND cc.status = 'active'
  ),
  anon_map AS (
    SELECT
      o.author_id,
      dense_rank() OVER (ORDER BY MIN(o.seq))::int AS anon_num
    FROM ordered o
    WHERE NOT o.is_op
    GROUP BY o.author_id
  )
  SELECT
    o.id,
    o.content,
    o.created_at,
    CASE
      WHEN o.is_op THEN 'OP'
      ELSE 'Anon ' || am.anon_num::text
    END AS alias,
    (o.author_id = v_uid)::boolean AS is_mine
  FROM ordered o
  LEFT JOIN anon_map am ON am.author_id = o.author_id AND NOT o.is_op
  ORDER BY o.created_at ASC;
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.create_confession(text)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confessions(timestamptz, int, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confession(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_confession_like(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_confession_comment(uuid, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confession_comments(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_confession(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_confession_comment(uuid)            TO authenticated;

-- ============================================================
-- Campus Rooms: faculty scoping
--   A faculty floor directory is faculty-specific: the same room
--   code (e.g. "DK1") can exist in different faculties on the same
--   campus. We tag every room with the contributor's faculty (from
--   their profile), make uniqueness faculty-aware, and let the
--   directory be filtered by faculty.
-- ============================================================

ALTER TABLE public.campus_rooms
  ADD COLUMN IF NOT EXISTS faculty text
    CHECK (faculty IS NULL OR char_length(faculty) <= 160);

-- Uniqueness is now per (university, campus, faculty, room code).
DROP INDEX IF EXISTS public.campus_rooms_unique_code;
CREATE UNIQUE INDEX IF NOT EXISTS campus_rooms_unique_code
  ON public.campus_rooms (university_id, coalesce(campus, ''), coalesce(faculty, ''), room_code_norm)
  WHERE status <> 'removed';

CREATE INDEX IF NOT EXISTS campus_rooms_faculty_idx
  ON public.campus_rooms (university_id, campus, faculty, status);

-- ─── Internal helper: caller scope (uni + campus + faculty) ───
-- OUT params changed, so the old function must be dropped first.
DROP FUNCTION IF EXISTS public._campus_room_assert_scope();

CREATE OR REPLACE FUNCTION public._campus_room_assert_scope(
  OUT out_uni     text,
  OUT out_campus  text,
  OUT out_faculty text
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

  SELECT p.university_id,
         nullif(trim(coalesce(p.campus, '')), ''),
         -- A real faculty never contains '@'. Some profiles have an email in
         -- this column; treat that as "no faculty" so rooms aren't mis-tagged.
         CASE WHEN position('@' in coalesce(p.faculty, '')) > 0 THEN NULL
              ELSE nullif(trim(coalesce(p.faculty, '')), '') END,
         coalesce(p.status, 'active')
  INTO out_uni, out_campus, out_faculty, v_status
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF out_uni IS NULL OR trim(out_uni) = '' THEN
    RAISE EXCEPTION 'Connect your university in Profile before adding room locations.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Your account cannot contribute right now.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ─── RPC: get_campus_rooms (now returns + filters by faculty) ─
DROP FUNCTION IF EXISTS public.get_campus_rooms(text, text);

CREATE OR REPLACE FUNCTION public.get_campus_rooms(
  p_campus  text DEFAULT NULL,
  p_search  text DEFAULT NULL,
  p_faculty text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  room_code       text,
  room_label      text,
  building        text,
  level           text,
  description     text,
  campus          text,
  faculty         text,
  source          text,
  source_file_url text,
  upvote_count    int,
  downvote_count  int,
  verified        boolean,
  my_vote         int,
  is_mine         boolean,
  created_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uni text;
  v_q   text := nullif(trim(coalesce(p_search, '')), '');
  v_fac text := nullif(trim(coalesce(p_faculty, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT p.university_id INTO v_uni
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_uni IS NULL OR trim(v_uni) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.room_code,
    r.room_label,
    r.building,
    r.level,
    r.description,
    r.campus,
    r.faculty,
    r.source,
    r.source_file_url,
    r.upvote_count,
    r.downvote_count,
    r.verified,
    coalesce((SELECT v.vote FROM public.campus_room_votes v
              WHERE v.room_id = r.id AND v.user_id = v_uid), 0)::int AS my_vote,
    (r.created_by = v_uid) AS is_mine,
    r.created_at
  FROM public.campus_rooms r
  WHERE r.university_id = v_uni
    AND r.status = 'active'
    AND (p_campus IS NULL OR r.campus = p_campus)
    AND (v_fac IS NULL OR r.faculty = v_fac)
    AND (
      v_q IS NULL
      OR r.room_code ILIKE '%' || v_q || '%'
      OR coalesce(r.room_label, '') ILIKE '%' || v_q || '%'
      OR coalesce(r.building, '')  ILIKE '%' || v_q || '%'
      OR coalesce(r.level, '')     ILIKE '%' || v_q || '%'
      OR coalesce(r.faculty, '')   ILIKE '%' || v_q || '%'
    )
  ORDER BY r.verified DESC, (r.upvote_count - r.downvote_count) DESC,
           r.faculty NULLS LAST, r.building NULLS LAST, r.level NULLS LAST, r.room_code
  LIMIT 500;
END;
$$;

-- ─── RPC: match_room (prefer caller faculty, return faculty) ──
DROP FUNCTION IF EXISTS public.match_room(text);

CREATE OR REPLACE FUNCTION public.match_room(p_room_text text)
RETURNS TABLE (
  id              uuid,
  room_code       text,
  room_label      text,
  building        text,
  level           text,
  description     text,
  campus          text,
  faculty         text,
  verified        boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_uni     text;
  v_campus  text;
  v_faculty text;
  v_norm    text := public._norm_room(p_room_text);
BEGIN
  IF v_uid IS NULL OR v_norm = '' THEN
    RETURN;
  END IF;

  SELECT p.university_id,
         nullif(trim(coalesce(p.campus, '')), ''),
         CASE WHEN position('@' in coalesce(p.faculty, '')) > 0 THEN NULL
              ELSE nullif(trim(coalesce(p.faculty, '')), '') END
  INTO v_uni, v_campus, v_faculty
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_uni IS NULL OR trim(v_uni) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, r.room_code, r.room_label, r.building, r.level, r.description, r.campus, r.faculty, r.verified
  FROM public.campus_rooms r
  WHERE r.university_id = v_uni
    AND r.status = 'active'
    -- Prefer the caller's campus, but fall back to uni-wide if none on campus
    AND (v_campus IS NULL OR r.campus = v_campus OR r.campus IS NULL)
    AND (
      r.room_code_norm = v_norm
      OR v_norm = ANY (r.aliases)
      OR r.room_code_norm LIKE v_norm || '%'
      OR v_norm LIKE r.room_code_norm || '%'
    )
  ORDER BY
    (r.room_code_norm = v_norm) DESC,                  -- exact match first
    (v_norm = ANY (r.aliases)) DESC,                   -- alias exact
    (r.faculty IS NOT DISTINCT FROM v_faculty) DESC,   -- same faculty
    (r.campus IS NOT DISTINCT FROM v_campus) DESC,     -- same campus
    r.verified DESC,
    (r.upvote_count - r.downvote_count) DESC,
    abs(char_length(r.room_code_norm) - char_length(v_norm))  -- closest length
  LIMIT 1;
END;
$$;

-- ─── RPC: upsert_campus_rooms (tag + scope by faculty) ────────

CREATE OR REPLACE FUNCTION public.upsert_campus_rooms(
  p_rows  jsonb,
  p_source text DEFAULT 'pdf',
  p_source_file_url text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_uni     text;
  v_campus  text;
  v_faculty text;
  v_source  text := lower(coalesce(p_source, 'pdf'));
  v_recent  int;
  v_saved   int := 0;
  v_row     jsonb;
  v_code    text;
  v_norm    text;
  v_label   text;
  v_building text;
  v_level   text;
  v_desc    text;
  v_existing uuid;
  v_existing_owner uuid;
BEGIN
  SELECT out_uni, out_campus, out_faculty INTO v_uni, v_campus, v_faculty
  FROM public._campus_room_assert_scope();

  IF v_source NOT IN ('pdf', 'photo', 'manual') THEN
    v_source := 'manual';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Invalid rows payload.' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_array_length(p_rows) > 300 THEN
    RAISE EXCEPTION 'Too many rooms in one upload (max 300).' USING ERRCODE = 'P0001';
  END IF;

  -- Rate limit: max 600 room upserts per 24h per user
  SELECT COUNT(*)::int INTO v_recent
  FROM public.campus_rooms
  WHERE created_by = v_uid
    AND created_at > now() - interval '24 hours';
  IF v_recent >= 600 THEN
    RAISE EXCEPTION 'Daily contribution limit reached. Try again later.' USING ERRCODE = 'P0001';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_code := trim(coalesce(v_row->>'room_code', ''));
    v_norm := public._norm_room(v_code);
    IF v_norm = '' THEN
      CONTINUE;  -- skip rows with no usable code
    END IF;

    v_label    := nullif(trim(coalesce(v_row->>'room_label', '')), '');
    v_building := nullif(trim(coalesce(v_row->>'building', '')), '');
    v_level    := nullif(trim(coalesce(v_row->>'level', '')), '');
    v_desc     := nullif(trim(coalesce(v_row->>'description', '')), '');

    -- Look for an existing non-removed room with same code in this scope
    -- (university + campus + faculty).
    SELECT id, created_by INTO v_existing, v_existing_owner
    FROM public.campus_rooms
    WHERE university_id = v_uni
      AND coalesce(campus, '') = coalesce(v_campus, '')
      AND coalesce(faculty, '') = coalesce(v_faculty, '')
      AND room_code_norm = v_norm
      AND status <> 'removed'
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.campus_rooms (
        created_by, university_id, campus, faculty, room_code, room_code_norm,
        room_label, building, level, description, source, source_file_url
      ) VALUES (
        v_uid, v_uni, v_campus, v_faculty, left(v_code, 60), v_norm,
        v_label, v_building, v_level, v_desc, v_source, p_source_file_url
      );
      v_saved := v_saved + 1;
    ELSIF v_existing_owner = v_uid THEN
      -- Owner re-uploading: refresh their own entry
      UPDATE public.campus_rooms
      SET room_label = coalesce(v_label, room_label),
          building   = coalesce(v_building, building),
          level      = coalesce(v_level, level),
          description = coalesce(v_desc, description),
          source     = v_source,
          source_file_url = coalesce(p_source_file_url, source_file_url),
          updated_at = now()
      WHERE id = v_existing;
      v_saved := v_saved + 1;
    END IF;
    -- else: someone else already added this room; leave it (voting handles quality)
  END LOOP;

  RETURN v_saved;
END;
$$;

-- ─── RPC: create_campus_room (tag + scope by faculty) ─────────

CREATE OR REPLACE FUNCTION public.create_campus_room(
  p_room_code text,
  p_room_label text DEFAULT NULL,
  p_building text DEFAULT NULL,
  p_level text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_source_file_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_uni     text;
  v_campus  text;
  v_faculty text;
  v_code    text := trim(coalesce(p_room_code, ''));
  v_norm    text;
  v_existing uuid;
  v_id      uuid;
BEGIN
  SELECT out_uni, out_campus, out_faculty INTO v_uni, v_campus, v_faculty
  FROM public._campus_room_assert_scope();

  v_norm := public._norm_room(v_code);
  IF v_norm = '' THEN
    RAISE EXCEPTION 'Room code is required.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_existing
  FROM public.campus_rooms
  WHERE university_id = v_uni
    AND coalesce(campus, '') = coalesce(v_campus, '')
    AND coalesce(faculty, '') = coalesce(v_faculty, '')
    AND room_code_norm = v_norm
    AND status <> 'removed'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'This room is already on the map.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.campus_rooms (
    created_by, university_id, campus, faculty, room_code, room_code_norm,
    room_label, building, level, description, source, source_file_url
  ) VALUES (
    v_uid, v_uni, v_campus, v_faculty, left(v_code, 60), v_norm,
    nullif(trim(coalesce(p_room_label, '')), ''),
    nullif(trim(coalesce(p_building, '')), ''),
    nullif(trim(coalesce(p_level, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    'manual', p_source_file_url
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── Grants (new get_campus_rooms signature) ──────────────────
GRANT EXECUTE ON FUNCTION public.get_campus_rooms(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_room(text)                   TO authenticated;

-- Fix campus rooms missing when filtering due to case-sensitivity

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
    AND (p_campus IS NULL OR r.campus ILIKE p_campus)
    AND (v_fac IS NULL OR r.faculty ILIKE v_fac)
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
  verified        boolean,
  source          text,
  source_file_url text
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
  SELECT
    r.id,
    r.room_code,
    r.room_label,
    r.building,
    r.level,
    r.description,
    r.campus,
    r.faculty,
    r.verified,
    r.source,
    r.source_file_url
  FROM public.campus_rooms r
  WHERE r.university_id = v_uni
    AND r.status = 'active'
    AND (v_campus IS NULL OR r.campus ILIKE v_campus OR r.campus IS NULL)
    AND (
      r.room_code_norm = v_norm
      OR v_norm = ANY (r.aliases)
      OR r.room_code_norm LIKE v_norm || '%'
      OR v_norm LIKE r.room_code_norm || '%'
    )
  ORDER BY
    (r.room_code_norm = v_norm) DESC,
    (v_norm = ANY (r.aliases)) DESC,
    (r.faculty ILIKE v_faculty) DESC,
    (r.campus ILIKE v_campus) DESC,
    r.verified DESC,
    (r.upvote_count - r.downvote_count) DESC,
    abs(char_length(r.room_code_norm) - char_length(v_norm))
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_campus_rooms(
  p_rows  jsonb,
  p_source text DEFAULT 'pdf',
  p_source_file_url text DEFAULT NULL,
  p_faculty text DEFAULT NULL
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
  v_pfac    text;
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
  SELECT out_uni, out_campus, out_faculty INTO v_uni, v_campus, v_pfac
  FROM public._campus_room_assert_scope();

  v_faculty := public._resolve_campus_faculty(v_uid, v_uni, v_campus, p_faculty, v_pfac);

  IF v_faculty IS NULL OR trim(v_faculty) = '' THEN
    RAISE EXCEPTION 'Select a faculty before adding room locations.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_source NOT IN ('pdf', 'photo', 'manual') THEN
    v_source := 'manual';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Invalid rows payload.' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_array_length(p_rows) > 300 THEN
    RAISE EXCEPTION 'Too many rooms in one upload (max 300).' USING ERRCODE = 'P0001';
  END IF;

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
      CONTINUE;
    END IF;

    v_label    := nullif(trim(coalesce(v_row->>'room_label', '')), '');
    v_building := nullif(trim(coalesce(v_row->>'building', '')), '');
    v_level    := nullif(trim(coalesce(v_row->>'level', '')), '');
    v_desc     := nullif(trim(coalesce(v_row->>'description', '')), '');

    SELECT id, created_by INTO v_existing, v_existing_owner
    FROM public.campus_rooms
    WHERE university_id = v_uni
      AND coalesce(campus, '') ILIKE coalesce(v_campus, '')
      AND coalesce(faculty, '') ILIKE coalesce(v_faculty, '')
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
  END LOOP;

  RETURN v_saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_campus_room(
  p_room_code text,
  p_room_label text DEFAULT NULL,
  p_building text DEFAULT NULL,
  p_level text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_source_file_url text DEFAULT NULL,
  p_faculty text DEFAULT NULL
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
  v_pfac    text;
  v_faculty text;
  v_code    text := trim(coalesce(p_room_code, ''));
  v_norm    text;
  v_existing uuid;
  v_id      uuid;
BEGIN
  SELECT out_uni, out_campus, out_faculty INTO v_uni, v_campus, v_pfac
  FROM public._campus_room_assert_scope();

  v_faculty := public._resolve_campus_faculty(v_uid, v_uni, v_campus, p_faculty, v_pfac);

  IF v_faculty IS NULL OR trim(v_faculty) = '' THEN
    RAISE EXCEPTION 'Select a faculty before adding room locations.'
      USING ERRCODE = 'P0001';
  END IF;

  v_norm := public._norm_room(v_code);
  IF v_norm = '' THEN
    RAISE EXCEPTION 'Room code is required.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_existing
  FROM public.campus_rooms
  WHERE university_id = v_uni
    AND coalesce(campus, '') ILIKE coalesce(v_campus, '')
    AND coalesce(faculty, '') ILIKE coalesce(v_faculty, '')
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

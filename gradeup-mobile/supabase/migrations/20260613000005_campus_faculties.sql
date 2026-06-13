-- ============================================================
-- Campus Faculties: per-campus faculty registry
--   Faculties are registered per (university, campus). When a user
--   adds room locations they pick a faculty from a dropdown of the
--   faculties registered for their campus, or add a new one (which
--   is then visible to everyone else at that campus).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.campus_faculties (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id text        NOT NULL,
  campus        text,
  name          text        NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 160),
  name_norm     text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One faculty per normalized name per (university, campus).
CREATE UNIQUE INDEX IF NOT EXISTS campus_faculties_unique
  ON public.campus_faculties (university_id, coalesce(campus, ''), name_norm);

CREATE INDEX IF NOT EXISTS campus_faculties_lookup_idx
  ON public.campus_faculties (university_id, campus, name);

ALTER TABLE public.campus_faculties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campus_faculties_admin_all ON public.campus_faculties;
CREATE POLICY campus_faculties_admin_all ON public.campus_faculties
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON public.campus_faculties FROM authenticated;

-- ─── RPC: get_campus_faculties ────────────────────────────────
-- Faculties registered for the caller's university and the given
-- campus (campus-specific + uni-wide), unioned with any faculties
-- already used on existing rooms so nothing is missed.

CREATE OR REPLACE FUNCTION public.get_campus_faculties(p_campus text DEFAULT NULL)
RETURNS TABLE (name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uni text;
  v_campus text := nullif(trim(coalesce(p_campus, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT p.university_id INTO v_uni
  FROM public.profiles p WHERE p.id = v_uid;

  IF v_uni IS NULL OR trim(v_uni) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT f.name
  FROM (
    SELECT cf.name, cf.campus
    FROM public.campus_faculties cf
    WHERE cf.university_id = v_uni
    UNION
    SELECT cr.faculty AS name, cr.campus
    FROM public.campus_rooms cr
    WHERE cr.university_id = v_uni
      AND cr.status = 'active'
      AND cr.faculty IS NOT NULL
      AND trim(cr.faculty) <> ''
  ) f
  WHERE f.name IS NOT NULL
    AND trim(f.name) <> ''
    AND (v_campus IS NULL OR f.campus IS NULL OR f.campus = v_campus)
  ORDER BY f.name;
END;
$$;

-- ─── RPC: add_campus_faculty ──────────────────────────────────
-- Register a faculty under the caller's university + campus. Returns
-- the canonical stored name (existing one on conflict). Email-like
-- values are rejected.

CREATE OR REPLACE FUNCTION public.add_campus_faculty(
  p_name   text,
  p_campus text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_uni    text;
  v_campus text;
  v_name   text := trim(coalesce(p_name, ''));
  v_norm   text;
  v_recent int;
  v_out    text;
BEGIN
  SELECT out_uni, out_campus INTO v_uni, v_campus
  FROM public._campus_room_assert_scope();

  -- Allow the caller to pass an explicit campus (e.g. when adding for the
  -- campus they're viewing); otherwise fall back to their profile campus.
  v_campus := coalesce(nullif(trim(coalesce(p_campus, '')), ''), v_campus);

  IF v_name = '' OR char_length(v_name) > 160 THEN
    RAISE EXCEPTION 'Enter a valid faculty name.' USING ERRCODE = 'P0001';
  END IF;
  IF position('@' in v_name) > 0 THEN
    RAISE EXCEPTION 'That does not look like a faculty name.' USING ERRCODE = 'P0001';
  END IF;

  v_norm := public._norm_room(v_name);
  IF v_norm = '' THEN
    RAISE EXCEPTION 'Enter a valid faculty name.' USING ERRCODE = 'P0001';
  END IF;

  -- Rate limit: max 30 new faculties per day per user
  SELECT COUNT(*)::int INTO v_recent
  FROM public.campus_faculties
  WHERE created_by = v_uid
    AND created_at > now() - interval '24 hours';
  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'Too many new faculties added today. Try again later.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.campus_faculties (created_by, university_id, campus, name, name_norm)
  VALUES (v_uid, v_uni, v_campus, v_name, v_norm)
  ON CONFLICT (university_id, coalesce(campus, ''), name_norm) DO NOTHING;

  SELECT name INTO v_out
  FROM public.campus_faculties
  WHERE university_id = v_uni
    AND coalesce(campus, '') = coalesce(v_campus, '')
    AND name_norm = v_norm
  LIMIT 1;

  RETURN coalesce(v_out, v_name);
END;
$$;

-- ─── Helper: resolve + register a faculty for the save RPCs ───
-- Returns a sanitized faculty (param wins, else profile faculty) and
-- registers it in campus_faculties so it shows up in the dropdown.

CREATE OR REPLACE FUNCTION public._resolve_campus_faculty(
  p_uid     uuid,
  p_uni     text,
  p_campus  text,
  p_param   text,
  p_profile text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fac  text := nullif(trim(coalesce(p_param, '')), '');
BEGIN
  -- Email-like values are not faculties.
  IF v_fac IS NOT NULL AND position('@' in v_fac) > 0 THEN
    v_fac := NULL;
  END IF;

  -- Fall back to the (already sanitized) profile faculty.
  IF v_fac IS NULL THEN
    v_fac := p_profile;
  END IF;

  IF v_fac IS NULL OR trim(v_fac) = '' THEN
    RETURN NULL;
  END IF;

  v_fac := left(trim(v_fac), 160);

  INSERT INTO public.campus_faculties (created_by, university_id, campus, name, name_norm)
  VALUES (p_uid, p_uni, p_campus, v_fac, public._norm_room(v_fac))
  ON CONFLICT (university_id, coalesce(campus, ''), name_norm) DO NOTHING;

  RETURN v_fac;
END;
$$;

-- ─── RPC: upsert_campus_rooms (now takes an explicit faculty) ─
DROP FUNCTION IF EXISTS public.upsert_campus_rooms(jsonb, text, text);

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

-- ─── RPC: create_campus_room (now takes an explicit faculty) ──
DROP FUNCTION IF EXISTS public.create_campus_room(text, text, text, text, text, text);

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

-- ─── Grants ───────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_campus_faculties(text)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_campus_faculty(text, text)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_campus_rooms(jsonb, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_campus_room(text, text, text, text, text, text, text) TO authenticated;

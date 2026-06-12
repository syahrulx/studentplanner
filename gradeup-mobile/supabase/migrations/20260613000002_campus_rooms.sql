-- ============================================================
-- Campus Rooms: crowdsourced faculty/classroom location directory
--   Students upload a faculty floor directory (PDF/photo); AI
--   extracts rooms; everyone at the same university + campus can
--   find where a class is held (building / floor / description).
--   Clients read/write via SECURITY DEFINER RPCs only.
-- ============================================================

-- ─── Normalization helper (matching key) ──────────────────────
-- Uppercase + strip everything that is not A-Z / 0-9 so "Bilik DK 1",
-- "DK-1" and "dk1" all match the same room.
CREATE OR REPLACE FUNCTION public._norm_room(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g');
$$;

-- ─── Tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campus_rooms (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id   text        NOT NULL,
  campus          text,
  -- Display code as printed (e.g. "DK1", "Bilik BK2-3")
  room_code       text        NOT NULL CHECK (char_length(trim(room_code)) BETWEEN 1 AND 60),
  -- Normalized matching key (derived from room_code; stored for indexing)
  room_code_norm  text        NOT NULL,
  -- Friendly label, e.g. "Dewan Kuliah 1"
  room_label      text        CHECK (room_label IS NULL OR char_length(room_label) <= 120),
  building        text        CHECK (building  IS NULL OR char_length(building)  <= 120),
  level           text        CHECK (level     IS NULL OR char_length(level)     <= 80),
  description     text        CHECK (description IS NULL OR char_length(description) <= 400),
  -- Extra normalized keys for fuzzy matching (alternative codes/names)
  aliases         text[]      NOT NULL DEFAULT '{}',
  source          text        NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('pdf', 'photo', 'manual')),
  source_file_url text,
  status          text        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'flagged', 'removed')),
  upvote_count    int         NOT NULL DEFAULT 0 CHECK (upvote_count >= 0),
  downvote_count  int         NOT NULL DEFAULT 0 CHECK (downvote_count >= 0),
  verified        boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One active/flagged room per code per (university, campus). Removed rows
-- are excluded so a deleted code can be re-added later.
CREATE UNIQUE INDEX IF NOT EXISTS campus_rooms_unique_code
  ON public.campus_rooms (university_id, coalesce(campus, ''), room_code_norm)
  WHERE status <> 'removed';

CREATE INDEX IF NOT EXISTS campus_rooms_feed_idx
  ON public.campus_rooms (university_id, campus, status, building);

CREATE INDEX IF NOT EXISTS campus_rooms_match_idx
  ON public.campus_rooms (university_id, coalesce(campus, ''), room_code_norm)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.campus_room_votes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid        NOT NULL REFERENCES public.campus_rooms(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote        smallint    NOT NULL CHECK (vote IN (-1, 1)),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.campus_room_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid        NOT NULL REFERENCES public.campus_rooms(id) ON DELETE CASCADE,
  reporter_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      text        NOT NULL DEFAULT 'incorrect',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, reporter_id)
);

-- ─── Auto-flag on reports (≥5 reports) ────────────────────────

CREATE OR REPLACE FUNCTION public.auto_flag_reported_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.campus_room_reports
  WHERE room_id = NEW.room_id;

  IF v_count >= 5 THEN
    UPDATE public.campus_rooms
    SET status = 'flagged', updated_at = now()
    WHERE id = NEW.room_id
      AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_flag_reported_room ON public.campus_room_reports;
CREATE TRIGGER trg_auto_flag_reported_room
  AFTER INSERT ON public.campus_room_reports
  FOR EACH ROW EXECUTE FUNCTION public.auto_flag_reported_room();

-- ─── RLS: base tables locked down for clients ─────────────────

ALTER TABLE public.campus_rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_room_votes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_room_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campus_rooms_admin_all ON public.campus_rooms;
CREATE POLICY campus_rooms_admin_all ON public.campus_rooms
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campus_room_votes_admin_all ON public.campus_room_votes;
CREATE POLICY campus_room_votes_admin_all ON public.campus_room_votes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS campus_room_reports_admin_select ON public.campus_room_reports;
CREATE POLICY campus_room_reports_admin_select ON public.campus_room_reports
  FOR SELECT USING (public.is_admin());

-- Users may insert reports for rooms in their own university
DROP POLICY IF EXISTS campus_room_reports_insert ON public.campus_room_reports;
CREATE POLICY campus_room_reports_insert ON public.campus_room_reports
  FOR INSERT WITH CHECK (
    auth.uid() = reporter_id
    AND EXISTS (
      SELECT 1
      FROM public.campus_rooms r
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE r.id = room_id
        AND p.university_id IS NOT NULL
        AND r.university_id = p.university_id
        AND r.status = 'active'
    )
  );

REVOKE ALL ON public.campus_rooms        FROM authenticated;
REVOKE ALL ON public.campus_room_votes   FROM authenticated;
REVOKE ALL ON public.campus_room_reports FROM authenticated;
GRANT INSERT ON public.campus_room_reports TO authenticated;

-- ─── Internal helper: caller scope (uni + campus) ─────────────

CREATE OR REPLACE FUNCTION public._campus_room_assert_scope(
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

  SELECT p.university_id,
         nullif(trim(coalesce(p.campus, '')), ''),
         coalesce(p.status, 'active')
  INTO out_uni, out_campus, v_status
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

-- ─── RPC: get_campus_rooms ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campus_rooms(
  p_campus text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  room_code       text,
  room_label      text,
  building        text,
  level           text,
  description     text,
  campus          text,
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
    AND (
      v_q IS NULL
      OR r.room_code ILIKE '%' || v_q || '%'
      OR coalesce(r.room_label, '') ILIKE '%' || v_q || '%'
      OR coalesce(r.building, '')  ILIKE '%' || v_q || '%'
      OR coalesce(r.level, '')     ILIKE '%' || v_q || '%'
    )
  ORDER BY r.verified DESC, (r.upvote_count - r.downvote_count) DESC,
           r.building NULLS LAST, r.level NULLS LAST, r.room_code
  LIMIT 500;
END;
$$;

-- ─── RPC: match_room (timetable lookup) ───────────────────────
-- Returns the single best room for a free-text room string from a
-- timetable entry. Exact normalized match wins; otherwise the
-- highest-rated active room whose code/alias is a prefix.

CREATE OR REPLACE FUNCTION public.match_room(p_room_text text)
RETURNS TABLE (
  id              uuid,
  room_code       text,
  room_label      text,
  building        text,
  level           text,
  description     text,
  campus          text,
  verified        boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_uni    text;
  v_campus text;
  v_norm   text := public._norm_room(p_room_text);
BEGIN
  IF v_uid IS NULL OR v_norm = '' THEN
    RETURN;
  END IF;

  SELECT p.university_id, nullif(trim(coalesce(p.campus, '')), '')
  INTO v_uni, v_campus
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_uni IS NULL OR trim(v_uni) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, r.room_code, r.room_label, r.building, r.level, r.description, r.campus, r.verified
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
    (r.room_code_norm = v_norm) DESC,           -- exact match first
    (v_norm = ANY (r.aliases)) DESC,            -- alias exact
    (r.campus IS NOT DISTINCT FROM v_campus) DESC, -- same campus
    r.verified DESC,
    (r.upvote_count - r.downvote_count) DESC,
    abs(char_length(r.room_code_norm) - char_length(v_norm))  -- closest length
  LIMIT 1;
END;
$$;

-- ─── RPC: upsert_campus_rooms (bulk save reviewed extraction) ─

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
  SELECT out_uni, out_campus INTO v_uni, v_campus
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
    SELECT id, created_by INTO v_existing, v_existing_owner
    FROM public.campus_rooms
    WHERE university_id = v_uni
      AND coalesce(campus, '') = coalesce(v_campus, '')
      AND room_code_norm = v_norm
      AND status <> 'removed'
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.campus_rooms (
        created_by, university_id, campus, room_code, room_code_norm,
        room_label, building, level, description, source, source_file_url
      ) VALUES (
        v_uid, v_uni, v_campus, left(v_code, 60), v_norm,
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

-- ─── RPC: create_campus_room (single manual add) ──────────────

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
  v_uid    uuid := auth.uid();
  v_uni    text;
  v_campus text;
  v_code   text := trim(coalesce(p_room_code, ''));
  v_norm   text;
  v_existing uuid;
  v_id     uuid;
BEGIN
  SELECT out_uni, out_campus INTO v_uni, v_campus
  FROM public._campus_room_assert_scope();

  v_norm := public._norm_room(v_code);
  IF v_norm = '' THEN
    RAISE EXCEPTION 'Room code is required.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_existing
  FROM public.campus_rooms
  WHERE university_id = v_uni
    AND coalesce(campus, '') = coalesce(v_campus, '')
    AND room_code_norm = v_norm
    AND status <> 'removed'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'This room is already on the map.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.campus_rooms (
    created_by, university_id, campus, room_code, room_code_norm,
    room_label, building, level, description, source, source_file_url
  ) VALUES (
    v_uid, v_uni, v_campus, left(v_code, 60), v_norm,
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

-- ─── RPC: update_campus_room (own only) ───────────────────────

CREATE OR REPLACE FUNCTION public.update_campus_room(
  p_id uuid,
  p_room_label text DEFAULT NULL,
  p_building text DEFAULT NULL,
  p_level text DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.campus_rooms
  SET room_label  = nullif(trim(coalesce(p_room_label, '')), ''),
      building    = nullif(trim(coalesce(p_building, '')), ''),
      level       = nullif(trim(coalesce(p_level, '')), ''),
      description = nullif(trim(coalesce(p_description, '')), ''),
      updated_at  = now()
  WHERE id = p_id
    AND created_by = v_uid
    AND status <> 'removed';
END;
$$;

-- ─── RPC: delete_campus_room (own only, soft delete) ──────────

CREATE OR REPLACE FUNCTION public.delete_campus_room(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.campus_rooms
  SET status = 'removed', updated_at = now()
  WHERE id = p_id AND created_by = v_uid;
END;
$$;

-- ─── RPC: vote_campus_room (accuracy vote) ────────────────────
-- p_vote: 1 = accurate, -1 = wrong, 0 = clear my vote.

CREATE OR REPLACE FUNCTION public.vote_campus_room(p_id uuid, p_vote int)
RETURNS TABLE (upvote_count int, downvote_count int, verified boolean, my_vote int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uni text;
  v_ok  boolean;
  v_up  int;
  v_down int;
  v_verified boolean;
BEGIN
  IF v_uid IS NULL OR p_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.university_id INTO v_uni
  FROM public.profiles p WHERE p.id = v_uid;

  SELECT EXISTS (
    SELECT 1 FROM public.campus_rooms r
    WHERE r.id = p_id AND r.university_id = v_uni AND r.status = 'active'
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Room not found.' USING ERRCODE = 'P0001';
  END IF;

  IF p_vote = 0 THEN
    DELETE FROM public.campus_room_votes WHERE room_id = p_id AND user_id = v_uid;
  ELSIF p_vote IN (1, -1) THEN
    INSERT INTO public.campus_room_votes (room_id, user_id, vote)
    VALUES (p_id, v_uid, p_vote::smallint)
    ON CONFLICT (room_id, user_id) DO UPDATE SET vote = excluded.vote, created_at = now();
  ELSE
    RAISE EXCEPTION 'Invalid vote.' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    coalesce(SUM(CASE WHEN vote = 1  THEN 1 ELSE 0 END), 0),
    coalesce(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0)
  INTO v_up, v_down
  FROM public.campus_room_votes WHERE room_id = p_id;

  v_verified := (v_up - v_down) >= 5;

  UPDATE public.campus_rooms
  SET upvote_count = v_up, downvote_count = v_down, verified = v_verified, updated_at = now()
  WHERE id = p_id;

  RETURN QUERY
  SELECT v_up, v_down, v_verified,
    coalesce((SELECT vote FROM public.campus_room_votes WHERE room_id = p_id AND user_id = v_uid), 0)::int;
END;
$$;

-- ─── Grants ───────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.get_campus_rooms(text, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_room(text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_campus_rooms(jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_campus_room(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_campus_room(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_campus_room(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.vote_campus_room(uuid, int)           TO authenticated;

-- ─── Storage: uploaded directory source files (photo/PDF) ─────

INSERT INTO storage.buckets (id, name, public)
VALUES ('campus-directories', 'campus-directories', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Authenticated users can upload campus directories" ON storage.objects;
CREATE POLICY "Authenticated users can upload campus directories"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'campus-directories' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Public read campus directories" ON storage.objects;
CREATE POLICY "Public read campus directories"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'campus-directories');

DROP POLICY IF EXISTS "Users can delete own campus directories" ON storage.objects;
CREATE POLICY "Users can delete own campus directories"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'campus-directories' AND auth.uid()::text = (storage.foldername(name))[1]);

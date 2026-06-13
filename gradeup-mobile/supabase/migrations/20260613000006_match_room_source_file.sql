-- Return the uploaded directory reference (photo/PDF URL) from match_room
-- so timetable class details can show the source map to other users.

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
    AND (v_campus IS NULL OR r.campus = v_campus OR r.campus IS NULL)
    AND (
      r.room_code_norm = v_norm
      OR v_norm = ANY (r.aliases)
      OR r.room_code_norm LIKE v_norm || '%'
      OR v_norm LIKE r.room_code_norm || '%'
    )
  ORDER BY
    (r.room_code_norm = v_norm) DESC,
    (v_norm = ANY (r.aliases)) DESC,
    (r.faculty IS NOT DISTINCT FROM v_faculty) DESC,
    (r.campus IS NOT DISTINCT FROM v_campus) DESC,
    r.verified DESC,
    (r.upvote_count - r.downvote_count) DESC,
    abs(char_length(r.room_code_norm) - char_length(v_norm))
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_room(text) TO authenticated;

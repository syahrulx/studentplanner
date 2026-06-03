-- ==============================================================================
-- 20260525015028_seed_unitar_institution.sql
-- Description: Inserts UNITAR International University as a new institution
--              into the universities table + seeds all campuses/learning centres.
--              Follows the same pattern as UiTM, IPG, KPTM, and OUM seeding.
-- ==============================================================================

-- ─── 1. Insert UNITAR as a single institution in universities table ──────────
INSERT INTO public.universities (id, name, login_method, api_endpoint)
VALUES (
  'unitar',
  'UNITAR International University',
  'manual',
  'https://auth.unitar.my'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Seed all UNITAR campuses/regional centres into campuses table ────────
INSERT INTO public.campuses (university_id, name)
SELECT 'unitar', campus_name
FROM (VALUES
  ('UNITAR Kelana Jaya (Main Campus)'),
  ('UNITAR Alor Setar Regional Centre'),
  ('UNITAR Ipoh Regional Centre'),
  ('UNITAR Johor Bahru Regional Centre'),
  ('UNITAR Kota Bharu Regional Centre'),
  ('UNITAR Kota Kinabalu Regional Centre'),
  ('UNITAR Kuala Terengganu Regional Centre'),
  ('UNITAR Kuching Regional Centre'),
  ('UNITAR Melaka Regional Centre'),
  ('UNITAR Penang Regional Centre'),
  ('UNITAR Sungai Petani Regional Centre')
) AS data(campus_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.campuses
  WHERE university_id = 'unitar' AND name = data.campus_name
);

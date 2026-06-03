-- ==============================================================================
-- 20260525014353_seed_oum_institution.sql
-- Description: Inserts Open University Malaysia (OUM) as a new institution
--              into the universities table + seeds all campuses/learning centres.
--              Follows the same pattern as UiTM, IPG, and KPTM seeding.
-- ==============================================================================

-- ─── 1. Insert OUM as a single institution in universities table ─────────────
INSERT INTO public.universities (id, name, login_method, api_endpoint)
VALUES (
  'oum',
  'Open University Malaysia',
  'manual',
  'https://myinspire.oum.edu.my/'
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Seed all OUM learning centres into campuses table ────────────────────
INSERT INTO public.campuses (university_id, name)
SELECT 'oum', campus_name
FROM (VALUES
  -- Central Zone
  ('OUM Petaling Jaya Learning Centre (Menara OUM)'),
  ('OUM Shah Alam Learning Centre'),
  ('OUM Kuala Lumpur Learning Centre'),
  ('OUM Kuala Selangor Learning Centre'),
  ('OUM Bangi Learning Centre'),
  ('OUM Banting Learning Centre'),

  -- Northern Zone
  ('OUM Alor Setar Learning Centre'),
  ('OUM Kangar Learning Centre (Marketing Office)'),
  ('OUM Sungai Petani Learning Centre'),
  ('OUM Seberang Jaya Learning Centre'),
  ('OUM Bukit Jambul Learning Centre (Marketing Office)'),
  ('OUM Ipoh Learning Centre'),
  ('OUM Taiping Learning Centre'),
  ('OUM Tanjong Malim Learning Centre'),
  ('OUM Manjung Learning Centre'),

  -- Southern Zone
  ('OUM Johor Bahru Learning Centre'),
  ('OUM Simpang Renggam Learning Centre'),
  ('OUM Pontian Learning Centre (Marketing Office)'),
  ('OUM Batu Pahat Learning Centre'),
  ('OUM Melaka Learning Centre'),
  ('OUM Seremban Learning Centre'),

  -- Eastern Zone
  ('OUM Kota Bharu Learning Centre'),
  ('OUM Kuala Krai Learning Centre (Marketing Office)'),
  ('OUM Kuala Terengganu Learning Centre'),
  ('OUM Kuantan Learning Centre'),
  ('OUM Temerloh Learning Centre'),
  ('OUM Kuala Lipis Learning Centre'),

  -- Sabah
  ('OUM Kota Kinabalu Learning Centre'),
  ('OUM Sandakan Learning Centre'),
  ('OUM Keningau Learning Centre'),
  ('OUM Kota Marudu Learning Centre'),
  ('OUM Lahad Datu Learning Centre'),
  ('OUM Tawau Learning Centre'),

  -- Sarawak
  ('OUM Kuching Learning Centre'),
  ('OUM Sibu Learning Centre'),
  ('OUM Bintulu Learning Centre'),
  ('OUM Miri Learning Centre')
) AS data(campus_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.campuses
  WHERE university_id = 'oum' AND name = data.campus_name
);

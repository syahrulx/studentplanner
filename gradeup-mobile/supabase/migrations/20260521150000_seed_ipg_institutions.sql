-- ==============================================================================
-- 20260521150000_seed_ipg_institutions.sql
-- Description: Inserts all 27 IPG (Institut Pendidikan Guru) kampus in Malaysia
--              into the universities table + campuses table.
--              Follows the same pattern as UiTM and Politeknik seeding.
-- ==============================================================================

-- ─── 1. Insert IPG as a single institution in universities table ─────────────
INSERT INTO public.universities (id, name, login_method)
VALUES ('ipg', 'Institut Pendidikan Guru Malaysia', 'manual')
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Seed all 27 IPG kampus into campuses table ──────────────────────────
INSERT INTO public.campuses (university_id, name)
SELECT 'ipg', campus_name
FROM (VALUES
  -- Zon Utara
  ('IPG Kampus Perlis'),
  ('IPG Kampus Darul Aman'),
  ('IPG Kampus Sultan Abdul Halim'),
  ('IPG Kampus Pulau Pinang'),
  ('IPG Kampus Tuanku Bainun'),
  ('IPG Kampus Ipoh'),

  -- Zon Tengah
  ('IPG Kampus Bahasa Melayu'),
  ('IPG Kampus Bahasa Antarabangsa'),
  ('IPG Kampus Ilmu Khas'),
  ('IPG Kampus Pendidikan Islam'),
  ('IPG Kampus Pendidikan Teknik'),

  -- Zon Selatan
  ('IPG Kampus Raja Melewar'),
  ('IPG Kampus Perempuan Melayu'),
  ('IPG Kampus Temenggong Ibrahim'),
  ('IPG Kampus Tun Hussein Onn'),

  -- Zon Pantai Timur
  ('IPG Kampus Kota Bharu'),
  ('IPG Kampus Dato'' Razali Ismail'),
  ('IPG Kampus Sultan Mizan'),
  ('IPG Kampus Tengku Ampuan Afzan'),

  -- Zon Sabah
  ('IPG Kampus Gaya'),
  ('IPG Kampus Kent'),
  ('IPG Kampus Keningau'),
  ('IPG Kampus Tawau'),

  -- Zon Sarawak
  ('IPG Kampus Batu Lintang'),
  ('IPG Kampus Rajang'),
  ('IPG Kampus Sarawak'),
  ('IPG Kampus Tun Abdul Razak')
) AS data(campus_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.campuses
  WHERE university_id = 'ipg' AND name = data.campus_name
);

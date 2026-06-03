-- ==============================================================================
-- 20260522000000_seed_kptm_institutions.sql
-- Description: Inserts KPTM (Kolej Poly-Tech MARA) as a new institution
--              into the universities table + seeds all campuses.
--              Follows the same pattern as UiTM and IPG seeding.
-- ==============================================================================

-- ─── 1. Insert KPTM as a single institution in universities table ────────────
INSERT INTO public.universities (id, name, login_method)
VALUES ('kptm', 'Kolej Poly-Tech MARA', 'manual')
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Seed all KPTM campuses into campuses table ──────────────────────────
INSERT INTO public.campuses (university_id, name)
SELECT 'kptm', campus_name
FROM (VALUES
  ('KPTM Kuala Lumpur'),
  ('KPTM Bangi'),
  ('KPTM Kuantan'),
  ('KPTM Kota Bharu'),
  ('KPTM Ipoh'),
  ('KPTM Alor Setar'),
  ('KPTM Banting'),
  ('KPTM Johor Bahru (Pandan Indah)')
) AS data(campus_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.campuses
  WHERE university_id = 'kptm' AND name = data.campus_name
);

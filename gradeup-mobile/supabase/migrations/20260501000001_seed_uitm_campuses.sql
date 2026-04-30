-- ==============================================================================
-- 20260501000001_seed_uitm_campuses.sql
-- Description: Inserts all UiTM branch campuses into the campuses table.
-- ==============================================================================

-- Safely insert the campuses avoiding duplicates if run multiple times.
-- Note: Assuming the university_id for UiTM is 'uitm'. Adjust if it differs.
INSERT INTO public.campuses (university_id, name) 
SELECT 'uitm', campus_name
FROM (VALUES 
  ('Shah Alam (Main Campus)'),
  ('Puncak Alam'),
  ('Puncak Perdana'),
  ('Sungai Buloh'),
  ('Selayang'),
  ('Dengkil'),
  ('Jalan Othman (PJ)'),
  ('Segamat'),
  ('Pasir Gudang'),
  ('Sungai Petani'),
  ('Machang'),
  ('Kota Bharu'),
  ('Alor Gajah (Lendu)'),
  ('Bandaraya Melaka'),
  ('Jasin'),
  ('Kuala Pilah'),
  ('Seremban 3'),
  ('Rembau'),
  ('Jengka'),
  ('Raub'),
  ('Permatang Pauh (Bukit Mertajam)'),
  ('Bertam'),
  ('Seri Iskandar'),
  ('Tapah'),
  ('Teluk Intan'),
  ('Arau'),
  ('Dungun'),
  ('Kuala Terengganu (Chendering)'),
  ('Bukit Besi'),
  ('Kota Kinabalu'),
  ('Tawau'),
  ('Kota Samarahan'),
  ('Samarahan 2'),
  ('Mukah')
) AS data(campus_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.campuses 
  WHERE university_id = 'uitm' AND name = data.campus_name
);

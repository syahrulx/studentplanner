-- ==============================================================================
-- 20260606000001_seed_politeknik_institutions.sql
-- Description: Inserts Politeknik Malaysia as a new single institution
--              into the universities table + seeds all 36 campuses.
-- ==============================================================================

-- ─── 1. Insert Politeknik as a single institution in universities table ────────────
INSERT INTO public.universities (id, name, login_method)
VALUES ('politeknik', 'Politeknik Malaysia', 'manual')
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Seed all Politeknik campuses into campuses table ──────────────────────────
INSERT INTO public.campuses (university_id, name)
SELECT 'politeknik', campus_name
FROM (VALUES
  ('Politeknik Bagan Datuk (PBD)'),
  ('Politeknik Balik Pulau (PBU)'),
  ('Politeknik Banting (PBS)'),
  ('Politeknik Besut (PBT)'),
  ('Politeknik Hulu Terengganu (PHT)'),
  ('Politeknik Ibrahim Sultan (PIS)'),
  ('Politeknik Jeli (PJK)'),
  ('Politeknik Kota Bharu (PKB)'),
  ('Politeknik Kota Kinabalu (PKK)'),
  ('Politeknik Kuala Terengganu (PKT)'),
  ('Politeknik Kuching Sarawak (PKS)'),
  ('Politeknik Melaka (PMK)'),
  ('Politeknik Merlimau (PMM)'),
  ('Politeknik Mersing (PMJ)'),
  ('Politeknik METrO Betong (PMBS)'),
  ('Politeknik METrO Johor Bahru (PMJB)'),
  ('Politeknik METrO Kuala Lumpur (PMKL)'),
  ('Politeknik METrO Kuantan (PMKU)'),
  ('Politeknik METrO Tasek Gelugor (PMTG)'),
  ('Politeknik Muadzam Shah (PMS)'),
  ('Politeknik Mukah Sarawak (PMU)'),
  ('Politeknik Nilai (PNS)'),
  ('Politeknik Port Dickson (PPD)'),
  ('Politeknik Sandakan (PSS)'),
  ('Politeknik Seberang Perai (PSP)'),
  ('Politeknik Sultan Abdul Halim Mu’adzam Shah (POLIMAS)'),
  ('Politeknik Sultan Azlan Shah (PSAS)'),
  ('Politeknik Sultan Haji Ahmad Shah (POLISAS)'),
  ('Politeknik Sultan Idris Shah (PSIS)'),
  ('Politeknik Sultan Mizan Zainal Abidin (PSMZA)'),
  ('Politeknik Sultan Salahuddin Abdul Aziz Shah (PSA)'),
  ('Politeknik Tawau (PTS)'),
  ('Politeknik Tuanku Sultanah Bahiyah (PTSB)'),
  ('Politeknik Tuanku Syed Sirajuddin (PTSS)'),
  ('Politeknik Tun Syed Nasir Syed Ismail (PTSN)'),
  ('Politeknik Ungku Omar (PUO)')
) AS data(campus_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.campuses
  WHERE university_id = 'politeknik' AND name = data.campus_name
);

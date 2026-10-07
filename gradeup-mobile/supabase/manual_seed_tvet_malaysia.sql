-- ==============================================================================
-- manual_seed_tvet_malaysia.sql
-- Description: Adds the Malaysian TVET networks that were missing, with all
--              their campuses, and fills in campuses for universities that had
--              none. Same pattern as the UNITAR / OUM / KPTM seeds.
--
--   New institutions:
--     kolej_komuniti  Kolej Komuniti (KPT)                    105 campuses
--     adtec_jtm       ADTEC JTM: ILP, ADTEC, JMTI, CIAST (KESUMA)  29 campuses
--     ikbn            IKBN / IKTBN (KBS)                       22 campuses
--     tvet_mara       TVET MARA: KKTM, IKM, MJII (MARA)       25 campuses
--
--   Campuses added for existing universities:
--     umk, usim, unisza, UIS, UNIMEL, GMI, NILAI UNIVERSITY, widad, UPTM, maiwp
--
-- Safe to run more than once: universities are upserted, campuses are only
-- inserted when that exact name is not there yet.
-- ==============================================================================

BEGIN;

-- ─── 1. Upsert the TVET networks ────────────────────────────────────────────
INSERT INTO public.universities (id, name, short_name, country, login_method, api_endpoint)
VALUES
  ('kolej_komuniti', 'Kolej Komuniti Malaysia',                          'Kolej Komuniti', 'MY', 'manual', NULL),
  ('adtec_jtm',      'ADTEC JTM (ILP, ADTEC, JMTI, CIAST)',              'ADTEC / ILP',    'MY', 'manual', NULL),
  ('ikbn',           'Institut Kemahiran Belia Negara (IKBN / IKTBN)',   'IKBN / IKTBN',   'MY', 'manual', NULL),
  ('tvet_mara',      'TVET MARA (KKTM, IKM, MJII)',                      'TVET MARA',      'MY', 'manual', NULL)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    short_name = EXCLUDED.short_name;

-- ─── 2. Campuses ────────────────────────────────────────────────────────────
INSERT INTO public.campuses (university_id, name)
SELECT data.university_id, data.campus_name
FROM (VALUES
  -- Kolej Komuniti · Perak
  ('kolej_komuniti', 'Kolej Komuniti Teluk Intan – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Chenderoh – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Gerik – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Sungai Siput – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Pasir Salak – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Batu Gajah – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Taiping – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Bagan Datuk – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Bagan Serai – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Manjung – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Kuala Kangsar – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Cawangan Lenggong – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti Tapah – Perak'),
  ('kolej_komuniti', 'Kolej Komuniti RTC Gopeng – Perak'),
  -- Kolej Komuniti · Selangor
  ('kolej_komuniti', 'Kolej Komuniti Sabak Bernam – Selangor'),
  ('kolej_komuniti', 'Kolej Komuniti Kuala Langat – Selangor'),
  ('kolej_komuniti', 'Kolej Komuniti Hulu Selangor – Selangor'),
  ('kolej_komuniti', 'Kolej Komuniti Hulu Langat – Selangor'),
  ('kolej_komuniti', 'Kolej Komuniti Selayang – Selangor'),
  ('kolej_komuniti', 'Kolej Komuniti Ampang – Selangor'),
  ('kolej_komuniti', 'Kolej Komuniti Kelana Jaya – Selangor'),
  ('kolej_komuniti', 'Kolej Komuniti Tanjong Karang – Selangor'),
  ('kolej_komuniti', 'Kolej Komuniti Klang – Selangor'),
  ('kolej_komuniti', 'Kolej Komuniti Shah Alam – Selangor'),
  ('kolej_komuniti', 'Kolej Komuniti Cawangan Sepang – Selangor'),
  -- Kolej Komuniti · Pahang
  ('kolej_komuniti', 'Kolej Komuniti Kuantan – Pahang'),
  ('kolej_komuniti', 'Kolej Komuniti Bentong – Pahang'),
  ('kolej_komuniti', 'Kolej Komuniti Temerloh – Pahang'),
  ('kolej_komuniti', 'Kolej Komuniti Paya Besar – Pahang'),
  ('kolej_komuniti', 'Kolej Komuniti Rompin – Pahang'),
  ('kolej_komuniti', 'Kolej Komuniti Pekan – Pahang'),
  ('kolej_komuniti', 'Kolej Komuniti Jerantut – Pahang'),
  ('kolej_komuniti', 'Kolej Komuniti Raub – Pahang'),
  ('kolej_komuniti', 'Kolej Komuniti Bera – Pahang'),
  ('kolej_komuniti', 'Kolej Komuniti Cawangan Maran – Pahang'),
  ('kolej_komuniti', 'Kolej Komuniti Lipis – Pahang'),
  -- Kolej Komuniti · Kelantan
  ('kolej_komuniti', 'Kolej Komuniti Kok Lanas – Kelantan'),
  ('kolej_komuniti', 'Kolej Komuniti Jeli – Kelantan'),
  ('kolej_komuniti', 'Kolej Komuniti Cawangan Tanah Merah – Kelantan'),
  ('kolej_komuniti', 'Kolej Komuniti Pasir Mas – Kelantan'),
  ('kolej_komuniti', 'Kolej Komuniti Cawangan Rantau Panjang – Kelantan'),
  -- Kolej Komuniti · Johor
  ('kolej_komuniti', 'Kolej Komuniti Segamat – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Segamat 2 – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Ledang – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Bandar Penawar – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Pasir Gudang – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Kluang – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Batu Pahat – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Muar – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Bandar Tenggara – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Tanjung Piai – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Pagoh – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Kota Tinggi – Johor'),
  ('kolej_komuniti', 'Kolej Komuniti Cawangan Gelang Patah – Johor'),
  -- Kolej Komuniti · Kedah
  ('kolej_komuniti', 'Kolej Komuniti Bandar Darulaman – Kedah'),
  ('kolej_komuniti', 'Kolej Komuniti Sungai Petani – Kedah'),
  ('kolej_komuniti', 'Kolej Komuniti Kulim – Kedah'),
  ('kolej_komuniti', 'Kolej Komuniti Langkawi (Langkawi Tourism Academy) – Kedah'),
  ('kolej_komuniti', 'Kolej Komuniti Baling – Kedah'),
  ('kolej_komuniti', 'Kolej Komuniti Padang Terap – Kedah'),
  ('kolej_komuniti', 'Kolej Komuniti Sik – Kedah'),
  ('kolej_komuniti', 'Kolej Komuniti Cawangan Jerlun – Kedah'),
  ('kolej_komuniti', 'Kolej Komuniti Bandar Baharu – Kedah'),
  ('kolej_komuniti', 'Kolej Komuniti Jerai – Kedah'),
  -- Kolej Komuniti · Melaka
  ('kolej_komuniti', 'Kolej Komuniti Bukit Beruang – Melaka'),
  ('kolej_komuniti', 'Kolej Komuniti Masjid Tanah – Melaka'),
  ('kolej_komuniti', 'Kolej Komuniti Selandar – Melaka'),
  ('kolej_komuniti', 'Kolej Komuniti Jasin – Melaka'),
  ('kolej_komuniti', 'Kolej Komuniti Kota Melaka – Melaka'),
  ('kolej_komuniti', 'Kolej Komuniti Tangga Batu – Melaka'),
  -- Kolej Komuniti · Negeri Sembilan
  ('kolej_komuniti', 'Kolej Komuniti Jempol – Negeri Sembilan'),
  ('kolej_komuniti', 'Kolej Komuniti Jelebu – Negeri Sembilan'),
  ('kolej_komuniti', 'Kolej Komuniti Rembau – Negeri Sembilan'),
  ('kolej_komuniti', 'Kolej Komuniti Tampin – Negeri Sembilan'),
  ('kolej_komuniti', 'Kolej Komuniti Kuala Pilah – Negeri Sembilan'),
  -- Kolej Komuniti · Pulau Pinang
  ('kolej_komuniti', 'Kolej Komuniti Kepala Batas – Pulau Pinang'),
  ('kolej_komuniti', 'Kolej Komuniti Bayan Baru – Pulau Pinang'),
  ('kolej_komuniti', 'Kolej Komuniti Seberang Jaya – Pulau Pinang'),
  ('kolej_komuniti', 'Kolej Komuniti Nibong Tebal – Pulau Pinang'),
  ('kolej_komuniti', 'Kolej Komuniti Bukit Mertajam – Pulau Pinang'),
  ('kolej_komuniti', 'Kolej Komuniti Tasek Gelugor – Pulau Pinang'),
  -- Kolej Komuniti · Perlis
  ('kolej_komuniti', 'Kolej Komuniti Arau – Perlis'),
  ('kolej_komuniti', 'Kolej Komuniti Cawangan Kangar – Perlis'),
  -- Kolej Komuniti · Terengganu
  ('kolej_komuniti', 'Kolej Komuniti Kuala Terengganu – Terengganu'),
  ('kolej_komuniti', 'Kolej Komuniti Kuala Terengganu Cawangan Kuala Nerus – Terengganu'),
  ('kolej_komuniti', 'Kolej Komuniti Besut – Terengganu'),
  ('kolej_komuniti', 'Kolej Komuniti Kemaman – Terengganu'),
  ('kolej_komuniti', 'Kolej Komuniti Cawangan Hulu Terengganu – Terengganu'),
  -- Kolej Komuniti · Sabah
  ('kolej_komuniti', 'Kolej Komuniti Tawau – Sabah'),
  ('kolej_komuniti', 'Kolej Komuniti Lahad Datu – Sabah'),
  ('kolej_komuniti', 'Kolej Komuniti Sandakan – Sabah'),
  ('kolej_komuniti', 'Kolej Komuniti Beaufort – Sabah'),
  ('kolej_komuniti', 'Kolej Komuniti Tambunan – Sabah'),
  ('kolej_komuniti', 'Kolej Komuniti Penampang – Sabah'),
  ('kolej_komuniti', 'Kolej Komuniti Kota Marudu – Sabah'),
  ('kolej_komuniti', 'Kolej Komuniti Semporna – Sabah'),
  ('kolej_komuniti', 'Kolej Komuniti Tuaran – Sabah'),
  ('kolej_komuniti', 'Kolej Komuniti Papar – Sabah'),
  -- Kolej Komuniti · Sarawak
  ('kolej_komuniti', 'Kolej Komuniti Kuching – Sarawak'),
  ('kolej_komuniti', 'Kolej Komuniti Mas Gading – Sarawak'),
  ('kolej_komuniti', 'Kolej Komuniti Miri – Sarawak'),
  ('kolej_komuniti', 'Kolej Komuniti Sarikei – Sarawak'),
  ('kolej_komuniti', 'Kolej Komuniti Sarikei Cawangan Sibu – Sarawak'),
  ('kolej_komuniti', 'Kolej Komuniti Santubong – Sarawak'),
  ('kolej_komuniti', 'Kolej Komuniti Betong – Sarawak'),

  -- ADTEC JTM · ILP campuses (Institut Latihan Perindustrian)
  ('adtec_jtm', 'ILP Ipoh – Perak'),
  ('adtec_jtm', 'ILP Kuala Lumpur – W.P. Kuala Lumpur'),
  ('adtec_jtm', 'ILP Kuantan – Pahang'),
  ('adtec_jtm', 'ILP Kuala Langat (Banting) – Selangor'),
  ('adtec_jtm', 'ILP Pasir Gudang – Johor'),
  ('adtec_jtm', 'ILP Jitra – Kedah'),
  ('adtec_jtm', 'ILP Kepala Batas – Pulau Pinang'),
  ('adtec_jtm', 'ILP Nibong Tebal – Pulau Pinang'),
  ('adtec_jtm', 'ILP Kota Bharu – Kelantan'),
  ('adtec_jtm', 'ILP Marang – Terengganu'),
  ('adtec_jtm', 'ILP Pedas – Negeri Sembilan'),
  ('adtec_jtm', 'ILP Mersing – Johor'),
  ('adtec_jtm', 'ILP Tangkak – Johor'),
  ('adtec_jtm', 'ILP Labuan – W.P. Labuan'),
  ('adtec_jtm', 'ILP Miri – Sarawak'),
  ('adtec_jtm', 'ILP Kangar – Perlis'),
  ('adtec_jtm', 'ILP Serian – Sarawak'),
  ('adtec_jtm', 'ILP Bukit Katil – Melaka'),
  ('adtec_jtm', 'ILP Kota Kinabalu – Sabah'),
  ('adtec_jtm', 'ILP Sandakan – Sabah'),
  -- ADTEC JTM · ADTEC-only campuses
  ('adtec_jtm', 'ADTEC Batu Pahat – Johor'),
  ('adtec_jtm', 'ADTEC Kulim – Kedah'),
  ('adtec_jtm', 'ADTEC Shah Alam – Selangor'),
  ('adtec_jtm', 'ADTEC Kemaman – Terengganu'),
  ('adtec_jtm', 'ADTEC Bintulu – Sarawak'),
  ('adtec_jtm', 'ADTEC Jerantut – Pahang'),
  ('adtec_jtm', 'ADTEC Taiping – Perak'),
  -- ADTEC JTM · JMTI and CIAST
  ('adtec_jtm', 'JMTI (Japan-Malaysia Technical Institute) – Pulau Pinang'),
  ('adtec_jtm', 'CIAST Shah Alam – Selangor'),

  -- IKBN / IKTBN (Kementerian Belia dan Sukan)
  ('ikbn', 'IKTBN Dusun Tua (Hulu Langat) – Selangor'),
  ('ikbn', 'IKTBN Sepang – Selangor'),
  ('ikbn', 'IKBN Peretak (Kuala Kubu Bharu) – Selangor'),
  ('ikbn', 'IKBN Kuala Langat (Banting) – Selangor'),
  ('ikbn', 'IKBN Kuala Perlis – Perlis'),
  ('ikbn', 'IKBN Jitra – Kedah'),
  ('ikbn', 'IKBN Naka (Pokok Sena) – Kedah'),
  ('ikbn', 'IKTBN Bukit Mertajam – Pulau Pinang'),
  ('ikbn', 'IKBN Seri Iskandar – Perak'),
  ('ikbn', 'IKTBN Chembong (Rembau) – Negeri Sembilan'),
  ('ikbn', 'IKTBN Alor Gajah – Melaka'),
  ('ikbn', 'IKTBN Pagoh (Muar) – Johor'),
  ('ikbn', 'IKBN Bandar Penawar (Kota Tinggi) – Johor'),
  ('ikbn', 'IKTBN Temerloh – Pahang'),
  ('ikbn', 'IKBN Pekan – Pahang'),
  ('ikbn', 'IKBN Lipis – Pahang'),
  ('ikbn', 'IKBN Kemasik (Kemaman) – Terengganu'),
  ('ikbn', 'IKBN Wakaf Tapai (Marang) – Terengganu'),
  ('ikbn', 'IKTBN Bachok – Kelantan'),
  ('ikbn', 'IKBN Tanah Merah – Kelantan'),
  ('ikbn', 'IKBN Kinarut (Papar) – Sabah'),
  ('ikbn', 'IKBN Miri – Sarawak'),

  -- TVET MARA · KKTM (Kolej Kemahiran Tinggi MARA)
  ('tvet_mara', 'KKTM Balik Pulau – Pulau Pinang'),
  ('tvet_mara', 'KKTM Petaling Jaya – Selangor'),
  ('tvet_mara', 'KKTM Lenggong – Perak'),
  ('tvet_mara', 'KKTM Rembau – Negeri Sembilan'),
  ('tvet_mara', 'KKTM Pasir Mas – Kelantan'),
  ('tvet_mara', 'KKTM Kemaman – Terengganu'),
  ('tvet_mara', 'KKTM Kuantan – Pahang'),
  ('tvet_mara', 'KKTM Ledang – Johor'),
  ('tvet_mara', 'KKTM Sri Gading – Johor'),
  ('tvet_mara', 'KKTM Masjid Tanah – Melaka'),
  -- TVET MARA · IKM (Institut Kemahiran MARA)
  ('tvet_mara', 'IKM Beseri – Perlis'),
  ('tvet_mara', 'IKM Alor Setar – Kedah'),
  ('tvet_mara', 'IKM Sik – Kedah'),
  ('tvet_mara', 'IKM Sungai Petani – Kedah'),
  ('tvet_mara', 'IKM Seberang Perai Utara – Pulau Pinang'),
  ('tvet_mara', 'IKM Lumut – Perak'),
  ('tvet_mara', 'IKM Kuala Lumpur – W.P. Kuala Lumpur'),
  ('tvet_mara', 'IKM Tun Sri Yusof Abdullah (TSYA) – Pahang'),
  ('tvet_mara', 'IKM Besut – Terengganu'),
  ('tvet_mara', 'IKM Johor Bahru – Johor'),
  ('tvet_mara', 'IKM Jasin – Melaka'),
  ('tvet_mara', 'IKM Bintulu – Sarawak'),
  ('tvet_mara', 'IKM Kuching – Sarawak'),
  ('tvet_mara', 'IKM Kota Kinabalu – Sabah'),
  -- TVET MARA · MJII
  ('tvet_mara', 'MJII (MARA Japan Industrial Institute) Beranang – Selangor'),

  -- Universities that had no campuses yet
  ('umk',              'UMK Kampus Kota (Pengkalan Chepa) – Kelantan'),
  ('umk',              'UMK Kampus Bachok – Kelantan'),
  ('umk',              'UMK Kampus Jeli – Kelantan'),
  ('usim',             'USIM Bandar Baru Nilai (Main Campus) – Negeri Sembilan'),
  ('usim',             'USIM Pandan Indah (Medicine and Dentistry) – Kuala Lumpur'),
  ('unisza',           'UniSZA Kampus Gong Badak (Main Campus) – Terengganu'),
  ('unisza',           'UniSZA Kampus Kota (Medicine) – Terengganu'),
  ('unisza',           'UniSZA Kampus Besut – Terengganu'),
  ('UIS',              'UIS Bandar Seri Putra, Bangi – Selangor'),
  ('UNIMEL',           'UNIMEL Kuala Sungai Baru – Melaka'),
  ('GMI',              'GMI Bangi – Selangor'),
  ('NILAI UNIVERSITY', 'Nilai University, Putra Nilai – Negeri Sembilan'),
  ('widad',            'WIDAD University College Kuantan – Pahang'),
  ('UPTM',             'UPTM Cheras – Kuala Lumpur'),
  ('maiwp',            'UniMAIWP Kuala Lumpur')
) AS data(university_id, campus_name)
JOIN public.universities u ON u.id = data.university_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.campuses c
  WHERE c.university_id = data.university_id AND c.name = data.campus_name
);

COMMIT;

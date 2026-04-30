-- ==============================================================================
-- 20260501000002_seed_campuses.sql
-- Description: Inserts real-world campus names for all major Malaysian universities.
--              Joins with public.universities to ensure no foreign key violations.
-- ==============================================================================

INSERT INTO public.campuses (university_id, name) 
SELECT u.id, data.campus_name
FROM (VALUES 
  ('MAHSA UNIVERSITY', 'Bandar Saujana Putra (Main Campus)'),
  
  ('MMU', 'Cyberjaya Campus'),
  ('MMU', 'Melaka Campus'),
  
  ('SUNWAY', 'Bandar Sunway (Main Campus)'),
  
  ('TAYLORS', 'Lakeside Campus'),
  
  ('UIA', 'Gombak (Main Campus)'),
  ('UIA', 'Kuantan Campus'),
  ('UIA', 'Pagoh Campus'),
  ('UIAM', 'Gombak (Main Campus)'),
  ('UIAM', 'Kuantan Campus'),
  ('UIAM', 'Pagoh Campus'),
  
  ('UKM', 'Bangi (Main Campus)'),
  ('UKM', 'Cheras (Kuala Lumpur Campus)'),
  
  ('UM', 'Kuala Lumpur (Main Campus)'),
  
  ('UMP', 'Pekan Campus'),
  ('UMP', 'Gambang Campus'),
  
  ('UNIMAP', 'Pauh Putra (Main Campus)'),
  ('UNIMAP', 'Kangar Campus'),
  
  ('UMS', 'Kota Kinabalu (Main Campus)'),
  ('UMS', 'Sandakan Campus'),
  ('UMS', 'Labuan International Campus'),
  
  ('UNIMAS', 'Kota Samarahan (Main Campus)'),
  
  ('UMT', 'Kuala Terengganu (Main Campus)'),
  
  ('UPSI', 'Kampus Sultan Abdul Jalil Shah (Tanjung Malim)'),
  ('UPSI', 'Kampus Sultan Azlan Shah (Proton City)'),
  
  ('UPNM', 'Kem Sungai Besi (Main Campus)'),
  
  ('UPM', 'Serdang (Main Campus)'),
  ('UPM', 'Bintulu Campus (Sarawak)'),
  
  ('USM', 'Minden (Main Campus, Penang)'),
  ('USM', 'Engineering Campus (Nibong Tebal)'),
  ('USM', 'Health Campus (Kubang Kerian)'),
  
  ('UNISEL', 'Bestari Jaya Campus'),
  ('UNISEL', 'Shah Alam Campus'),
  
  ('UTEM', 'Kampus Induk (Durian Tunggal)'),
  ('UTEM', 'Kampus Teknologi'),
  ('UTEM', 'Kampus Bandar'),
  
  ('UTM', 'Skudai (Main Campus)'),
  ('UTM', 'Kuala Lumpur Campus'),
  
  ('UTP', 'Seri Iskandar (Main Campus)'),
  
  ('UNITEN', 'Putrajaya Campus'),
  ('UNITEN', 'Sultan Haji Ahmad Shah Campus (KSHAS)'),
  
  ('UTHM', 'Kampus Induk (Parit Raja)'),
  ('UTHM', 'Kampus Cawangan Pagoh'),
  
  ('UNIKL', 'UniKL MIAT (Sepang)'),
  ('UNIKL', 'UniKL BMI (Gombak)'),
  ('UNIKL', 'UniKL MFI (Bangi)'),
  ('UNIKL', 'UniKL MSI (Kulim)'),
  ('UNIKL', 'UniKL MICET (Alor Gajah)'),
  ('UNIKL', 'UniKL MIMET (Lumut)'),
  ('UNIKL', 'UniKL RCMP (Ipoh)'),
  ('UNIKL', 'UniKL Business School (Kuala Lumpur)'),
  ('UNIKL', 'UniKL MIDI (Cheras)')
) AS data(expected_id, campus_name)
JOIN public.universities u ON UPPER(u.id) = UPPER(data.expected_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.campuses c 
  WHERE c.university_id = u.id AND c.name = data.campus_name
);

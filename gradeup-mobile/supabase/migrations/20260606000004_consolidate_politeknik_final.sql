-- ==============================================================================
-- 20260606000004_consolidate_politeknik_final.sql
-- Description: An all-in-one script to guarantee the consolidation of 
--              Politeknik universities into a single entity, migrating 
--              all old data and deleting the old individual entries.
-- ==============================================================================

DO $$
DECLARE
  old_uni RECORD;
  new_uni_id TEXT := 'politeknik';
  new_campus_id UUID;
BEGIN
  -- 1. Ensure new university exists
  INSERT INTO public.universities (id, name, login_method)
  VALUES (new_uni_id, 'Politeknik Malaysia', 'manual')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Seed campuses (ignoring duplicates)
  INSERT INTO public.campuses (university_id, name)
  SELECT new_uni_id, campus_name
  FROM (VALUES
    ('Politeknik Bagan Datuk (PBD)'),
    ('Politeknik Balik Pulau (PBU)'),
    ('Politeknik Banting (PBS)'),
    ('Politeknik Banting Selangor (PBS)'), -- Added based on your screenshot
    ('Politeknik Besut (PBT)'),
    ('Politeknik Hulu Terengganu (PHT)'),
    ('Politeknik Ibrahim Sultan (PIS)'),
    ('Politeknik Jeli (PJK)'),
    ('Politeknik Jeli Kelantan (PJK)'), -- Added based on your screenshot
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
    WHERE university_id = new_uni_id AND name = data.campus_name
  );

  -- 3. Loop over all existing Politeknik universities
  FOR old_uni IN
    SELECT id, name FROM public.universities 
    WHERE name ILIKE '%Politeknik%' AND id <> new_uni_id
  LOOP
    -- Find the matching campus ID for the old university name
    SELECT id INTO new_campus_id FROM public.campuses 
    WHERE university_id = new_uni_id AND name = old_uni.name
    LIMIT 1;

    -- Fallback: Create the campus if it somehow doesn't exist
    IF new_campus_id IS NULL THEN
      INSERT INTO public.campuses (university_id, name)
      VALUES (new_uni_id, old_uni.name)
      RETURNING id INTO new_campus_id;
    END IF;

    -- Migrate Profiles
    UPDATE public.profiles 
    SET university_id = new_uni_id, campus = old_uni.name
    WHERE university_id = old_uni.id;

    -- Migrate Organizations
    UPDATE public.organizations
    SET university_id = new_uni_id, campus_id = new_campus_id
    WHERE university_id = old_uni.id;

    -- Migrate Calendar Offers
    UPDATE public.university_calendar_offers
    SET university_id = new_uni_id, campus_id = new_campus_id
    WHERE university_id = old_uni.id;

    -- Migrate Community Posts (using dynamic SQL to safely ignore if column is missing)
    BEGIN
      UPDATE public.community_posts
      SET university_id = new_uni_id, campus_id = new_campus_id
      WHERE university_id = old_uni.id;
    EXCEPTION WHEN undefined_column THEN
    END;

    -- Migrate Authority Requests
    BEGIN
      UPDATE public.authority_requests
      SET university_id = new_uni_id, campus_id = new_campus_id
      WHERE university_id = old_uni.id;
    EXCEPTION WHEN undefined_column THEN
    END;

    -- Delete Mappings
    DELETE FROM public.university_mappings WHERE university_id = old_uni.id;

    -- Delete old campuses mapping (if any)
    DELETE FROM public.campuses WHERE university_id = old_uni.id;

    -- Finally, delete the old university
    DELETE FROM public.universities WHERE id = old_uni.id;
  END LOOP;
END $$;

-- ==============================================================================
-- 20260606000002_migrate_politeknik_campuses.sql
-- Description: Consolidates old individual Politeknik entries into the 
--              single 'politeknik' university, maps them to campuses, 
--              and deletes the old individual universities.
-- ==============================================================================

DO $$
DECLARE
  old_uni RECORD;
  new_uni_id TEXT := 'politeknik';
  new_campus_id UUID;
BEGIN
  -- Loop over all existing universities that contain 'Politeknik' in their name but are not 'politeknik' itself.
  FOR old_uni IN
    SELECT id, name FROM public.universities 
    WHERE name ILIKE '%Politeknik%' AND id <> new_uni_id
  LOOP
    -- Find the matching campus ID for the old university name under the new 'politeknik' university
    SELECT id INTO new_campus_id FROM public.campuses 
    WHERE university_id = new_uni_id AND name = old_uni.name
    LIMIT 1;

    -- Fallback: Create the campus if it somehow doesn't exist yet
    IF new_campus_id IS NULL THEN
      INSERT INTO public.campuses (university_id, name)
      VALUES (new_uni_id, old_uni.name)
      RETURNING id INTO new_campus_id;
    END IF;

    -- 1. Migrate Profiles
    -- Update profiles to use the new university ID and set their text 'campus' field to the old university name.
    UPDATE public.profiles 
    SET university_id = new_uni_id, campus = old_uni.name
    WHERE university_id = old_uni.id;

    -- 2. Migrate Organizations
    -- Update organizations to use the new university ID and the new campus_id UUID.
    UPDATE public.organizations
    SET university_id = new_uni_id, campus_id = new_campus_id
    WHERE university_id = old_uni.id;

    -- 3. Migrate Calendar Offers
    UPDATE public.university_calendar_offers
    SET university_id = new_uni_id, campus_id = new_campus_id
    WHERE university_id = old_uni.id;

    -- 4. Delete University Mappings
    -- Since we can't easily merge JSON mapping configs automatically, we clear them so the admin can reconfigure for the combined university if needed.
    DELETE FROM public.university_mappings WHERE university_id = old_uni.id;

    -- 5. Delete Old Campuses (if any existed under the old university ID)
    DELETE FROM public.campuses WHERE university_id = old_uni.id;

    -- Finally, delete the old university itself
    DELETE FROM public.universities WHERE id = old_uni.id;
    
    RAISE NOTICE 'Migrated % to % (Campus ID: %)', old_uni.id, new_uni_id, new_campus_id;
  END LOOP;
END $$;

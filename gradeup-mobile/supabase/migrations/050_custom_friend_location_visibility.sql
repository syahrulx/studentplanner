-- 1. Create the friend location visibility table (allowlist)
CREATE TABLE IF NOT EXISTS public.friend_location_visibility (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);

-- 2. Enable RLS
ALTER TABLE public.friend_location_visibility ENABLE ROW LEVEL SECURITY;

-- 3. RLS policy for the table (users manage their own rows, and friends can read them if needed)
DROP POLICY IF EXISTS "Users can manage their own friend visibility" ON public.friend_location_visibility;
CREATE POLICY "Users can manage their own friend visibility"
  ON public.friend_location_visibility
  FOR ALL
  USING (auth.uid() = user_id);

-- Also allow the friend themselves to read the row to see if they are allowed (needed for joining in user_locations policy)
DROP POLICY IF EXISTS "Friends can read if they are the target" ON public.friend_location_visibility;
CREATE POLICY "Friends can read if they are the target"
  ON public.friend_location_visibility
  FOR SELECT
  USING (auth.uid() = friend_id);

-- 4. Update the CHECK constraint on user_locations.visibility to include 'custom_friends'
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'CHECK'
    AND tc.table_name = 'user_locations'
    AND ccu.column_name = 'visibility'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_locations DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE public.user_locations
    ADD CONSTRAINT user_locations_visibility_check
    CHECK (visibility IN ('public', 'friends', 'custom_friends', 'circles', 'off'));

  -- Also update constraints on profiles.location_visibility if it exists
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'CHECK'
    AND tc.table_name = 'profiles'
    AND ccu.column_name = 'location_visibility'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', constraint_name);
  END IF;

  -- Add the new constraint using the same rules
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_location_visibility_check
    CHECK (location_visibility IN ('public', 'friends', 'custom_friends', 'circles', 'off'));
END $$;

-- 5. Update the "Friends can read locations" policy to authorize customized friends
DO $$
BEGIN
  DROP POLICY IF EXISTS "Friends can read locations" ON public.user_locations;

  CREATE POLICY "Friends can read locations"
  ON public.user_locations FOR SELECT USING (
    visibility = 'public'
    OR (
      visibility = 'friends'
      AND EXISTS (
        SELECT 1
        FROM public.friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.requester_id = auth.uid() AND f.addressee_id = user_locations.user_id)
            OR (f.addressee_id = auth.uid() AND f.requester_id = user_locations.user_id)
          )
      )
    )
    OR (
      visibility = 'custom_friends'
      AND EXISTS (
        SELECT 1
        FROM public.friend_location_visibility flv
        WHERE flv.user_id = user_locations.user_id
          AND flv.friend_id = auth.uid()
      )
      -- Plus verify they are actually accepted friends to be perfectly secure
      AND EXISTS (
        SELECT 1
        FROM public.friendships f
        WHERE f.status = 'accepted'
          AND (
            (f.requester_id = auth.uid() AND f.addressee_id = user_locations.user_id)
            OR (f.addressee_id = auth.uid() AND f.requester_id = user_locations.user_id)
          )
      )
    )
    OR (
      visibility = 'circles'
      AND EXISTS (
        SELECT 1
        FROM public.circle_location_visibility clv
        JOIN public.circle_members cm
          ON clv.circle_id = cm.circle_id
        WHERE clv.user_id = user_locations.user_id
          AND cm.user_id = auth.uid()
      )
    )
  );
END $$;

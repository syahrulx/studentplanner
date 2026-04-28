-- Migration: Create helper function for the refresh-classroom-token Edge Function
-- This function reads the Google provider refresh token from auth.identities
-- It runs with SECURITY DEFINER so the Edge Function can access auth schema

CREATE OR REPLACE FUNCTION public.get_google_refresh_token(p_user_id uuid)
RETURNS TABLE(refresh_token text) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT 
    (identity_data->>'provider_refresh_token')::text as refresh_token
  FROM auth.identities
  WHERE user_id = p_user_id 
    AND provider = 'google'
  LIMIT 1;
$$;

-- Only allow authenticated users to call this, and only for their own ID
-- (The Edge Function validates the JWT before calling this)
REVOKE ALL ON FUNCTION public.get_google_refresh_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_google_refresh_token(uuid) TO service_role;

-- ==============================================================================
-- 20260501000000_organizations_campuses.sql
-- Description: Adds campuses and organizations tables. Also adds campus_id
--              and organization_id to community_posts and authority_requests.
-- ==============================================================================

-- 1. Campuses
CREATE TABLE IF NOT EXISTS public.campuses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  university_id text NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read campuses"
  ON public.campuses FOR SELECT
  USING (true);

CREATE POLICY "Admin full access campuses"
  ON public.campuses FOR ALL
  USING (public.is_admin());

-- 2. Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  university_id text NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read organizations"
  ON public.organizations FOR SELECT
  USING (true);

CREATE POLICY "Admin full access organizations"
  ON public.organizations FOR ALL
  USING (public.is_admin());

-- 3. Add to community_posts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'community_posts' AND column_name = 'campus_id'
  ) THEN
    ALTER TABLE public.community_posts ADD COLUMN campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'community_posts' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.community_posts ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Add to authority_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'authority_requests' AND column_name = 'campus_id'
  ) THEN
    ALTER TABLE public.authority_requests ADD COLUMN campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'authority_requests' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.authority_requests ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

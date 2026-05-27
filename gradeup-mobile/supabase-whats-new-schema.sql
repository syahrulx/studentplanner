-- ---------------------------------------------------------------------------
-- What's New Prompt Schema
-- This table stores release notes configured by the admin, which will be
-- displayed in the mobile app once per version.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whats_new_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active BOOLEAN NOT NULL DEFAULT false,
  version_name TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whats_new_prompts ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (the mobile app needs to fetch the active one)
CREATE POLICY "Allow public read access on whats_new_prompts"
  ON public.whats_new_prompts
  FOR SELECT
  USING (true);

-- Allow authenticated users to manage (this will be handled by admin-web)
CREATE POLICY "Allow authenticated full access on whats_new_prompts"
  ON public.whats_new_prompts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_whats_new_prompts_updated_at ON public.whats_new_prompts;
CREATE TRIGGER set_whats_new_prompts_updated_at
BEFORE UPDATE ON public.whats_new_prompts
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

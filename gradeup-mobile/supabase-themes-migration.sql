-- Migration: Add has_used_theme_trial to profiles
-- This tracks whether a user has already used their 1-week premium theme trial.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS has_used_theme_trial boolean DEFAULT false;

-- Add a comment for documentation
COMMENT ON COLUMN public.profiles.has_used_theme_trial IS 'True if the user has claimed a premium theme trial.';

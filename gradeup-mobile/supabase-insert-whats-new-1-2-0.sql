-- ---------------------------------------------------------------------------
-- Insert What's New Prompt for Version 1.2.0 (Improved Tasks Wording)
-- Run this in your Supabase SQL Editor to activate the in-app modal.
-- ---------------------------------------------------------------------------

-- 1. Deactivate all existing active prompts
UPDATE public.whats_new_prompts 
SET is_active = false 
WHERE is_active = true;

-- 2. Insert and activate the version 1.2.0 prompt
-- Note: The React Native parser expects a bullet line followed by a description line.
INSERT INTO public.whats_new_prompts (is_active, version_name, title, content)
VALUES (
  true,
  '1.2.0',
  'What''s New in Rencana',
  '• Assessment Calculator
Calculate your final grades by breaking down carry marks, assessment weights, and exam scores.
• FYP Survey Swap
Struggling to find respondents? Post your FYP survey here and swap responses with fellow students!
• Recurring To-Do Tasks
Set repeating deadlines, class routines, or study habits once, and let the app manage them automatically.'
);

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.3.0
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.3.0',
  'What''s New in Rencana v1.3.0 🎉',
  '• Rencana Plus & Pro
Upgrade to unlock Unlimited AI Timetables, Ad-Free, and Premium Study Scheduling.
• Crowdsourced Calendar
Browse and import schedules shared by other students, or configure yours manually.
• Assessment Calculator
Calculate final grades by breaking down carry marks, weights, and exam scores.
• FYP Survey Swap
Post your FYP survey and swap responses with fellow students to get respondents.
• Recurring To-Do Tasks
Set repeating deadlines, class routines, or study habits to manage them automatically.'
);

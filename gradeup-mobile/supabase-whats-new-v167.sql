-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.6.7
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.6.7',
  'What''s New in Rencana v1.6.7 🎉',
  '• Forgot Password
Reset your password right from the login screen if you ever get locked out.
• Academic Calendar
Now covers orientation week, public holidays, and industrial training periods.
• Fixes
Fixed broken attachments in chats and DMs, study timer pause/resume, and theme reset issues.
• Improvements
Various bug fixes and under-the-hood improvements for a more reliable app.'
);

-- What's New for 1.6.8. Covers 1.6.5 → 1.6.8, minus the items already announced
-- in the 1.6.7 prompt (password reset, orientation/holiday/industrial-training
-- periods, chat attachment fixes, study timer pause/resume, theme reset).
--
-- The iPad entry is older than this range (8fb9272, 27 Jun 2026) but has never
-- appeared in a What's New prompt, so it is announced here.

-- 1. Disable any previously active prompts so this one takes priority
UPDATE public.whats_new_prompts
SET is_active = false
WHERE is_active = true;

-- 2. Insert the new What's New prompt for Version 1.6.8
INSERT INTO public.whats_new_prompts (
  is_active,
  version_name,
  title,
  content
) VALUES (
  true,
  '1.6.8',
  'What''s New in Rencana v1.6.8 🎉',
  '• Earn Free Plus Days
Post about Rencana on Threads, X, Facebook, Instagram or TikTok, submit the link, and get up to 60 days of Plus once verified.
• Group Project Breakdowns
Share a task breakdown with your group and watch everyone''s progress update live as steps get done.
• Pick The Right Semester
Calendar options now show their dates, week count, full timeline and which one is running today — instead of a list of labels you had to guess between.
• Built For iPad
Rencana now uses the whole screen on tablets, with a two-column dashboard, wider timetable and navigation that adapts to the space.
• Steps Spread Across Your Week
Breaking a task down used to stamp the same due date on every step. Steps now spread over the days before the deadline, front-loaded so you finish with a buffer.
• We''ll Tell You When A Semester Ends
If your planner is still on a finished semester, Rencana now asks you to pick the current one instead of quietly drifting out of sync.
• Handwriting Resizing
Drag any of the four corners to resize images, text boxes and lasso selections, with a minimum size so nothing collapses.
• Redesigned Home
Today''s focus, each active plan and your recommendation are now swipeable pages, so every broken-down task is one swipe away.
• Correct Calendar For Your Programme
Foundation students at UiTM were being given the wrong calendar group. Your academic level is now read correctly everywhere.
• Broken Calendars Blocked
A calendar missing its lecture blocks or exam dates can no longer be published, so nobody inherits a planner with a hole in it.'
);

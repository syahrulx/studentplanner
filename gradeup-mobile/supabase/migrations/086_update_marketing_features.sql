-- Update marketing / feature bullets for subscription tiers to match premium high-converting mobile copy
DELETE FROM public.subscription_plan_features;

INSERT INTO public.subscription_plan_features (tier, label, enabled, sort_order) VALUES
  -- Free (Starter)
  ('free', 'Complete student planner with timetable, tasks & smart notes', true, 0),
  ('free', 'Instant AI Schedule Scanner (1-photo timetable setup)', true, 1),
  ('free', 'Daily Study Snap: Post 1 snap and view 3 friend snaps', true, 2),
  ('free', 'Essential AI note & flashcard generator (up to 10 cards/deck)', true, 3),
  ('free', '1 Study Streak revival per month', true, 4),
  ('free', 'Basic AI allowance', true, 5),
  ('free', '100% Ad-Free (For now!)', true, 6),

  -- Plus (Everyday)
  ('plus', 'Includes all Starter features', true, 0),
  ('plus', '10x Higher AI Allowance for notes, extraction, and chats', true, 1),
  ('plus', 'AI Subject Tutor ("Ask AI"): Reads all notes in a subject to answer homework questions', true, 2),
  ('plus', 'AI Tutor Active History: Keep 1 persistent active chat per subject', true, 3),
  ('plus', 'Bigger AI Flashcards: Generate up to 20 flashcards per deck in 1 tap', true, 4),
  ('plus', 'Apple & Google Calendar Sync: Seamlessly import external calendars', true, 5),
  ('plus', 'Premium App Themes & Widgets: Cat, Aurora, Spider, Mono visual styling', true, 6),
  ('plus', '2x Study Streak Revivals (2 lives/month to save your streak)', true, 7),
  ('plus', 'Interactive Snaps: Post 3 snaps daily, view unlimited friend snaps, and react with custom emojis', true, 8),

  -- Pro (All Access)
  ('pro', 'Includes all Everyday features', true, 0),
  ('pro', '50x Max AI Allowance powered by our fastest, smartest models', true, 1),
  ('pro', 'Unlimited Expert AI Tutor (no subject chat history limits)', true, 2),
  ('pro', 'Hyper-Accurate AI Results for note summaries and timetables', true, 3),
  ('pro', 'Max AI Flashcards: Generate up to 35 flashcards per deck in 1 tap', true, 4),
  ('pro', '3x Study Streak Revivals (3 lives/month to protect your streak)', true, 5),
  ('pro', 'Unlimited Study Snaps with a lifetime history archive', true, 6),
  ('pro', 'Ultimate Custom Presence: Express your study vibe with custom text & emoji statuses', true, 7),
  ('pro', 'Collaborative Learning: Share AI-generated flashcards directly with friends & study circles', true, 8);

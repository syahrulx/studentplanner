-- =============================================================================
-- 20260502140000: Disable push to all users on new event / memo
-- =============================================================================
-- The trigger from 20260501000006_event_push_notifications.sql sent a remote
-- push to every user in the university (or all users when university_id is null)
-- whenever someone posted an event or memo. That produced noisy “popup” style
-- notifications. New events and memos remain visible in the app without this.
-- -----------------------------------------------------------------------------

drop trigger if exists trg_event_push_insert on public.community_posts;

drop function if exists public._on_event_insert();

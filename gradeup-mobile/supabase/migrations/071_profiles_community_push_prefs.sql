-- Per-user opt-in flags for remote community push (Expo).
-- Read by supabase/functions/community-push/index.ts.
-- Defaults are `true` so existing users get pushes without any further action.

alter table public.profiles
  add column if not exists community_push_enabled       boolean not null default true,
  add column if not exists push_reactions_enabled       boolean not null default true,
  add column if not exists push_friend_requests_enabled boolean not null default true,
  add column if not exists push_circle_enabled          boolean not null default true,
  add column if not exists push_shared_task_enabled     boolean not null default true;

comment on column public.profiles.community_push_enabled is
  'Master switch: if false, no community category push is ever delivered.';
comment on column public.profiles.push_reactions_enabled is
  'Per-category toggle (reactions / bumps / quiz / goals).';
comment on column public.profiles.push_friend_requests_enabled is
  'Per-category toggle for incoming/accepted friend requests.';
comment on column public.profiles.push_circle_enabled is
  'Per-category toggle for circle invites and responses.';
comment on column public.profiles.push_shared_task_enabled is
  'Per-category toggle for shared task create/accept/decline/complete.';

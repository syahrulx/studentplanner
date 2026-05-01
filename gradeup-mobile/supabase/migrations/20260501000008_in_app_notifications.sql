-- =============================================================================
-- 20260501000008: In-App Notifications
-- =============================================================================
-- Creates the in_app_notifications table and hooks it directly into the existing
-- _send_community_push helper so ALL community pushes also generate an in-app alert.

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null,
  data jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes for querying the notification center
create index if not exists idx_in_app_notifications_user 
  on public.in_app_notifications(user_id, created_at desc);

create index if not exists idx_in_app_notifications_unread 
  on public.in_app_notifications(user_id) where is_read = false;

-- RLS Policies
alter table public.in_app_notifications enable row level security;

drop policy if exists "Users can view their own notifications" on public.in_app_notifications;
create policy "Users can view their own notifications"
  on public.in_app_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on public.in_app_notifications;
create policy "Users can update their own notifications"
  on public.in_app_notifications for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own notifications" on public.in_app_notifications;
create policy "Users can delete their own notifications"
  on public.in_app_notifications for delete
  using (auth.uid() = user_id);


-- Update the _send_community_push helper to also write to in_app_notifications
create or replace function public._send_community_push(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  fn_url  text;
  svc_key text;
  uid_str text;
begin
  -- Short-circuit when called with obviously empty payload.
  if payload is null
     or payload->'recipientUserIds' is null
     or jsonb_array_length(payload->'recipientUserIds') = 0 then
    return;
  end if;

  -- 1. WRITE TO IN-APP NOTIFICATIONS
  -- Do this regardless of whether Expo push secrets are configured.
  for uid_str in select jsonb_array_elements_text(payload->'recipientUserIds') loop
    begin
      insert into public.in_app_notifications (user_id, title, body, category, data)
      values (
        uid_str::uuid,
        payload->>'title',
        payload->>'body',
        payload->>'category',
        payload->'data'
      );
    exception when others then
      -- If inserting for one user fails (e.g. invalid uuid), skip and continue.
    end;
  end loop;

  -- 2. SEND EXPO PUSH NOTIFICATION
  select decrypted_secret into fn_url
    from vault.decrypted_secrets
    where name = 'community_push_url'
    limit 1;

  select decrypted_secret into svc_key
    from vault.decrypted_secrets
    where name = 'community_push_service_key'
    limit 1;

  -- Silently skip if the project hasn't been configured yet.
  if fn_url is null or svc_key is null then
    return;
  end if;

  -- pg_net is fire-and-forget: returns a request_id immediately, processes async.
  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body    := payload
  );
exception
  when others then
    -- Never fail the host transaction because of a push side-effect.
    raise warning '[community-push] _send_community_push failed: %', sqlerrm;
end;
$$;

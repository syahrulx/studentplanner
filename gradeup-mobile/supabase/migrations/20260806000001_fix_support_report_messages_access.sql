-- Fix: users cannot read or send replies in their own support ticket thread.
--
-- Symptom: after an admin replies to a support report, the mobile app's
-- /support-ticket screen shows "No replies yet" even though the admin's
-- message was successfully written (the user did receive the push
-- notification for it), and sending a reply fails with "Could not send".
--
-- The ticket header loads fine because get_my_support_report() is
-- SECURITY DEFINER and bypasses RLS entirely — but the message thread itself
-- is read/written directly from the client (supabase.from('support_report_messages')),
-- which depends on RLS policies (and the underlying table grants) actually
-- being active for the `authenticated` role. On this project those appear to
-- not have taken effect, even though the table and RPC from the original
-- 202608030002 migration did. This migration is fully idempotent — safe to
-- run regardless of what already exists, touches no existing data.

create table if not exists public.support_report_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.support_reports(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('user', 'admin')),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_report_messages_report_created_idx
  on public.support_report_messages(report_id, created_at asc);

-- Explicit table-level grants — belt and braces in case this table (created
-- outside the normal Supabase table-creation flow at some point) never
-- picked up the project's default `authenticated` privileges. RLS policies
-- below narrow this down to each user's own report thread.
grant select, insert on public.support_report_messages to authenticated;

alter table public.support_report_messages enable row level security;

drop policy if exists "support message reporter read own" on public.support_report_messages;
create policy "support message reporter read own"
  on public.support_report_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_reports r
      where r.id = report_id and r.reporter_id = auth.uid()
    )
  );

drop policy if exists "support message reporter reply own" on public.support_report_messages;
create policy "support message reporter reply own"
  on public.support_report_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and author_role = 'user'
    and exists (
      select 1 from public.support_reports r
      where r.id = report_id and r.reporter_id = auth.uid()
    )
  );

drop policy if exists "support message admins manage" on public.support_report_messages;
create policy "support message admins manage"
  on public.support_report_messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Re-assert the RPC the ticket screen uses to load the report header without
-- exposing admin_notes (already working, but harmless/idempotent to redeclare).
create or replace function public.get_my_support_report(p_report_id uuid)
returns table (
  id uuid,
  subject text,
  message text,
  kind text,
  status text,
  screenshot_url text,
  created_at timestamptz,
  resolved_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.subject, r.message, r.kind, r.status, r.screenshot_url,
    r.created_at, r.resolved_at
  from public.support_reports r
  where r.id = p_report_id and r.reporter_id = auth.uid();
$$;

revoke all on function public.get_my_support_report(uuid) from public;
grant execute on function public.get_my_support_report(uuid) to authenticated;

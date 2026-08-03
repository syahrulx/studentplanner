-- Two-way support conversations. Private admin notes remain on support_reports
-- and are never exposed through this table or its user-facing policies.

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

alter table public.support_report_messages enable row level security;

-- Do not expose support_reports.admin_notes to a reporter. The app uses this
-- narrowly scoped RPC for the user-visible ticket header instead of direct
-- table reads. Admin access remains unchanged.
drop policy if exists "support_reports_select_own" on public.support_reports;

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

-- Admin replies are written through admin_data with the service role, and this
-- policy keeps direct dashboard access consistent with existing support tables.
drop policy if exists "support message admins manage" on public.support_report_messages;
create policy "support message admins manage"
  on public.support_report_messages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

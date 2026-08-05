-- Safe, user-facing support-report submission.
--
-- This migration is deliberately self-contained because some production
-- projects were created before the original support_reports migration was
-- tracked remotely. It creates only the support inbox when missing; it does
-- not alter or delete unrelated user data.

create table if not exists public.support_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete restrict,
  reporter_name_snapshot text,
  reporter_email_snapshot text,
  kind text not null check (kind in ('bug', 'issue', 'faq', 'app_complaint', 'user_complaint', 'other')),
  subject text not null check (char_length(subject) between 1 and 200),
  message text not null check (char_length(message) between 1 and 4000),
  target_user_handle text,
  target_user_id uuid references auth.users(id) on delete set null,
  contact_info text,
  screenshot_url text,
  app_version text,
  platform text check (platform in ('ios', 'android', 'web', 'other') or platform is null),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Existing manually-created versions of the table may predate these optional
-- fields. Adding them is additive and does not overwrite report records.
alter table public.support_reports add column if not exists reporter_name_snapshot text;
alter table public.support_reports add column if not exists reporter_email_snapshot text;
alter table public.support_reports add column if not exists target_user_handle text;
alter table public.support_reports add column if not exists target_user_id uuid references auth.users(id) on delete set null;
alter table public.support_reports add column if not exists contact_info text;
alter table public.support_reports add column if not exists screenshot_url text;
alter table public.support_reports add column if not exists app_version text;
alter table public.support_reports add column if not exists platform text;
alter table public.support_reports add column if not exists status text not null default 'open';
alter table public.support_reports add column if not exists admin_notes text;
alter table public.support_reports add column if not exists resolved_at timestamptz;

create index if not exists idx_support_reports_created_at on public.support_reports (created_at desc);
create index if not exists idx_support_reports_status on public.support_reports (status);
create index if not exists idx_support_reports_reporter_id on public.support_reports (reporter_id);
alter table public.support_reports enable row level security;

create or replace function public.submit_my_support_report(
  p_kind text,
  p_subject text,
  p_message text,
  p_target_user_handle text default null,
  p_contact_info text default null,
  p_screenshot_url text default null,
  p_app_version text default null,
  p_platform text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_name text;
  v_email text;
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_subject text := left(trim(coalesce(p_subject, '')), 200);
  v_message text := left(trim(coalesce(p_message, '')), 4000);
  v_target text := nullif(left(trim(coalesce(p_target_user_handle, '')), 200), '');
  v_contact text := nullif(left(trim(coalesce(p_contact_info, '')), 200), '');
  v_screenshot text := nullif(left(trim(coalesce(p_screenshot_url, '')), 2000), '');
  v_version text := nullif(left(trim(coalesce(p_app_version, '')), 80), '');
  v_platform text := lower(trim(coalesce(p_platform, '')));
begin
  if v_user_id is null then
    raise exception 'Please sign in again before sending a report.' using errcode = '28000';
  end if;

  if v_kind not in ('bug', 'issue', 'faq', 'app_complaint', 'user_complaint', 'other') then
    raise exception 'Choose a valid report type.' using errcode = '22023';
  end if;
  if char_length(v_subject) = 0 then
    raise exception 'Subject is required.' using errcode = '22023';
  end if;
  if char_length(v_message) = 0 then
    raise exception 'Details are required.' using errcode = '22023';
  end if;
  if v_platform <> '' and v_platform not in ('ios', 'android', 'web', 'other') then
    raise exception 'Invalid app platform.' using errcode = '22023';
  end if;

  select nullif(trim(p.name), '') into v_name
  from public.profiles p where p.id = v_user_id;
  select u.email into v_email from auth.users u where u.id = v_user_id;

  insert into public.support_reports (
    reporter_id, reporter_name_snapshot, reporter_email_snapshot, kind,
    subject, message, target_user_handle, contact_info, screenshot_url,
    app_version, platform
  ) values (
    v_user_id, v_name, v_email, v_kind, v_subject, v_message, v_target,
    v_contact, v_screenshot, v_version, nullif(v_platform, '')
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_my_support_report(text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_my_support_report(text, text, text, text, text, text, text, text) to authenticated;

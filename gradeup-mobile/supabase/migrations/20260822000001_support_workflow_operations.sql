-- Additive support workflow metadata for the admin inbox.
-- IMPORTANT: intentionally not applied automatically. Existing reports and
-- user-facing status values remain unchanged.

alter table public.support_reports
  add column if not exists assigned_admin_id uuid references public.admin_users(user_id) on delete set null,
  add column if not exists workflow_state text not null default 'new',
  add column if not exists first_admin_response_at timestamptz,
  add column if not exists last_user_reply_at timestamptz,
  add column if not exists last_admin_reply_at timestamptz,
  add column if not exists internal_tags text[] not null default '{}',
  add column if not exists escalation_level text not null default 'none',
  add column if not exists escalation_reason text,
  add column if not exists escalated_at timestamptz,
  add column if not exists reopened_count integer not null default 0,
  add column if not exists last_reopened_at timestamptz;

alter table public.support_reports
  drop constraint if exists support_reports_workflow_state_check,
  add constraint support_reports_workflow_state_check check (
    workflow_state in ('new', 'assigned', 'in_progress', 'waiting_user', 'waiting_engineering', 'resolved', 'closed')
  ),
  drop constraint if exists support_reports_escalation_level_check,
  add constraint support_reports_escalation_level_check check (
    escalation_level in ('none', 'normal', 'urgent')
  ),
  drop constraint if exists support_reports_reopened_count_check,
  add constraint support_reports_reopened_count_check check (reopened_count >= 0);

create index if not exists support_reports_workflow_queue_idx
  on public.support_reports (workflow_state, assigned_admin_id, created_at desc);
create index if not exists support_reports_last_user_reply_idx
  on public.support_reports (last_user_reply_at desc)
  where last_user_reply_at is not null;

create or replace function public.update_support_report_conversation_metrics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_state text;
begin
  select workflow_state into v_previous_state
  from public.support_reports where id = new.report_id;

  if new.author_role = 'admin' then
    update public.support_reports
    set first_admin_response_at = coalesce(first_admin_response_at, new.created_at),
        last_admin_reply_at = new.created_at,
        workflow_state = case when workflow_state in ('new', 'assigned') then 'in_progress' else workflow_state end
    where id = new.report_id;
  else
    update public.support_reports
    set last_user_reply_at = new.created_at,
        workflow_state = case
          when workflow_state in ('resolved', 'closed', 'waiting_user') then 'in_progress'
          else workflow_state
        end,
        reopened_count = reopened_count + case when v_previous_state in ('resolved', 'closed') then 1 else 0 end,
        last_reopened_at = case when v_previous_state in ('resolved', 'closed') then new.created_at else last_reopened_at end
    where id = new.report_id;
  end if;
  return new;
end;
$$;

drop trigger if exists support_report_conversation_metrics on public.support_report_messages;
create trigger support_report_conversation_metrics
after insert on public.support_report_messages
for each row execute function public.update_support_report_conversation_metrics();

comment on column public.support_reports.workflow_state is
  'Admin-only workflow state. Legacy user-facing status remains unchanged.';
comment on column public.support_reports.internal_tags is
  'Admin-only normalized tags; never shown to the reporter.';

-- Recovered on 2026-09-23 from supabase_migrations.schema_migrations.
-- This migration was applied to production through the CLI from a checkout
-- whose file was never committed; the statements below are the recorded ones,
-- verbatim, so the repo and the history table agree. Version kept as-is.

-- Messaging is available only to active Plus and Pro subscribers.
-- Existing participant policies still decide which specific conversations a
-- subscriber may access; these restrictive policies add the paid-plan gate.

create or replace function public.has_paid_messaging_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = p_user_id
      and subscription_plan in ('plus', 'pro')
  );
$$;

revoke all on function public.has_paid_messaging_access(uuid) from public;

grant execute on function public.has_paid_messaging_access(uuid) to authenticated;

alter table public.dm_conversations enable row level security;

alter table public.dm_messages enable row level security;

alter table public.dm_conversations
  add column if not exists hidden_for_user_a_at timestamptz,
  add column if not exists hidden_for_user_b_at timestamptz;

create or replace function public.hide_my_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.dm_conversations;
begin
  if not public.has_paid_messaging_access(auth.uid()) then
    raise exception 'A paid subscription is required for messaging'
      using errcode = '42501';
  end if;

  select *
  into target
  from public.dm_conversations
  where id = p_conversation_id;

  if target.id is null or auth.uid() not in (target.user_a, target.user_b) then
    raise exception 'Conversation not found'
      using errcode = '42501';
  end if;

  update public.dm_conversations
  set
    hidden_for_user_a_at = case
      when auth.uid() = user_a then now()
      else hidden_for_user_a_at
    end,
    hidden_for_user_b_at = case
      when auth.uid() = user_b then now()
      else hidden_for_user_b_at
    end
  where id = p_conversation_id;
end;
$$;

revoke all on function public.hide_my_conversation(uuid) from public;

grant execute on function public.hide_my_conversation(uuid) to authenticated;

create or replace function public.restore_my_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.dm_conversations;
begin
  if not public.has_paid_messaging_access(auth.uid()) then
    raise exception 'A paid subscription is required for messaging'
      using errcode = '42501';
  end if;

  select *
  into target
  from public.dm_conversations
  where id = p_conversation_id;

  if target.id is null or auth.uid() not in (target.user_a, target.user_b) then
    raise exception 'Conversation not found'
      using errcode = '42501';
  end if;

  update public.dm_conversations
  set
    hidden_for_user_a_at = case
      when auth.uid() = user_a then null
      else hidden_for_user_a_at
    end,
    hidden_for_user_b_at = case
      when auth.uid() = user_b then null
      else hidden_for_user_b_at
    end
  where id = p_conversation_id;
end;
$$;

revoke all on function public.restore_my_conversation(uuid) from public;

grant execute on function public.restore_my_conversation(uuid) to authenticated;

create or replace function public.restore_conversation_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dm_conversations
  set
    hidden_for_user_a_at = null,
    hidden_for_user_b_at = null,
    last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists restore_conversation_on_new_message on public.dm_messages;

create trigger restore_conversation_on_new_message
  after insert on public.dm_messages
  for each row
  execute function public.restore_conversation_on_new_message();

drop policy if exists "paid subscribers can select conversations" on public.dm_conversations;

create policy "paid subscribers can select conversations"
  on public.dm_conversations
  as restrictive
  for select
  to authenticated
  using (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can insert conversations" on public.dm_conversations;

create policy "paid subscribers can insert conversations"
  on public.dm_conversations
  as restrictive
  for insert
  to authenticated
  with check (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can update conversations" on public.dm_conversations;

create policy "paid subscribers can update conversations"
  on public.dm_conversations
  as restrictive
  for update
  to authenticated
  using (public.has_paid_messaging_access(auth.uid()))
  with check (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can select messages" on public.dm_messages;

create policy "paid subscribers can select messages"
  on public.dm_messages
  as restrictive
  for select
  to authenticated
  using (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can insert messages" on public.dm_messages;

create policy "paid subscribers can insert messages"
  on public.dm_messages
  as restrictive
  for insert
  to authenticated
  with check (public.has_paid_messaging_access(auth.uid()));

drop policy if exists "paid subscribers can update messages" on public.dm_messages;

create policy "paid subscribers can update messages"
  on public.dm_messages
  as restrictive
  for update
  to authenticated
  using (public.has_paid_messaging_access(auth.uid()))
  with check (public.has_paid_messaging_access(auth.uid()));

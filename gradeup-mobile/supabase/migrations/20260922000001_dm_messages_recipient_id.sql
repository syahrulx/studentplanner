-- =============================================================================
-- dm_messages.recipient_id
--
-- Already applied by hand on 2026-09-22; committed so a fresh project gets the
-- column too. The client now depends on it, so an environment built from
-- migrations alone would otherwise have DM badges and notifications silently
-- stop working. Every statement is idempotent.
--
-- Why the column exists at all: dm_messages only ever recorded conversation_id
-- and sender_id, so "messages for me" could not be expressed as a condition on
-- one column. Two things suffered.
--
--   1. The realtime subscription had to take every insert in the table, which
--      made Realtime evaluate the dm_messages SELECT policy — an EXISTS against
--      dm_conversations — once per subscriber per message.
--
--   2. getTotalUnreadDmCount() left the narrowing to that same RLS policy, so
--      its cost tracked total app traffic rather than the caller's.
--
-- Filtering on conversation_id was considered and rejected: a conversation that
-- does not exist yet cannot be in the subscriber's list, so the first message
-- from a new contact would have arrived with no push and no badge until the
-- next poll. A column the trigger fills on insert has no such gap.
-- =============================================================================

alter table public.dm_messages
  add column if not exists recipient_id uuid references auth.users(id) on delete cascade;

-- Backfill. dm_conversations stores the pair with user_a < user_b (see the
-- dm_order_users trigger), so the recipient is simply whichever side is not
-- the sender.
update public.dm_messages m
set recipient_id = case when c.user_a = m.sender_id then c.user_b else c.user_a end
from public.dm_conversations c
where c.id = m.conversation_id
  and m.recipient_id is null;

-- Keep it filled. BEFORE INSERT so the value is present on the row Realtime
-- publishes — an AFTER trigger would be too late for the subscription filter.
create or replace function public.dm_messages_set_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recipient_id is null then
    select case when c.user_a = new.sender_id then c.user_b else c.user_a end
      into new.recipient_id
    from public.dm_conversations c
    where c.id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists dm_messages_set_recipient on public.dm_messages;
create trigger dm_messages_set_recipient
  before insert on public.dm_messages
  for each row execute function public.dm_messages_set_recipient();

-- Partial index: the unread count is the only query that reads this column,
-- and it only ever asks about unread rows.
create index if not exists idx_dm_messages_recipient_unread
  on public.dm_messages (recipient_id)
  where read_by_recipient = false;

comment on column public.dm_messages.recipient_id is
  'Denormalised from dm_conversations by the dm_messages_set_recipient trigger. '
  'Lets the realtime subscription and the unread count filter on one column '
  'instead of leaning on the RLS policy to narrow.';

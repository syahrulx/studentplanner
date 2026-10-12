-- =============================================================================
-- Study World: chat word list, reviewed from the admin website.
--
-- Run AFTER 20261012000001_study_world_admin.sql (needs is_admin() and
-- study_world_admin_log).
--
-- The website filters every chat message before anyone sees it:
--   * clearly bad words and contact details are hidden automatically
--     (a built-in list lives in the website code: src/lib/study-world/chat-filter.ts);
--   * doubtful words (disguised spellings like "phuck") are hidden AND sent
--     here as 'pending', so an admin can mark them 'safe' or 'blocked'.
-- 'blocked' rows add to the built-in list; 'safe' rows override it (e.g. if a
-- normal word is being hidden by mistake).
--
-- PRIVACY: only the single normalised word is stored. Never the message, the
-- sender, their nickname or account. Chat itself is still never stored.
--
-- Nothing here changes existing data.
-- =============================================================================

create table if not exists public.study_world_chat_words (
  -- Lower case letters only, leetspeak undone ("sh1t" → "shit").
  word        text primary key check (word ~ '^[[:alpha:]]{2,40}$' and word = lower(word)),
  status      text not null default 'pending' check (status in ('pending','blocked','safe')),
  category    text check (category is null or category in
                ('profanity','sexual','hate','harassment','contact','other')),
  -- How many times the website saw this word while it was pending.
  hits        int not null default 1 check (hits >= 0),
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  note        text check (note is null or char_length(note) <= 200),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz
);

create index if not exists study_world_chat_words_status_idx
  on public.study_world_chat_words (status, last_seen desc);

alter table public.study_world_chat_words enable row level security;

-- Players read the decided list (blocked + safe) so their filter matches the
-- admins'. The pending queue is for admins only.
drop policy if exists study_world_chat_words_read on public.study_world_chat_words;
create policy study_world_chat_words_read
  on public.study_world_chat_words for select to anon, authenticated
  using (status <> 'pending' or (select public.is_admin()));

drop policy if exists study_world_chat_words_admin_insert on public.study_world_chat_words;
create policy study_world_chat_words_admin_insert
  on public.study_world_chat_words for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists study_world_chat_words_admin_update on public.study_world_chat_words;
create policy study_world_chat_words_admin_update
  on public.study_world_chat_words for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists study_world_chat_words_admin_delete on public.study_world_chat_words;
create policy study_world_chat_words_admin_delete
  on public.study_world_chat_words for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.study_world_chat_words from anon, authenticated;
grant select on public.study_world_chat_words to anon, authenticated;
grant insert, update, delete on public.study_world_chat_words to authenticated;

-- Stamp who decided and log admin decisions (not the website's pending flags).
create or replace function public.study_world_chat_words_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return coalesce(new, old);
  end if;
  -- An admin who is also chatting can flag words too; that isn't a decision.
  if tg_op <> 'DELETE' and new.status = 'pending'
     and (tg_op = 'INSERT' or old.status = 'pending') then
    return new;
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;
  insert into public.study_world_admin_log (admin_id, action, target, details)
  values (
    auth.uid(),
    lower(tg_op) || ':chat_word',
    coalesce(new.word, old.word),
    case
      when tg_op = 'UPDATE' then jsonb_build_object('before', old.status, 'after', new.status)
      when tg_op = 'INSERT' then jsonb_build_object('after', new.status)
      else jsonb_build_object('before', old.status)
    end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists study_world_chat_words_audit on public.study_world_chat_words;
create trigger study_world_chat_words_audit
  before insert or update or delete on public.study_world_chat_words
  for each row execute function public.study_world_chat_words_audit();

-- Called by the website when its filter meets doubtful words. Adds them as
-- 'pending' (or counts another sighting). Never changes a decided word.
-- Signed-in players only; at most 5 words per call; the queue is capped so it
-- can't be flooded.
create or replace function public.study_world_flag_words(p_words text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_word text;
  v_added int := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;
  if (select count(*) from public.study_world_chat_words where status = 'pending') >= 5000 then
    return 0;
  end if;
  foreach v_word in array coalesce(p_words[1:5], array[]::text[])
  loop
    v_word := lower(btrim(v_word));
    continue when v_word !~ '^[[:alpha:]]{2,40}$';
    insert into public.study_world_chat_words (word)
    values (v_word)
    on conflict (word) do update
      set hits = public.study_world_chat_words.hits + 1,
          last_seen = now()
      where public.study_world_chat_words.status = 'pending';
    v_added := v_added + 1;
  end loop;
  return v_added;
end;
$$;

revoke all on function public.study_world_flag_words(text[]) from public, anon;
grant execute on function public.study_world_flag_words(text[]) to authenticated;

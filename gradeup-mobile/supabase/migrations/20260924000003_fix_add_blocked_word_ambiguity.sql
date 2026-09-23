-- =============================================================================
-- Fix: adding a blocked word failed with 'column reference "pattern" is
-- ambiguous'.
--
-- admin_add_confession_blocked_word was declared RETURNS TABLE(id, pattern,
-- note, active, created_at). Every one of those names becomes a plpgsql
-- variable inside the body, so `on conflict (pattern)` and `set active = true`
-- could mean the variable or the column and Postgres refused to guess.
--
-- The caller never used the returned row — the admin screen re-reads the list
-- after adding — so the fix is to stop returning one. No OUT parameters, no
-- names to collide with, and nothing clever to remember next time somebody
-- edits this function.
--
-- The sibling functions are unaffected: admin_list_confession_blocked_words
-- qualifies every reference with its table alias, and the toggle and delete
-- functions return void already.
-- =============================================================================

drop function if exists public.admin_add_confession_blocked_word(text, text);

create function public.admin_add_confession_blocked_word(
  p_pattern text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pattern text := lower(trim(coalesce(p_pattern, '')));
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if char_length(v_pattern) < 2 then
    raise exception 'A blocked word needs at least two characters.' using errcode = 'P0001';
  end if;

  insert into public.confession_blocked_words as w (pattern, note, created_by)
  values (v_pattern, v_note, auth.uid())
  on conflict (pattern) do update
    -- Re-adding a word that was turned off switches it back on rather than
    -- failing, which is what the admin meant by typing it again.
    set active = true,
        note = coalesce(excluded.note, w.note);
end;
$$;

revoke all on function public.admin_add_confession_blocked_word(text, text) from public, anon;
grant execute on function public.admin_add_confession_blocked_word(text, text) to authenticated;

-- Realtime: publish friendships and quick_reactions.
--
-- WHAT WAS WRONG
-- CommunityContext subscribes to postgres_changes on friendships (the
-- "friendship-changes" channel, two filtered bindings) and quick_reactions
-- ("reaction-notifications", INSERT filtered on receiver_id), but neither
-- table was ever in the supabase_realtime publication. Realtime can't
-- subscribe to an unpublished table, so 3 of the 8 bindings made on every app
-- open failed, about 627k failed subscription attempts since 2026-09-23. Live
-- friend-request and reaction updates have never fired; users only saw them
-- after a refresh.
--
-- WHAT THIS DOES
-- Adds both tables to the publication. Server-side, so every installed build
-- starts receiving events on its next channel join. Load is small: both
-- bindings are filtered to the user, the SELECT policies are plain
-- uid comparisons, and the tables see a few hundred writes a day. Replica
-- identity stays default, so DELETE payloads carry only the primary key.

set lock_timeout = '5s';

do $$
declare
  t text;
begin
  foreach t in array array['friendships', 'quick_reactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

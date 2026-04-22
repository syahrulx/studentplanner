-- Infrastructure for community push triggers.
--   1) Enable pg_net so triggers can fire HTTP requests to the Edge Function.
--   2) Use Supabase Vault to store the Edge Function URL + service-role key.
--   3) Define `public._send_community_push(payload jsonb)` helper that Postgres triggers call.
--
-- ─── One-time operator setup (run MANUALLY in the Supabase SQL editor AFTER applying this
--      migration; these secrets cannot be committed to the repo):
--
--   select vault.create_secret(
--     'https://<your-project-ref>.supabase.co/functions/v1/community-push',
--     'community_push_url'
--   );
--   select vault.create_secret(
--     '<your-service-role-key>',
--     'community_push_service_key'
--   );
--
-- To rotate:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'community_push_service_key'),
--     '<new-service-role-key>',
--     'community_push_service_key'
--   );
--
-- Removal (if you ever want to disable community push entirely):
--   delete from vault.secrets where name in ('community_push_url','community_push_service_key');
--
-- The helper silently no-ops if either secret is missing, so development/staging databases
-- without secrets configured will simply skip remote push instead of erroring.

create extension if not exists pg_net with schema extensions;

-- `_send_community_push` runs as SECURITY DEFINER so triggers can call it regardless of the
-- table's RLS policies. It must be owned by `postgres` (the default in Supabase migrations)
-- so it can read from `vault.decrypted_secrets` and call `net.http_post`.
create or replace function public._send_community_push(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  fn_url  text;
  svc_key text;
begin
  -- Short-circuit when called with obviously empty payload to avoid useless HTTP calls.
  if payload is null
     or payload->'recipientUserIds' is null
     or jsonb_array_length(payload->'recipientUserIds') = 0 then
    return;
  end if;

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
  -- A failed push MUST NOT roll back the original insert/update.
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

comment on function public._send_community_push(jsonb) is
  'Internal helper that POSTs to the community-push Edge Function via pg_net. '
  'Reads URL + service key from Vault. Safe no-op if Vault secrets missing.';

-- Only trigger functions (and postgres) should be able to call this helper.
revoke all on function public._send_community_push(jsonb) from public;
revoke all on function public._send_community_push(jsonb) from anon, authenticated;
grant  execute on function public._send_community_push(jsonb) to postgres, service_role;

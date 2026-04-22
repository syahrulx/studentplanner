# community-push

Edge Function that fans out community events to Expo push tokens.

## What it does

- Accepts POSTs from Postgres triggers (`public._send_community_push`) **or** from the
  client with a user JWT.
- Looks up `expo_push_token` + per-category opt-in flags on each `recipientUserIds` profile.
- Sends batches (≤ 100) to `https://exp.host/--/api/v2/push/send` with `channelId=community`.
- Uses `collapseKey` (forwarded as `collapseId`) so repeat events don't spam the device.

## Deploy (first time)

```bash
# 1) Apply the migrations (adds opt-in columns, helper, triggers)
npx supabase db push
# or: psql "$DB_URL" -f supabase/migrations/051_profiles_community_push_prefs.sql
#              -f supabase/migrations/052_community_push_helper.sql
#              -f supabase/migrations/053_community_push_triggers.sql

# 2) Deploy the function
npx supabase functions deploy community-push

# 3) (Optional) Enhanced Push Security from Expo
#    https://docs.expo.dev/push-notifications/sending-notifications/#additional-security
npx supabase secrets set EXPO_ACCESS_TOKEN=<expo-access-token>
```

## Wire up Postgres → Edge Function (Vault)

Run this **once per environment** in the SQL editor, substituting your values:

```sql
-- URL the Postgres trigger will call
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/community-push',
  'community_push_url'
);

-- Service role key the trigger will use as Bearer token (bypasses JWT check)
select vault.create_secret(
  '<service-role-key>',
  'community_push_service_key'
);
```

Rotate:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'community_push_service_key'),
  '<new-service-role-key>',
  'community_push_service_key'
);
```

If either secret is missing the helper silently no-ops — safe for local/staging.

## Smoke test

```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/community-push" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  --data '{
    "recipientUserIds": ["<a-user-uuid>"],
    "title":            "Test push",
    "body":             "Hello from community-push",
    "category":         "reaction",
    "collapseKey":      "test:1"
  }'
```

Expect `{"sent":1,"batches":1,"results":[...]}` and a banner on the device for that user
(if they have `community_push_enabled = true` and a valid `expo_push_token`).

## Trigger → Edge Function payload reference

| Trigger                                    | `data.type`                  | Recipients                       |
| ------------------------------------------ | ---------------------------- | -------------------------------- |
| `trg_quick_reaction_push`                  | `reaction`                   | `receiver_id`                    |
| `trg_friendship_push_insert`               | `friend_request`             | `addressee_id`                   |
| `trg_friendship_push_accept`               | `friend_accepted`            | `requester_id`                   |
| `trg_circle_invite_push_insert`            | `circle_invitation`          | `invitee_id`                     |
| `trg_circle_invite_push_response`          | `circle_invitation_response` | `inviter_id`                     |
| `trg_shared_task_push_insert`              | `shared_task`                | direct recipient OR circle members |
| `trg_shared_task_push_status`              | `shared_task_response`       | `owner_id`                       |
| `trg_shared_task_push_complete`            | `shared_task_completed`      | `owner_id`                       |

Foreground tap-routing for all of these lives in `app/_layout.tsx`.

## User opt-out

Settings UI: **Community → Settings → Push Notifications**.

Columns on `public.profiles`:

- `community_push_enabled` (master switch)
- `push_reactions_enabled`, `push_friend_requests_enabled`, `push_circle_enabled`, `push_shared_task_enabled`

All default to `true` so existing users keep working with no migration work on the client.

## Troubleshooting

- **No push received, no error logged** → secrets missing in Vault; helper is no-op. Run the
  `vault.create_secret` block above.
- **`DeviceNotRegistered`** in receipts → the user reinstalled; `pushRegistration.ts` will
  resync the token next launch. Consider a scheduled job to prune stale tokens.
- **Duplicate banners in foreground** → the client-side realtime local push should already be
  guarded by `SERVER_COMMUNITY_PUSH_ENABLED` in `CommunityContext.tsx`. If you added a new
  local `scheduleNotificationAsync` call, guard it behind the same constant.

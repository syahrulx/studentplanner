# Planning: Auto-sync new tasks to friends (“full share stream”)

This document plans a feature where a user can opt in so **tasks they create later** are **automatically** offered to a chosen friend (or circle), instead of only sharing the current snapshot via `shareAllTasksWithFriend`.

**Current behavior (baseline):** Each row in `shared_tasks` links one `task_id` to one `recipient_id` at share time. New tasks require a **new** share action.

---

## 1. Problem statement

- Users expect “sync with friend” to behave like a **live feed**: new homework / tasks should show up for the friend **without** re-running bulk share.
- Today, only **already shared** task IDs appear on the friend’s side; **future** tasks do not.

---

## 2. Goals

| ID | Goal |
|----|------|
| G1 | User can enable **automatic sharing** of **new** tasks to **one or more** friends (or a circle). |
| G2 | Friend receives **pending** shared tasks (same accept/decline flow as today) or configurable default. |
| G3 | User can **revoke** auto-share per friend (and optionally bulk “pause all”). |
| G4 | **Security:** only authenticated owner can create shares; RLS enforces recipient/owner rules. |
| G5 | **No surprise spam:** clear consent copy; optional friend-side “auto-accept from this person”. |

## 3. Non-goals (v1)

- Sharing **retroactively** all historical tasks when toggling on (optional “backfill” can be phase 2).
- Real-time sub-second sync (polling / push as today is enough).
- Editing friend’s copy of the task as a separate entity (still one `tasks` row owned by sharer).

---

## 4. UX overview

### 4.1 Owner (student who shares)

- **Entry points**
  - Planner: after “Share all with friend” success → CTA **“Always share new tasks with [Name]”** (one tap opt-in).
  - Settings / Community: **Shared tasks** → **Auto-share** → pick friend(s) or “Remove”.
- **Controls**
  - Toggle per friend: **Auto-share new tasks** ON/OFF.
  - Optional: **Include only** filters later (course, tag) — phase 2.

### 4.2 Recipient (friend)

- Same **incoming** queue as today (`shared_tasks.status = 'pending'`).
- Optional v2: **Settings → Auto-accept** shares from user X (skips pending for that owner).

### 4.3 Copy / consent

- Owner sees: “New tasks you add will be sent to [Name] for approval (or as accepted if they enable auto-accept).”
- Recipient sees on first auto share: “[Name] enabled sharing new tasks with you.”

---

## 5. Data model options

### Option A — **Stream table** (recommended)

New table: `task_share_streams` (name TBD)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `owner_id` | uuid FK → auth.users | Who creates tasks |
| `recipient_id` | uuid FK | Friend user id |
| `enabled` | boolean | Master toggle |
| `created_at`, `updated_at` | timestamptz | |
| **Unique** | `(owner_id, recipient_id)` | One row per pair |

**Optional:** `default_status` enum: `pending` | `accepted` (if recipient auto-accept exists).

**Behavior:** On `INSERT` into `tasks` for `owner_id`, if a stream exists and `enabled`, **insert** into `shared_tasks` (same shape as today) for that `task_id` + `recipient_id`, unless duplicate.

**Pros:** Clear semantics, easy to query “who gets my new tasks”.  
**Cons:** One more table + migration + RLS.

### Option B — **Flag on friendships**

Add `auto_share_tasks` on `friendships` (only when `accepted`).

**Pros:** No new table.  
**Cons:** Couples feature to friendship row; circle-based auto-share still needs another mechanism.

### Option C — **Reuse metadata only**

Store JSON in `profiles` or a `user_settings` blob: `{ autoShareTaskRecipients: [uuid] }`.

**Pros:** Fast to ship.  
**Cons:** Harder to index, audit, and enforce RLS cleanly.

**Recommendation:** **Option A** for clarity and circles extension later (`recipient_id` could become “broadcast” via circle membership expansion on each new task — phase 2).

---

## 6. Application flow (owner creates task)

**Trigger:** Successful local + remote persist of a new `tasks` row for user `uid`.

1. Load enabled streams: `SELECT * FROM task_share_streams WHERE owner_id = uid AND enabled = true`.
2. For each `recipient_id`:
   - If **no** `shared_tasks` row exists for `(task_id, owner_id, recipient_id)` in a non-declined state, **insert** `shared_tasks` (status `pending` or policy default).
3. Fire notification (reuse existing shared-task notification pipeline).

**Where to hook**

- `AppContext` / `addTask` (after `taskDb.upsertTask` success), **or**
- Supabase **Edge Function** triggered on `tasks` INSERT (stronger guarantee if tasks inserted from multiple clients) — heavier ops.

**Recommendation for v1:** Hook in **client** after successful task create (same place planner uses), plus idempotent insert checks to avoid duplicates.

---

## 7. API & modules

| Layer | Responsibility |
|-------|----------------|
| `communityApi.ts` | `createTaskShareStream`, `deleteTaskShareStream`, `listMyTaskShareStreams`, `setTaskShareStreamEnabled` |
| `CommunityContext.tsx` | Expose streams + refresh; optional optimistic UI |
| `AppContext.tsx` (or task service) | After `addTask`, call `syncNewTaskToStreams(taskId)` |
| Notifications | Reuse `fireSharedTaskNotification` / existing INSERT listener on `shared_tasks` |

---

## 8. Security (RLS) sketch

- **`task_share_streams`**
  - **SELECT/INSERT/UPDATE/DELETE:** `owner_id = auth.uid()` for owner; recipient might **SELECT** rows where they are `recipient_id` (read-only) to show “X shares new tasks with you”.
- **`shared_tasks`**
  - Keep existing policies; inserts from owner must still satisfy `owner_id = auth.uid()`.

**Server-side duplicate prevention:** unique partial index on `(task_id, owner_id, recipient_id)` where `status != 'declined'` (if business rules allow re-share after decline — define explicitly).

---

## 9. Edge cases

| Case | Handling |
|------|----------|
| Friend removes friendship | Disable or delete streams involving that pair; optional cron cleanup. |
| Owner deletes task | Existing behavior; `shared_tasks` may orphan — delete link rows or leave with null task (prefer **delete** `shared_tasks` where `task_id` deleted). |
| Owner toggles stream off mid-week | No retroactive removal of already shared tasks; only **new** tasks stop. |
| Duplicate share | Idempotent insert or catch unique violation. |
| Bulk manual share + stream | Skip if already shared (same as `shareAllTasksWithFriend` today). |
| Circle auto-share (phase 2) | Expand to N recipients; watch rate limits and notification noise. |

---

## 10. Notifications

- Reuse **INSERT** on `shared_tasks` for push (already in `CommunityContext`).
- Optional: throttle “many tasks in one minute” into one summary notification.

---

## 11. Migration & backward compatibility

- Existing `shared_tasks` rows unchanged.
- New table migration `00x_task_share_streams.sql`.
- App: streams **off** by default; no behavior change until user opts in.

---

## 12. Phased rollout

| Phase | Scope |
|-------|--------|
| **MVP** | Table + RLS + owner toggle per friend + client hook on `addTask` + duplicate guard |
| **v1.1** | Planner CTA + Settings screen + analytics events |
| **v1.2** | Recipient auto-accept; optional backfill wizard (“Share all existing tasks now”) |
| **v2** | Circle streams, filters by course/tag |

---

## 13. Testing checklist

- [ ] New task → one pending share per enabled stream recipient.
- [ ] Toggle off → new task → no new share.
- [ ] Declined share → policy for whether stream can re-offer same task (recommend: no duplicate until new task id).
- [ ] Unfriend → stream disabled or removed.
- [ ] Offline create → sync later: hook runs after successful upsert (or queue).

---

## 14. Open questions

1. Should **first** auto-shared task require friend **accept** once for the **stream**, or every task stays pending?
2. **Circle:** one stream row per circle vs expanding to members on each task?
3. **Performance:** max recipients per owner cap (e.g. 20)?

---

## 15. Summary

**Yes, it’s possible** to make later-added tasks appear for a friend **automatically** by introducing a **persistent opt-in** (stream) and **creating `shared_tasks` rows on each new task** for enabled recipients. This complements today’s one-off and bulk share without breaking existing data.

**Next step:** confirm product answers for §14, then implement MVP (Phase table + RLS + `addTask` hook).

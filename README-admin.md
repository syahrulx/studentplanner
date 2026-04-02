# GradeUp Admin Dashboard (Supabase)

This repo now includes a standalone **admin-only** dashboard at `admin-web/`.

## 1) Prerequisites
- Node.js installed
- A Supabase project (same project as `gradeup-mobile` recommended)
- Supabase CLI (optional but recommended): `npm i -g supabase`

## 2) Database setup (SQL migrations)
The admin dashboard schema is added in:
- `gradeup-mobile/supabase/migrations/018_admin_dashboard.sql`

This migration adds:
- `admin_users` (who can access admin dashboard)
- `universities`, `university_mappings`, `admin_logs`, `admin_settings`, `courses`
- `profiles.status` + `profiles.created_at`
- `public.is_admin()` helper + RLS policies
- `public.admin_dashboard_overview()` RPC for dashboard cards

### Apply migrations
If you use Supabase CLI locally:

```bash
cd gradeup-mobile
supabase db push
```

Or apply the SQL manually in Supabase SQL Editor.

## 3) Create an admin account
1. In Supabase Dashboard → **Authentication** → create a user (email + password).
2. Insert this user into `public.admin_users` (SQL Editor):

```sql
insert into public.admin_users (user_id, email, role)
values ('<AUTH_USER_UUID>', '<EMAIL>', 'super_admin');
```

Replace:
- `<AUTH_USER_UUID>` with the Auth user id
- `<EMAIL>` with the same email

## 4) Edge Functions
We added admin Edge Functions under:
- `gradeup-mobile/supabase/functions/admin_test_fetch` (proxy “Test Fetch” requests safely)
- `gradeup-mobile/supabase/functions/admin_users` (list/search/disable/ban/delete users)

Deploy with:

```bash
cd gradeup-mobile
supabase functions deploy admin_test_fetch
supabase functions deploy admin_users
```

These functions require the standard secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Set them (one-time) with:

```bash
supabase secrets set SUPABASE_URL="https://<project>.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
```

## 5) Run the admin website
1. In `admin-web/`, create a `.env` file (not committed) with:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

2. Start dev server:

```bash
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173` or `http://localhost:5174`).

## Notes on security
- The dashboard uses **Supabase Auth** for login.\n- Admin access is enforced by **RLS + `admin_users`**.\n- Privileged operations (delete auth users, proxy external API calls) are done via **Edge Functions** using the service role key (never in the browser).\n+

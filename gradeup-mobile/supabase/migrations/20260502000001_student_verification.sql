-- ============================================================================
-- Student Verification + Content Moderation for Services
-- ============================================================================
-- 1. student_verification_requests table — tracks non-edu users asking for
--    access to the Services marketplace.
-- 2. profiles.student_verified — boolean flag set by admin approval or
--    auto-detected from auth email domain.
-- 3. content_moderation_check() — trigger function that blocks explicit/18+
--    content from being posted as a service.
-- ============================================================================

-- ─── 1. Verification Requests ──────────────────────────────────────────────

create table if not exists public.student_verification_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  student_email text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  admin_note    text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  unique(user_id)
);

comment on table  public.student_verification_requests is
  'Pending / approved / rejected student-email verification requests for users who signed up with non-edu emails.';

-- RLS
alter table public.student_verification_requests enable row level security;

-- Users can see their own request
drop policy if exists "Users can view own verification" on public.student_verification_requests;
create policy "Users can view own verification"
  on public.student_verification_requests for select
  using (auth.uid() = user_id);

-- Users can insert their own request (one per user, enforced by unique)
drop policy if exists "Users can submit verification" on public.student_verification_requests;
create policy "Users can submit verification"
  on public.student_verification_requests for insert
  with check (auth.uid() = user_id);

-- Admins (via service role) can do anything — no RLS policy needed for admin calls.

-- ─── 2. Profiles: student_verified flag ────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'student_verified'
  ) then
    alter table public.profiles
      add column student_verified boolean not null default false;
  end if;
end $$;

comment on column public.profiles.student_verified is
  'True if user signed up with an edu email or was manually approved by an admin.';

-- ─── 3. Auto-verify on sign-up if email is .edu / .student / known domains ─

-- Helper RPC: check if current user's email is a student email
create or replace function public.is_student_email()
returns boolean
language plpgsql security definer
as $$
declare
  v_email text;
begin
  select email into v_email
  from auth.users
  where id = auth.uid();

  if v_email is null then return false; end if;

  -- Common student email patterns
  return (
    v_email ilike '%.edu'      or
    v_email ilike '%.edu.__'   or  -- .edu.my, .edu.sg, etc.
    v_email ilike '%@student.%' or
    v_email ilike '%@students.%' or
    v_email ilike '%@sis.%'    or
    v_email ilike '%@siswa.%'  or
    v_email ilike '%@isiswa.%' or
    v_email ilike '%@graduate.%' or
    v_email ilike '%@imail.%'  or
    v_email ilike '%@sd.%'     or
    v_email ilike '%@live.%'
  );
end;
$$;

-- ─── 4. OTP Verification Table ─────────────────────────────────────────────

create table if not exists public.student_otp_verifications (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  student_email text not null,
  otp_code      text not null,
  expires_at    timestamptz not null default (now() + interval '10 minutes'),
  created_at    timestamptz not null default now(),
  primary key (user_id)
);

comment on table public.student_otp_verifications is
  'Stores 6-digit OTP codes for student email verification.';

-- RLS
alter table public.student_otp_verifications enable row level security;

-- Users can see their own verification row
drop policy if exists "Users can view own otp" on public.student_otp_verifications;
create policy "Users can view own otp"
  on public.student_otp_verifications for select
  using (auth.uid() = user_id);

-- ─── 5. RPC: Generate OTP ────────────────────────────────────────────────

create or replace function public.send_student_verification_otp(p_student_email text)
returns jsonb
language plpgsql security definer
as $$
declare
  v_otp text;
begin
  -- 1. Check if already verified
  if exists (
    select 1 from public.profiles where id = auth.uid() and student_verified = true
  ) then
    return jsonb_build_object('status', 'already_verified');
  end if;

  -- 2. Generate 6-digit random code
  v_otp := lpad(floor(random() * 1000000)::text, 6, '0');

  -- 3. Upsert into verifications table
  insert into public.student_otp_verifications (user_id, student_email, otp_code, expires_at)
  values (auth.uid(), p_student_email, v_otp, now() + interval '10 minutes')
  on conflict (user_id) do update
  set student_email = excluded.student_email,
      otp_code = excluded.otp_code,
      expires_at = excluded.expires_at,
      created_at = now();

  -- Note: In a real environment, you'd trigger a Supabase Edge Function or 
  -- an HTTP request here to actually SEND the email via Resend/SendGrid/etc.
  -- For now, we return success. You can see the code in the DB for testing.

  return jsonb_build_object('status', 'sent', 'email', p_student_email);
end;
$$;

-- ─── 6. RPC: Verify OTP ──────────────────────────────────────────────────

create or replace function public.verify_student_otp(p_code text)
returns jsonb
language plpgsql security definer
as $$
declare
  v_record record;
begin
  -- 1. Find the pending OTP
  select * into v_record
  from public.student_otp_verifications
  where user_id = auth.uid()
  limit 1;

  if v_record is null then
    return jsonb_build_object('status', 'error', 'message', 'No pending verification found.');
  end if;

  -- 2. Check if expired
  if v_record.expires_at < now() then
    return jsonb_build_object('status', 'expired', 'message', 'Code has expired. Please request a new one.');
  end if;

  -- 3. Check code
  if v_record.otp_code != p_code then
    return jsonb_build_object('status', 'invalid', 'message', 'Invalid verification code.');
  end if;

  -- 4. Success! Mark profile as verified
  update public.profiles
  set student_verified = true
  where id = auth.uid();

  -- 5. Create a verification request record as well (for audit/admin history)
  insert into public.student_verification_requests (user_id, student_email, status, reviewed_at, admin_note)
  values (auth.uid(), v_record.student_email, 'approved', now(), 'Verified via OTP')
  on conflict (user_id) do update
  set student_email = excluded.student_email,
      status = 'approved',
      reviewed_at = now(),
      admin_note = 'Verified via OTP';

  -- 6. Cleanup OTP
  delete from public.student_otp_verifications where user_id = auth.uid();

  return jsonb_build_object('status', 'verified');
end;
$$;

-- ─── 7. Admin RPCs ─────────────────────────────────────────────────────────

-- Approve verification
create or replace function public.admin_approve_verification(p_request_id uuid)
returns void
language plpgsql security definer
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.student_verification_requests
  where id = p_request_id;

  if v_user_id is null then
    raise exception 'Verification request not found';
  end if;

  update public.student_verification_requests
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_request_id;

  update public.profiles
  set student_verified = true
  where id = v_user_id;
end;
$$;

-- Reject verification
create or replace function public.admin_reject_verification(
  p_request_id uuid,
  p_note text default null
)
returns void
language plpgsql security definer
as $$
begin
  update public.student_verification_requests
  set status = 'rejected',
      admin_note = p_note,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_request_id;
end;
$$;

-- ─── 6. Content Moderation Trigger ─────────────────────────────────────────

create or replace function public.check_service_content()
returns trigger
language plpgsql
as $$
declare
  v_text text;
  v_banned text[] := array[
    -- Sexual / 18+ services
    'sex', 'sexual', 'escort', 'prostitut', 'hookup', 'hook up',
    'onlyfans', 'only fans', 'sugar daddy', 'sugar baby', 'sugarbaby',
    'sugardaddy', 'sugar mommy', 'sugarmommy',
    'massage happy ending', 'happy ending',
    'erotic', 'porn', 'xxx', 'nude', 'nudes', 'blowjob', 'handjob',
    'bdsm', 'fetish', 'dominatrix', 'cam girl', 'camgirl',
    'booty call', 'bootycall', 'friends with benefits', 'fwb',
    'one night stand',
    -- Drugs / illegal
    'drugs', 'weed', 'ganja', 'marijuana', 'cocaine', 'meth',
    'ketamine', 'ecstasy', 'mdma', 'lsd', 'heroin',
    'dadah', 'syabu',
    -- Weapons
    'gun', 'firearm', 'weapon', 'explosive',
    -- Academic fraud
    'write my exam', 'take my exam', 'sit my exam',
    'fake degree', 'fake certificate', 'fake diploma',
    -- Gambling
    'gambling', 'judi', 'casino', 'sports betting', 'bet365'
  ];
  v_word text;
begin
  -- Only check services
  if new.post_type != 'service' then
    return new;
  end if;

  v_text := lower(coalesce(new.title, '') || ' ' || coalesce(new.body, ''));

  foreach v_word in array v_banned loop
    if v_text like '%' || v_word || '%' then
      raise exception 'This content violates our community guidelines. Explicit, illegal, or prohibited services are not allowed.'
        using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

-- Attach trigger
drop trigger if exists trg_check_service_content on public.community_posts;
create trigger trg_check_service_content
  before insert or update on public.community_posts
  for each row
  execute function public.check_service_content();

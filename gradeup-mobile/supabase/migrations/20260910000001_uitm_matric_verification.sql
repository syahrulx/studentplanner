-- ============================================================================
-- UiTM matric ownership verification
-- ============================================================================
-- The timetable connect flow fetches a student's schedule from public UiTM
-- sources using their matric alone. Nothing in that request proves the person
-- typing the matric owns it, so we gate the fetch behind an OTP sent to
-- {matric}@student.uitm.edu.my.
--
-- This is deliberately a *different* claim from `profiles.student_verified`
-- (used by Services), which only means "this person is some student somewhere"
-- and is granted for any institutional-looking address. Owning matric X is
-- narrower, so it gets its own columns.
--
-- 1. profiles.verified_matric / verified_matric_at — the proven matric.
-- 2. student_otp_verifications.attempts — brute-force guard (6-digit codes
--    live for 10 minutes; without a cap they are trivially guessable).
-- 3. verify_uitm_matric_otp() — validates the code and records the matric.
-- ============================================================================

-- ─── 1. Profile columns ────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists verified_matric text;

alter table public.profiles
  add column if not exists verified_matric_at timestamptz;

comment on column public.profiles.verified_matric is
  'UiTM matric this user proved ownership of via an OTP sent to {matric}@student.uitm.edu.my.';

comment on column public.profiles.verified_matric_at is
  'When verified_matric was last confirmed.';

-- ─── 2. Attempt counter on the shared OTP table ────────────────────────────

alter table public.student_otp_verifications
  add column if not exists attempts integer not null default 0;

comment on column public.student_otp_verifications.attempts is
  'Incorrect verification attempts for the current code. Codes lock at 5.';

-- ─── 3. RPC: verify a matric OTP ───────────────────────────────────────────

create or replace function public.verify_uitm_matric_otp(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record record;
  v_matric text;
begin
  select * into v_record
  from public.student_otp_verifications
  where user_id = auth.uid()
  limit 1;

  if v_record is null then
    return jsonb_build_object('status', 'error', 'message', 'No pending verification found. Request a new code.');
  end if;

  if v_record.expires_at < now() then
    delete from public.student_otp_verifications where user_id = auth.uid();
    return jsonb_build_object('status', 'expired', 'message', 'That code has expired. Request a new one.');
  end if;

  if coalesce(v_record.attempts, 0) >= 5 then
    delete from public.student_otp_verifications where user_id = auth.uid();
    return jsonb_build_object('status', 'locked', 'message', 'Too many incorrect attempts. Request a new code.');
  end if;

  if v_record.otp_code <> p_code then
    update public.student_otp_verifications
    set attempts = coalesce(attempts, 0) + 1
    where user_id = auth.uid();
    return jsonb_build_object('status', 'invalid', 'message', 'That code is not right. Check and try again.');
  end if;

  -- The matric is only trustworthy because the code went to the matric's own
  -- UiTM inbox — reject anything issued against a different domain.
  if lower(v_record.student_email) not like '%@student.uitm.edu.my' then
    return jsonb_build_object(
      'status', 'error',
      'message', 'This code was not issued for a UiTM student address.'
    );
  end if;

  v_matric := split_part(v_record.student_email, '@', 1);

  update public.profiles
  set verified_matric = v_matric,
      verified_matric_at = now(),
      -- Proving a UiTM student inbox also satisfies the weaker Services check.
      student_verified = true
  where id = auth.uid();

  insert into public.student_verification_requests
    (user_id, student_email, status, reviewed_at, admin_note)
  values
    (auth.uid(), v_record.student_email, 'approved', now(), 'Verified via UiTM matric OTP')
  on conflict (user_id) do update
  set student_email = excluded.student_email,
      status = 'approved',
      reviewed_at = now(),
      admin_note = 'Verified via UiTM matric OTP';

  delete from public.student_otp_verifications where user_id = auth.uid();

  return jsonb_build_object('status', 'verified', 'matric', v_matric);
end;
$$;

grant execute on function public.verify_uitm_matric_otp(text) to authenticated;

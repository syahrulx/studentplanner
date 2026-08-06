-- Fix: users who have ever submitted a support report CANNOT delete their
-- account. App Store guideline 5.1.1(v) requires in-app account deletion to
-- work, so this is a review-rejection risk as well as a user-trust problem.
--
-- public.support_reports.reporter_id is declared:
--     reporter_id uuid not null references auth.users(id) on delete restrict
--       (202608050001_safe_support_report_submission.sql)
--   -- and in the older definition --
--     reporter_id uuid not null references auth.users(id) on delete set null
--       (20260512021500_support_reports.sql)
--
-- Both abort the delete: RESTRICT refuses outright, and SET NULL violates the
-- NOT NULL. So supabaseAdmin.auth.admin.deleteUser() in the delete_account
-- Edge Function fails, the function returns 500, and Settings shows "Could not
-- delete account" forever with no way for the user to proceed.
--
-- Every other user-owned FK in this schema is ON DELETE CASCADE / SET NULL.
-- The correct behaviour here is SET NULL (not CASCADE): support history should
-- survive the account so admins keep an audit trail -- which is exactly why
-- reporter_name_snapshot / reporter_email_snapshot exist (see the schema
-- comment in 20260512021500_support_reports.sql).
--
-- Idempotent and non-destructive: only the constraint definition and the
-- column's nullability change. No rows are read, written, or deleted.

do $$
declare
  v_conname text;
begin
  -- Drop whichever FK constraint name this database actually ended up with.
  select con.conname into v_conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any (con.conkey)
  where nsp.nspname = 'public'
    and rel.relname = 'support_reports'
    and con.contype = 'f'
    and att.attname = 'reporter_id'
  limit 1;

  if v_conname is not null then
    execute format('alter table public.support_reports drop constraint %I', v_conname);
  end if;
end $$;

-- Required for ON DELETE SET NULL to be legal.
alter table public.support_reports alter column reporter_id drop not null;

alter table public.support_reports
  add constraint support_reports_reporter_id_fkey
  foreign key (reporter_id) references auth.users(id) on delete set null;

-- support_report_messages.author_id is already nullable with ON DELETE SET
-- NULL (202608030002), so replies survive account deletion correctly and need
-- no change here.

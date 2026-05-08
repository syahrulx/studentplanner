-- Signup screen reads universities before auth; allow anon read.
-- Writes remain admin-only via existing universities_admin_* policies.

drop policy if exists "universities_mobile_read" on public.universities;

create policy "universities_mobile_read"
  on public.universities
  for select
  to anon, authenticated
  using (true);


-- =============================================================================
-- Admin website: manage RenTaman bundles and outfit presets.
-- Run after the website's 202610140004 (which made study_world_bundles).
--
-- Until now nobody could change study_world_bundles from outside the Supabase
-- dashboard, and only 'available' rows could be read. This lets admins
-- (public.is_admin()) read every row, including hidden ones, and add, edit
-- and delete rows, the same way the admin website already manages
-- study_world_items and study_world_coin_packs.
--
-- Players are not affected: they still read only 'available' rows and still
-- cannot write. Buying a bundle (study_world_buy_bundle) is unchanged.
--
-- Adds 1 empty column (updated_by), 4 admin policies and the same change-log
-- trigger the other shop tables use, so every admin change shows in the Log
-- tab. No rows are changed or deleted. Safe to run twice.
-- =============================================================================

-- The shared change-log trigger stamps updated_by on every save.
alter table public.study_world_bundles add column if not exists updated_by uuid;

drop policy if exists study_world_bundles_admin_read on public.study_world_bundles;
create policy study_world_bundles_admin_read on public.study_world_bundles
  for select to authenticated using ((select public.is_admin()));

drop policy if exists study_world_bundles_admin_insert on public.study_world_bundles;
create policy study_world_bundles_admin_insert on public.study_world_bundles
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists study_world_bundles_admin_update on public.study_world_bundles;
create policy study_world_bundles_admin_update on public.study_world_bundles
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists study_world_bundles_admin_delete on public.study_world_bundles;
create policy study_world_bundles_admin_delete on public.study_world_bundles
  for delete to authenticated using ((select public.is_admin()));

-- Row-level security above still blocks everyone who is not an admin.
grant insert, update, delete on public.study_world_bundles to authenticated;

drop trigger if exists trg_study_world_bundles_audit on public.study_world_bundles;
create trigger trg_study_world_bundles_audit
  before insert or update or delete on public.study_world_bundles
  for each row execute function public.study_world_config_audit();

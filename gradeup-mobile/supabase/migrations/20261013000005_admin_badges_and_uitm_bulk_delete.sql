-- =============================================================================
-- 1. Sidebar badge: User Reports now counts only OPEN reports, matching the
--    page's default list. It used to add "in progress" reports with a newer
--    user reply, so it showed 5 while the page listed 4.
-- 2. admin_delete_uitm_calendar_contributions(): delete UiTM community
--    calendar submissions in bulk from Academic Calendars → Community.
--    Admins only. Nothing else references these rows. Approved ones are what
--    UiTM students currently see, so the admin page warns before deleting
--    them. Every bulk delete is logged in admin_logs with the reason and how
--    many of each status were removed.
-- Run AFTER 20261013000004_admin_sidebar_counts.sql.
-- =============================================================================

create or replace function public.admin_sidebar_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_reports int := 0;
  v_confessions int := 0;
  v_share_rewards int := 0;
  v_services int := 0;
  v_events int := 0;
  v_institutions int := 0;
  v_calendars int := 0;
  v_users int := 0;
  v_n int;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  -- Same as the User Reports page's default view (Status: Open), so the
  -- badge and the list always agree.
  begin
    select count(*) into v_user_reports from public.support_reports r where r.status = 'open';
  exception when others then v_user_reports := 0;
  end;

  begin
    select count(*) into v_confessions
      from public.confessions c
     where c.status = 'flagged'
        or (c.status <> 'removed'
            and cardinality(coalesce(c.suspect_terms, '{}')) > 0
            and c.suspect_reviewed_at is null);
  exception when others then
    begin
      select count(*) into v_confessions from public.confessions c where c.status = 'flagged';
    exception when others then v_confessions := 0;
    end;
  end;
  begin
    select count(*) into v_n from public.confession_comments cc where cc.status = 'flagged';
    v_confessions := v_confessions + v_n;
  exception when others then null;
  end;

  begin
    select count(*) into v_share_rewards from public.social_share_claims s where s.status = 'pending';
  exception when others then v_share_rewards := 0;
  end;

  begin
    select count(distinct sr.service_id) into v_services from public.service_reports sr;
  exception when others then v_services := 0;
  end;

  begin
    select count(*) into v_events
      from public.community_posts p
     where p.status = 'flagged' and p.post_type in ('event', 'memo');
  exception when others then v_events := 0;
  end;

  begin
    select count(*) into v_institutions from public.authority_requests a where a.status = 'pending';
  exception when others then v_institutions := 0;
  end;

  begin
    select count(*) into v_calendars from public.uitm_calendar_contributions u where u.status = 'pending';
  exception when others then v_calendars := 0;
  end;

  begin
    select count(*) into v_users from public.student_verification_requests v where v.status = 'pending';
  exception when others then v_users := 0;
  end;

  return jsonb_build_object(
    'user_reports', v_user_reports,
    'confessions', v_confessions,
    'share_rewards', v_share_rewards,
    'services', v_services,
    'events', v_events,
    'institutions', v_institutions,
    'calendars', v_calendars,
    'users', v_users
  );
end;
$$;

revoke all on function public.admin_sidebar_counts() from public, anon;
grant execute on function public.admin_sidebar_counts() to authenticated;


create or replace function public.admin_delete_uitm_calendar_contributions(p_ids uuid[], p_reason text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending int;
  v_approved int;
  v_rejected int;
  v_deleted int;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason (at least 3 characters).' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return 0;
  end if;
  if array_length(p_ids, 1) > 1000 then
    raise exception 'Delete at most 1,000 at a time.' using errcode = 'P0001';
  end if;

  select count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'approved'),
         count(*) filter (where status = 'rejected')
    into v_pending, v_approved, v_rejected
    from public.uitm_calendar_contributions
   where id = any(p_ids);

  delete from public.uitm_calendar_contributions where id = any(p_ids);
  get diagnostics v_deleted = row_count;

  insert into public.admin_logs (type, status, meta)
  values ('api_request', 'success', jsonb_build_object(
    'action', 'admin_delete_uitm_calendar_contributions',
    'actor', auth.uid(),
    'reason', btrim(p_reason),
    'deleted', v_deleted,
    'pending', v_pending,
    'approved', v_approved,
    'rejected', v_rejected));

  return v_deleted;
end;
$$;

revoke all on function public.admin_delete_uitm_calendar_contributions(uuid[], text) from public, anon;
grant execute on function public.admin_delete_uitm_calendar_contributions(uuid[], text) to authenticated;

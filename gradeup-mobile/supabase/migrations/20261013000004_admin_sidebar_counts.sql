-- =============================================================================
-- Admin website: red "waiting" badges in the sidebar.
--
-- One read-only, admin-only call that counts what is waiting for an admin in
-- each section. Each count is wrapped on its own, so a table that does not
-- exist (or a column renamed later) gives 0 for that section instead of
-- breaking the rest. Changes no data.
--
--   user_reports    support_reports open, or the user replied after the admin
--   confessions     confessions/comments flagged, plus unreviewed "suspect"
--   share_rewards   social_share_claims pending
--   services        services with at least one report (service_reports)
--   events          event/memo posts flagged (community_posts.status)
--   institutions    authority_requests pending
--   calendars       uitm_calendar_contributions pending
--   users           student_verification_requests pending
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

  begin
    select count(*) into v_user_reports
      from public.support_reports r
     where r.status = 'open'
        or (r.status in ('open', 'in_progress')
            and r.last_user_reply_at is not null
            and r.last_user_reply_at > coalesce(r.last_admin_reply_at, '-infinity'::timestamptz));
  exception when others then
    begin
      select count(*) into v_user_reports from public.support_reports r where r.status = 'open';
    exception when others then v_user_reports := 0;
    end;
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

-- Fix 5: Create a view that joins quiz_participants with profiles in one query
-- eliminates the N+1 double-fetch pattern in getSessionParticipants.
-- After running this migration, update getSessionParticipants to query this view.

create or replace view quiz_participants_with_profile as
  select
    qp.id,
    qp.session_id,
    qp.user_id,
    qp.score,
    qp.answers,
    qp.finished,
    qp.joined_at,
    p.name   as profile_name,
    p.avatar_url as profile_avatar_url
  from quiz_participants qp
  left join profiles p on p.id = qp.user_id;

-- Grant read access to authenticated users
grant select on quiz_participants_with_profile to authenticated;

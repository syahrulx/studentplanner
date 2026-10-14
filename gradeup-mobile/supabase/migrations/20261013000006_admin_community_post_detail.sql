-- =============================================================================
-- Admin Events & Posts: open a post and see who liked, commented and reported.
--
-- 1. admin_community_post_detail(post_id): the post, its author, every like
--    (name, email, when), every comment (who, text, when) and every report
--    (who, reason, when). Read only.
-- 2. admin_delete_community_post_comment(comment_id, reason): remove one
--    comment (students can only delete their own). Logged in admin_logs with
--    the reason and the removed text, so a mistake can be seen later.
-- Both admins only. No other data changes.
-- =============================================================================

create or replace function public.admin_community_post_detail(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_post jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select to_jsonb(p) || jsonb_build_object(
           'author_name', pr.name,
           'author_email', u.email,
           'author_avatar', pr.avatar_url)
    into v_post
    from public.community_posts p
    left join public.profiles pr on pr.id = p.author_id
    left join auth.users u on u.id = p.author_id
   where p.id = p_post_id;

  if v_post is null then
    raise exception 'Post not found.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'post', v_post,
    'likes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', l.user_id, 'name', pr.name, 'email', u.email,
               'avatar', pr.avatar_url, 'created_at', l.created_at)
             order by l.created_at desc)
        from public.post_likes l
        left join public.profiles pr on pr.id = l.user_id
        left join auth.users u on u.id = l.user_id
       where l.post_id = p_post_id), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'user_id', c.user_id, 'name', pr.name, 'email', u.email,
               'avatar', pr.avatar_url, 'content', c.content, 'created_at', c.created_at)
             order by c.created_at asc)
        from public.community_post_comments c
        left join public.profiles pr on pr.id = c.user_id
        left join auth.users u on u.id = c.user_id
       where c.post_id = p_post_id), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'reporter_id', r.reporter_id, 'name', pr.name, 'email', u.email,
               'reason', r.reason, 'created_at', r.created_at)
             order by r.created_at desc)
        from public.post_reports r
        left join public.profiles pr on pr.id = r.reporter_id
        left join auth.users u on u.id = r.reporter_id
       where r.post_id = p_post_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_delete_community_post_comment(p_comment_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.community_post_comments;
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason (at least 3 characters).' using errcode = 'P0001';
  end if;

  delete from public.community_post_comments where id = p_comment_id returning * into v_row;
  if v_row.id is null then
    raise exception 'Comment not found.' using errcode = 'P0001';
  end if;

  insert into public.admin_logs (type, status, meta)
  values ('api_request', 'success', jsonb_build_object(
    'action', 'admin_delete_community_post_comment',
    'actor', auth.uid(),
    'reason', btrim(p_reason),
    'comment_id', v_row.id,
    'post_id', v_row.post_id,
    'comment_user_id', v_row.user_id,
    'content', v_row.content));
  return true;
end;
$$;

revoke all on function public.admin_community_post_detail(uuid) from public, anon;
revoke all on function public.admin_delete_community_post_comment(uuid, text) from public, anon;
grant execute on function public.admin_community_post_detail(uuid) to authenticated;
grant execute on function public.admin_delete_community_post_comment(uuid, text) to authenticated;

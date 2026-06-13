-- ============================================================
-- Backfill shared tasks for new circle members.
--
-- Tasks shared to a circle are fanned out as one shared_tasks row
-- per member *present at share time*. A member who joins later
-- never gets those rows, and RLS prevents them from reading other
-- members' rows. This RPC lets a circle member pull their own
-- pending links for everything previously shared to the circle.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_circle_shared_tasks(p_circle_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_inserted int  := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Caller must be a member of this circle.
  IF NOT EXISTS (
    SELECT 1 FROM public.circle_members cm
    WHERE cm.circle_id = p_circle_id AND cm.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You are not a member of this circle.' USING ERRCODE = 'P0001';
  END IF;

  -- Suppress the per-row "Task shared with you" push for this backfill so the
  -- member doesn't get a burst of N notifications for historical tasks. The
  -- flag is transaction-local (set_config local=true) so normal shares in
  -- other transactions are unaffected. The push trigger checks this flag.
  PERFORM set_config('app.skip_shared_task_push', 'on', true);

  -- For each distinct task shared to this circle by someone else, create a
  -- pending link for the caller if they don't already have one (any status,
  -- so a previously declined task is NOT re-added). Skip tasks whose owner
  -- has since deleted the underlying task.
  WITH to_add AS (
    SELECT DISTINCT ON (st.task_id, st.owner_id)
      st.task_id,
      st.owner_id,
      st.message
    FROM public.shared_tasks st
    WHERE st.circle_id = p_circle_id
      AND st.owner_id <> v_uid
      AND NOT EXISTS (
        SELECT 1 FROM public.shared_tasks ex
        WHERE ex.task_id = st.task_id
          AND ex.owner_id = st.owner_id
          AND ex.recipient_id = v_uid
      )
      AND EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = st.task_id AND t.user_id = st.owner_id
      )
    ORDER BY st.task_id, st.owner_id, st.created_at ASC
  )
  INSERT INTO public.shared_tasks (
    task_id, owner_id, recipient_id, circle_id, status, recipient_completed, message
  )
  SELECT task_id, owner_id, v_uid, p_circle_id, 'pending', false, message
  FROM to_add
  ON CONFLICT (task_id, owner_id, recipient_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_circle_shared_tasks(uuid) TO authenticated;

-- ─── Honor the suppression flag in the shared-task push trigger ──────────────
-- Re-define _on_shared_task_insert (originally from 053_community_push_triggers)
-- to early-return when a backfill set app.skip_shared_task_push = 'on' in the
-- current transaction. Behaviour is otherwise identical to the original.
CREATE OR REPLACE FUNCTION public._on_shared_task_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_name   text;
  circle_name  text;
  recipients   uuid[];
  title_txt    text;
  body_txt     text;
BEGIN
  -- Skip push when this insert is part of a bulk backfill (e.g. a new circle
  -- member syncing previously shared tasks) to avoid a notification flood.
  IF current_setting('app.skip_shared_task_push', true) = 'on' THEN
    RETURN new;
  END IF;

  owner_name := public._display_name_for(new.owner_id);

  IF new.recipient_id IS NOT NULL THEN
    recipients := array[new.recipient_id];
    title_txt  := 'Task shared with you';
    body_txt   := owner_name || ' shared a task with you';
  ELSIF new.circle_id IS NOT NULL THEN
    SELECT coalesce(array_agg(cm.user_id) FILTER (WHERE cm.user_id <> new.owner_id), '{}')
    INTO recipients
    FROM public.circle_members cm
    WHERE cm.circle_id = new.circle_id;

    SELECT coalesce(name, 'your circle') INTO circle_name FROM public.circles WHERE id = new.circle_id;
    title_txt := 'Task shared in ' || circle_name;
    body_txt  := owner_name || ' shared a task with ' || circle_name;
  ELSE
    RETURN new;
  END IF;

  IF recipients IS NULL OR array_length(recipients, 1) IS NULL THEN
    RETURN new;
  END IF;

  PERFORM public._send_community_push(jsonb_build_object(
    'recipientUserIds', to_jsonb(recipients),
    'title',            title_txt,
    'body',             body_txt,
    'category',         'shared_task',
    'collapseKey',      'shared_task:' || new.task_id,
    'data', jsonb_build_object(
      'type',        'shared_task',
      'sharedTaskId', new.id,
      'taskId',      new.task_id,
      'ownerId',     new.owner_id,
      'circleId',    new.circle_id
    )
  ));
  RETURN new;
EXCEPTION
  WHEN others THEN
    RAISE WARNING '[community-push] shared task insert trigger failed: %', sqlerrm;
    RETURN new;
END;
$$;

-- ==============================================================================
-- 20260501000012_fix_all_service_bugs.sql
-- Fixes all identified bugs from the service flow audit.
-- ==============================================================================

-- ============================================================================
-- BUG #1: Missing GRANT EXECUTE on all new RPCs
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.submit_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_service(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quit_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_cancel_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_cancel_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_service(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_service(uuid, text) TO authenticated;

-- ============================================================================
-- BUG #5/6/7: Role-aware submit/approve/reject
-- For 'request': Claimer = Provider (submits), Author = Client (approves)
-- For 'offer':   Author = Provider (submits), Claimer = Client (approves)
-- ============================================================================

-- Fix submit_service: Provider submits work
CREATE OR REPLACE FUNCTION public.submit_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.service_status <> 'claimed' THEN RAISE EXCEPTION 'Service must be claimed to submit work'; END IF;

  -- Provider check: for requests the claimer is provider, for offers the author is provider
  IF v_svc.service_kind = 'request' AND v_svc.claimed_by <> v_uid THEN
    RAISE EXCEPTION 'Only the service provider can submit work';
  END IF;
  IF v_svc.service_kind = 'offer' AND v_svc.author_id <> v_uid THEN
    RAISE EXCEPTION 'Only the service provider can submit work';
  END IF;

  UPDATE public.community_posts
  SET service_status = 'submitted',
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_service_id;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, v_uid, '___SYSTEM_MSG___:Work has been submitted for review.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix approve_service: Client approves work
CREATE OR REPLACE FUNCTION public.approve_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.service_status <> 'submitted' THEN RAISE EXCEPTION 'Service must be submitted to approve'; END IF;

  -- Client check: for requests the author is client, for offers the claimer is client
  IF v_svc.service_kind = 'request' AND v_svc.author_id <> v_uid THEN
    RAISE EXCEPTION 'Only the client can approve work';
  END IF;
  IF v_svc.service_kind = 'offer' AND v_svc.claimed_by <> v_uid THEN
    RAISE EXCEPTION 'Only the client can approve work';
  END IF;

  UPDATE public.community_posts
  SET service_status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_service_id;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, v_uid, '___SYSTEM_MSG___:Work approved. The service is now completed.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix reject_service: Client rejects work
CREATE OR REPLACE FUNCTION public.reject_service(p_service_id uuid, p_reason text)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.service_status <> 'submitted' THEN RAISE EXCEPTION 'Service must be submitted to reject'; END IF;

  -- Client check
  IF v_svc.service_kind = 'request' AND v_svc.author_id <> v_uid THEN
    RAISE EXCEPTION 'Only the client can reject work';
  END IF;
  IF v_svc.service_kind = 'offer' AND v_svc.claimed_by <> v_uid THEN
    RAISE EXCEPTION 'Only the client can reject work';
  END IF;

  UPDATE public.community_posts
  SET service_status = 'claimed',
      submitted_at = null,
      updated_at = now()
  WHERE id = p_service_id;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, v_uid, '___SYSTEM_MSG___:Work rejected. Reason: ' || COALESCE(p_reason, 'Not specified'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- BUG #4 & #9 & #14: Fix quit_service
-- - Save claimed_by BEFORE clearing it so chat insert works
-- - Add updated_at
-- - Revert accepted offer to 'withdrawn'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.quit_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
  v_claimer uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.claimed_by <> v_uid THEN RAISE EXCEPTION 'Only the assigned taker can quit'; END IF;
  IF v_svc.service_status NOT IN ('claimed', 'submitted') THEN RAISE EXCEPTION 'Service cannot be quit in its current state'; END IF;

  -- Save claimer for the system message insert BEFORE we clear it
  v_claimer := v_svc.claimed_by;

  -- Insert system message FIRST while claimed_by still matches for RLS
  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, v_uid, '___SYSTEM_MSG___:The provider has dropped the task. It is now open for others.');

  -- Now clear the claim
  UPDATE public.community_posts
  SET service_status = 'open',
      claimed_by = null,
      claimed_at = null,
      submitted_at = null,
      accepted_amount = null,
      cancel_requested_by = null,
      updated_at = now()
  WHERE id = p_service_id;

  -- Revert accepted offer to withdrawn (#14)
  UPDATE public.service_offers
  SET status = 'withdrawn', updated_at = now()
  WHERE service_id = p_service_id
    AND status = 'accepted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- BUG #8 & #9: Fix request_cancel_service
-- - Prevent duplicate cancel requests
-- - Add updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.request_cancel_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.author_id <> v_uid AND v_svc.claimed_by <> v_uid THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_svc.service_status NOT IN ('claimed', 'submitted') THEN RAISE EXCEPTION 'Service cannot be cancelled in its current state'; END IF;

  -- Prevent duplicate (#8)
  IF v_svc.cancel_requested_by IS NOT NULL THEN
    RAISE EXCEPTION 'A cancellation request is already pending';
  END IF;

  UPDATE public.community_posts
  SET cancel_requested_by = v_uid,
      updated_at = now()
  WHERE id = p_service_id;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, v_uid, '___SYSTEM_MSG___:Mutual cancellation requested. The other party must accept to cancel.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- BUG #9 & #13: Fix accept_cancel_service
-- - Add updated_at
-- - Clear stale state (cancel_requested_by, accepted_amount)
-- - Reject pending offers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_cancel_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.author_id <> v_uid AND v_svc.claimed_by <> v_uid THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_svc.cancel_requested_by IS NULL THEN RAISE EXCEPTION 'No cancellation was requested'; END IF;
  IF v_svc.cancel_requested_by = v_uid THEN RAISE EXCEPTION 'You cannot accept your own cancellation request'; END IF;

  -- Insert system message BEFORE clearing claimed_by
  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, v_uid, '___SYSTEM_MSG___:Mutual cancellation accepted. The service is cancelled.');

  UPDATE public.community_posts
  SET service_status = 'cancelled',
      cancelled_at = now(),
      cancel_requested_by = null,
      updated_at = now()
  WHERE id = p_service_id;

  -- Revert accepted offers
  UPDATE public.service_offers
  SET status = 'rejected', updated_at = now()
  WHERE service_id = p_service_id
    AND status IN ('pending', 'accepted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- BUG #3 & #9: Fix cancel_service (open-only, reject pending offers)
-- ============================================================================
DROP FUNCTION IF EXISTS public.cancel_service(uuid);
CREATE OR REPLACE FUNCTION public.cancel_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.author_id <> v_uid THEN RAISE EXCEPTION 'Only the author can cancel the service'; END IF;
  IF v_svc.service_status <> 'open' THEN
    RAISE EXCEPTION 'You cannot cancel directly once it is claimed. Please use Mutual Cancellation.';
  END IF;

  UPDATE public.community_posts
  SET service_status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_service_id;

  -- Reject all pending offers (#3)
  UPDATE public.service_offers
  SET status = 'rejected', updated_at = now()
  WHERE service_id = p_service_id
    AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- BUG #9: Fix complete_service (add updated_at)
-- ============================================================================
DROP FUNCTION IF EXISTS public.complete_service(uuid);
CREATE OR REPLACE FUNCTION public.complete_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;

  -- Client check (same as approve_service)
  IF v_svc.service_kind = 'request' AND v_svc.author_id <> v_uid THEN
    RAISE EXCEPTION 'Only the client can complete the service';
  END IF;
  IF v_svc.service_kind = 'offer' AND v_svc.claimed_by <> v_uid THEN
    RAISE EXCEPTION 'Only the client can complete the service';
  END IF;

  IF v_svc.service_status = 'claimed' THEN
    RAISE EXCEPTION 'The provider must submit the work first before you can approve it.';
  END IF;
  IF v_svc.service_status <> 'submitted' THEN
    RAISE EXCEPTION 'Service must be submitted to be completed.';
  END IF;

  UPDATE public.community_posts
  SET service_status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_service_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- BUG #12: Block self-reports in backend
-- ============================================================================
CREATE OR REPLACE FUNCTION public.report_service(p_service_id uuid, p_reason text)
RETURNS void AS $$
DECLARE
  v_report_count int;
  v_author uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Prevent self-reporting
  SELECT author_id INTO v_author
  FROM public.community_posts WHERE id = p_service_id AND post_type = 'service';
  IF NOT FOUND THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_author = auth.uid() THEN RAISE EXCEPTION 'You cannot report your own service'; END IF;

  INSERT INTO public.service_reports (service_id, reporter_id, reason)
  VALUES (p_service_id, auth.uid(), p_reason)
  ON CONFLICT (service_id, reporter_id) DO NOTHING;

  SELECT count(*) INTO v_report_count
  FROM public.service_reports
  WHERE service_id = p_service_id;

  IF v_report_count >= 3 THEN
    UPDATE public.community_posts
    SET service_status = 'cancelled',
        cancelled_at = now(),
        updated_at = now()
    WHERE id = p_service_id
      AND service_status NOT IN ('completed', 'cancelled');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- BUG #2: Push notifications for new status transitions
-- ============================================================================
CREATE OR REPLACE FUNCTION public._on_service_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name text;
  recipient_uuid uuid;
  title_txt text;
  body_txt text;
BEGIN
  -- 1. Direct Claim (open -> claimed, no accepted_amount = free claim)
  IF old.service_status = 'open' AND new.service_status = 'claimed' AND new.accepted_amount IS NULL THEN
    actor_name := public._display_name_for(new.claimed_by);
    recipient_uuid := new.author_id;
    title_txt := 'Service claimed';
    body_txt := actor_name || ' took your service.';

    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            title_txt,
      'body',             body_txt,
      'category',         'service_claimed',
      'collapseKey',      'service_claimed:' || new.id::text,
      'data', jsonb_build_object('type', 'service_claimed', 'serviceId', new.id, 'claimerId', new.claimed_by)
    ));
  END IF;

  -- 2. Work Submitted (claimed -> submitted)
  IF old.service_status = 'claimed' AND new.service_status = 'submitted' THEN
    -- Notify the client
    IF new.service_kind = 'request' THEN
      recipient_uuid := new.author_id;  -- author is client
      actor_name := public._display_name_for(new.claimed_by);
    ELSE
      recipient_uuid := new.claimed_by; -- claimer is client
      actor_name := public._display_name_for(new.author_id);
    END IF;

    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            'Work submitted for review',
      'body',             actor_name || ' has submitted work. Please review and approve.',
      'category',         'service_submitted',
      'collapseKey',      'service_submitted:' || new.id::text,
      'data', jsonb_build_object('type', 'service_submitted', 'serviceId', new.id)
    ));
  END IF;

  -- 3. Work Rejected (submitted -> claimed)
  IF old.service_status = 'submitted' AND new.service_status = 'claimed' THEN
    -- Notify the provider
    IF new.service_kind = 'request' THEN
      recipient_uuid := new.claimed_by; -- claimer is provider
      actor_name := public._display_name_for(new.author_id);
    ELSE
      recipient_uuid := new.author_id;  -- author is provider
      actor_name := public._display_name_for(new.claimed_by);
    END IF;

    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            'Work needs revision',
      'body',             actor_name || ' has requested changes to your submission.',
      'category',         'service_rejected',
      'collapseKey',      'service_rejected:' || new.id::text,
      'data', jsonb_build_object('type', 'service_rejected', 'serviceId', new.id)
    ));
  END IF;

  -- 4. Service Completed (submitted -> completed)
  IF old.service_status = 'submitted' AND new.service_status = 'completed' THEN
    -- Notify the provider
    IF new.service_kind = 'request' THEN
      recipient_uuid := new.claimed_by;
      actor_name := public._display_name_for(new.author_id);
    ELSE
      recipient_uuid := new.author_id;
      actor_name := public._display_name_for(new.claimed_by);
    END IF;

    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            'Service completed!',
      'body',             actor_name || ' approved your work. You can now leave a review.',
      'category',         'service_completed',
      'collapseKey',      'service_completed:' || new.id::text,
      'data', jsonb_build_object('type', 'service_completed', 'serviceId', new.id)
    ));
  END IF;

  -- 5. Provider Quit (claimed/submitted -> open, claimed_by cleared)
  IF old.service_status IN ('claimed', 'submitted') AND new.service_status = 'open' AND new.claimed_by IS NULL THEN
    recipient_uuid := new.author_id;
    actor_name := public._display_name_for(old.claimed_by);

    PERFORM public._send_community_push(jsonb_build_object(
      'recipientUserIds', jsonb_build_array(recipient_uuid),
      'title',            'Provider left your service',
      'body',             actor_name || ' has dropped the task. Your service is open again.',
      'category',         'service_quit',
      'collapseKey',      'service_quit:' || new.id::text,
      'data', jsonb_build_object('type', 'service_quit', 'serviceId', new.id)
    ));
  END IF;

  -- 6. Service Cancelled (claimed/submitted -> cancelled)
  IF old.service_status IN ('claimed', 'submitted') AND new.service_status = 'cancelled' THEN
    -- Notify both parties (the one who didn't initiate)
    IF old.claimed_by IS NOT NULL THEN
      -- Notify claimer
      PERFORM public._send_community_push(jsonb_build_object(
        'recipientUserIds', jsonb_build_array(old.claimed_by),
        'title',            'Service cancelled',
        'body',             'The service has been mutually cancelled.',
        'category',         'service_cancelled',
        'collapseKey',      'service_cancelled:' || new.id::text,
        'data', jsonb_build_object('type', 'service_cancelled', 'serviceId', new.id)
      ));
      -- Notify author
      PERFORM public._send_community_push(jsonb_build_object(
        'recipientUserIds', jsonb_build_array(new.author_id),
        'title',            'Service cancelled',
        'body',             'The service has been mutually cancelled.',
        'category',         'service_cancelled',
        'collapseKey',      'service_cancelled:' || new.id::text,
        'data', jsonb_build_object('type', 'service_cancelled', 'serviceId', new.id)
      ));
    END IF;
  END IF;

  RETURN new;
EXCEPTION
  WHEN others THEN
    RAISE WARNING '[community-push] service status trigger failed: %', sqlerrm;
    RETURN new;
END;
$$;

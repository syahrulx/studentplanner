-- ==============================================================================
-- 20260501000010_service_two_step.sql
-- Description: Adds two-step completion (submitted status) and mutual cancellation.
-- ==============================================================================

-- 1. Update the check constraint to include 'submitted'
DO $$
DECLARE
  conname text;
BEGIN
  -- Find the dynamically named check constraint for service_status
  SELECT constraint_name INTO conname
  FROM information_schema.constraint_column_usage
  WHERE table_schema = 'public' 
    AND table_name = 'community_posts' 
    AND column_name = 'service_status';

  IF conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.community_posts DROP CONSTRAINT ' || conname;
  END IF;
END $$;

ALTER TABLE public.community_posts 
ADD CONSTRAINT community_posts_service_status_check 
CHECK (service_status IN ('open', 'claimed', 'submitted', 'completed', 'cancelled'));

-- 2. Add new tracking columns
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS cancel_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Update the state machine protector to allow these new columns
CREATE OR REPLACE FUNCTION public.enforce_service_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_role IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN new;
  END IF;

  IF new.post_type = 'service' THEN
    IF old.service_status IS DISTINCT FROM new.service_status OR
       old.claimed_by IS DISTINCT FROM new.claimed_by OR
       old.claimed_at IS DISTINCT FROM new.claimed_at OR
       old.submitted_at IS DISTINCT FROM new.submitted_at OR
       old.completed_at IS DISTINCT FROM new.completed_at OR
       old.cancelled_at IS DISTINCT FROM new.cancelled_at OR
       old.accepted_amount IS DISTINCT FROM new.accepted_amount OR
       old.cancel_requested_by IS DISTINCT FROM new.cancel_requested_by
    THEN
      RAISE EXCEPTION 'Cannot modify protected service fields directly. Use the provided actions.';
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- ============================================================================
-- RPCs for Two-Step Completion
-- ============================================================================

-- Submit Service (Taker only)
CREATE OR REPLACE FUNCTION public.submit_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
BEGIN
  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.claimed_by <> auth.uid() THEN RAISE EXCEPTION 'Only the assigned taker can submit work'; END IF;
  IF v_svc.service_status <> 'claimed' THEN RAISE EXCEPTION 'Service must be claimed to be submitted'; END IF;

  UPDATE public.community_posts
  SET service_status = 'submitted',
      submitted_at = now()
  WHERE id = p_service_id;

  -- Insert system message
  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, auth.uid(), '___SYSTEM_MSG___:Work has been submitted for review.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Approve Service (Author only)
CREATE OR REPLACE FUNCTION public.approve_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
BEGIN
  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.author_id <> auth.uid() THEN RAISE EXCEPTION 'Only the author can approve work'; END IF;
  IF v_svc.service_status <> 'submitted' THEN RAISE EXCEPTION 'Service must be submitted to be approved'; END IF;

  UPDATE public.community_posts
  SET service_status = 'completed',
      completed_at = now()
  WHERE id = p_service_id;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, auth.uid(), '___SYSTEM_MSG___:Work approved. The service is now completed.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reject Service (Author only)
CREATE OR REPLACE FUNCTION public.reject_service(p_service_id uuid, p_reason text)
RETURNS void AS $$
DECLARE
  v_svc record;
BEGIN
  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.author_id <> auth.uid() THEN RAISE EXCEPTION 'Only the author can reject work'; END IF;
  IF v_svc.service_status <> 'submitted' THEN RAISE EXCEPTION 'Service must be submitted to be rejected'; END IF;

  UPDATE public.community_posts
  SET service_status = 'claimed',
      submitted_at = null
  WHERE id = p_service_id;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, auth.uid(), '___SYSTEM_MSG___:Work rejected. Reason: ' || p_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- RPCs for Cancellations & Dropping
-- ============================================================================

-- Taker Quits
CREATE OR REPLACE FUNCTION public.quit_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
BEGIN
  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.claimed_by <> auth.uid() THEN RAISE EXCEPTION 'Only the assigned taker can quit'; END IF;
  IF v_svc.service_status NOT IN ('claimed', 'submitted') THEN RAISE EXCEPTION 'Service cannot be quit in its current state'; END IF;

  UPDATE public.community_posts
  SET service_status = 'open',
      claimed_by = null,
      claimed_at = null,
      submitted_at = null,
      accepted_amount = null,
      cancel_requested_by = null
  WHERE id = p_service_id;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, auth.uid(), '___SYSTEM_MSG___:The provider has quit the task. The task is open again.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Request Cancellation (Either party)
CREATE OR REPLACE FUNCTION public.request_cancel_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
BEGIN
  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.author_id <> auth.uid() AND v_svc.claimed_by <> auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_svc.service_status NOT IN ('claimed', 'submitted') THEN RAISE EXCEPTION 'Service cannot be cancelled in its current state'; END IF;

  UPDATE public.community_posts
  SET cancel_requested_by = auth.uid()
  WHERE id = p_service_id;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, auth.uid(), '___SYSTEM_MSG___:Mutual cancellation requested. The other party must accept to cancel.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Accept Cancellation (The other party)
CREATE OR REPLACE FUNCTION public.accept_cancel_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
BEGIN
  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.author_id <> auth.uid() AND v_svc.claimed_by <> auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_svc.cancel_requested_by IS NULL THEN RAISE EXCEPTION 'No cancellation was requested'; END IF;
  IF v_svc.cancel_requested_by = auth.uid() THEN RAISE EXCEPTION 'You cannot accept your own request'; END IF;

  UPDATE public.community_posts
  SET service_status = 'cancelled',
      cancelled_at = now()
  WHERE id = p_service_id;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, auth.uid(), '___SYSTEM_MSG___:Mutual cancellation accepted. The service is cancelled.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Also rewrite the original completeService so it only works if NOT using two-step
-- Actually, completeService is what the author used to do. We should override it.
DROP FUNCTION IF EXISTS public.complete_service(uuid);
CREATE OR REPLACE FUNCTION public.complete_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
BEGIN
  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.author_id <> auth.uid() THEN RAISE EXCEPTION 'Only the author can complete the service'; END IF;
  
  -- Prevent direct completion if it hasn't been submitted (Two-Step enforcement)
  IF v_svc.service_status = 'claimed' THEN 
    RAISE EXCEPTION 'The provider must submit the work first before you can approve it.'; 
  END IF;

  IF v_svc.service_status <> 'submitted' THEN 
    RAISE EXCEPTION 'Service must be submitted to be completed.'; 
  END IF;

  UPDATE public.community_posts
  SET service_status = 'completed',
      completed_at = now()
  WHERE id = p_service_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Rewrite cancel_service so author can only cancel if it's open
DROP FUNCTION IF EXISTS public.cancel_service(uuid);
CREATE OR REPLACE FUNCTION public.cancel_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
BEGIN
  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.author_id <> auth.uid() THEN RAISE EXCEPTION 'Only the author can cancel the service'; END IF;
  
  IF v_svc.service_status <> 'open' THEN 
    RAISE EXCEPTION 'You cannot cancel directly once it is claimed. Please use Mutual Cancellation.'; 
  END IF;

  UPDATE public.community_posts
  SET service_status = 'cancelled',
      cancelled_at = now()
  WHERE id = p_service_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

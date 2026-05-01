-- ==============================================================================
-- 20260501000014_phase1_trust_features.sql
-- Phase 1: Delivery Attachments, Revision Limits, Deadline Warnings
-- ==============================================================================

-- ============================================================================
-- 1. Add delivery columns
-- ============================================================================
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS delivery_note text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS delivery_attachments jsonb DEFAULT '[]'::jsonb;

-- ============================================================================
-- 2. Add revision tracking columns
-- ============================================================================
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS max_revisions int NOT NULL DEFAULT 3;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS revision_count int NOT NULL DEFAULT 0;

-- Constraint: revision_count can't exceed max_revisions + 1 (safety valve)
DO $$ BEGIN
  ALTER TABLE public.community_posts
    ADD CONSTRAINT chk_revision_count CHECK (revision_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.community_posts
    ADD CONSTRAINT chk_max_revisions CHECK (max_revisions >= 1 AND max_revisions <= 10);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. Update state machine trigger to protect new columns
-- ============================================================================
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
       old.cancel_requested_by IS DISTINCT FROM new.cancel_requested_by OR
       old.delivery_note IS DISTINCT FROM new.delivery_note OR
       old.delivery_attachments IS DISTINCT FROM new.delivery_attachments OR
       old.revision_count IS DISTINCT FROM new.revision_count
    THEN
      RAISE EXCEPTION 'Cannot modify protected service fields directly. Use the provided actions.';
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- ============================================================================
-- 4. Update submit_service to accept delivery note + attachments
-- ============================================================================
DROP FUNCTION IF EXISTS public.submit_service(uuid);
CREATE OR REPLACE FUNCTION public.submit_service(
  p_service_id uuid,
  p_delivery_note text DEFAULT NULL,
  p_delivery_attachments jsonb DEFAULT '[]'::jsonb
)
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
      delivery_note = COALESCE(p_delivery_note, ''),
      delivery_attachments = COALESCE(p_delivery_attachments, '[]'::jsonb),
      updated_at = now()
  WHERE id = p_service_id;

  -- Build a system message that includes the note
  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (
    p_service_id,
    v_uid,
    '___SYSTEM_MSG___:Work has been submitted for review.' ||
    CASE WHEN p_delivery_note IS NOT NULL AND p_delivery_note <> '' 
         THEN E'\nNote: ' || p_delivery_note 
         ELSE '' 
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.submit_service(uuid, text, jsonb) TO authenticated;

-- ============================================================================
-- 5. Update reject_service to enforce revision limits
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reject_service(p_service_id uuid, p_reason text)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
  v_new_count int;
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

  v_new_count := v_svc.revision_count + 1;

  -- Check if revision limit has been reached
  IF v_new_count >= v_svc.max_revisions THEN
    -- Auto-escalate: mark as disputed instead of bouncing back
    -- For now, force the status to a final state — the client must choose:
    -- approve or mutually cancel. No more rejections allowed.
    UPDATE public.community_posts
    SET revision_count = v_new_count,
        updated_at = now()
    WHERE id = p_service_id;

    INSERT INTO public.service_chat_messages (service_id, sender_id, content)
    VALUES (p_service_id, v_uid, 
      '___SYSTEM_MSG___:⚠️ Revision limit reached (' || v_svc.max_revisions || '/' || v_svc.max_revisions || '). ' ||
      'You must either Approve the work or use Mutual Cancellation to resolve this.'
    );

    RAISE EXCEPTION 'Revision limit reached (% of %). You must approve or use mutual cancellation.', v_new_count, v_svc.max_revisions;
  END IF;

  UPDATE public.community_posts
  SET service_status = 'claimed',
      submitted_at = null,
      delivery_note = null,
      delivery_attachments = '[]'::jsonb,
      revision_count = v_new_count,
      updated_at = now()
  WHERE id = p_service_id;

  INSERT INTO public.service_chat_messages (service_id, sender_id, content)
  VALUES (p_service_id, v_uid, 
    '___SYSTEM_MSG___:Work rejected (revision ' || v_new_count || '/' || v_svc.max_revisions || '). Reason: ' || COALESCE(p_reason, 'Not specified')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 6. Update quit_service to clear delivery fields
-- ============================================================================
CREATE OR REPLACE FUNCTION public.quit_service(p_service_id uuid)
RETURNS void AS $$
DECLARE
  v_svc record;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.community_posts WHERE id = p_service_id;
  IF NOT FOUND OR v_svc.post_type <> 'service' THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_svc.service_status NOT IN ('claimed', 'submitted') THEN RAISE EXCEPTION 'Service cannot be quit in its current state'; END IF;
  IF v_svc.claimed_by <> v_uid THEN
    RAISE EXCEPTION 'Only the assigned party can drop this task';
  END IF;

  -- Insert system message FIRST while claimed_by still matches for RLS
  IF v_svc.service_kind = 'request' THEN
    INSERT INTO public.service_chat_messages (service_id, sender_id, content)
    VALUES (p_service_id, v_uid, '___SYSTEM_MSG___:The provider has dropped the task. It is now open for others.');
  ELSE
    INSERT INTO public.service_chat_messages (service_id, sender_id, content)
    VALUES (p_service_id, v_uid, '___SYSTEM_MSG___:The client has released their acceptance. The offer is open again.');
  END IF;

  UPDATE public.community_posts
  SET service_status = 'open',
      claimed_by = null,
      claimed_at = null,
      submitted_at = null,
      accepted_amount = null,
      cancel_requested_by = null,
      delivery_note = null,
      delivery_attachments = '[]'::jsonb,
      revision_count = 0,
      updated_at = now()
  WHERE id = p_service_id;

  UPDATE public.service_offers
  SET status = 'withdrawn', updated_at = now()
  WHERE service_id = p_service_id
    AND status = 'accepted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 7. Storage bucket for delivery attachments
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-attachments', 'delivery-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to delivery-attachments
DROP POLICY IF EXISTS "Authenticated can upload delivery attachments" ON storage.objects;
CREATE POLICY "Authenticated can upload delivery attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'delivery-attachments' AND auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Public can read delivery attachments" ON storage.objects;
CREATE POLICY "Public can read delivery attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'delivery-attachments');

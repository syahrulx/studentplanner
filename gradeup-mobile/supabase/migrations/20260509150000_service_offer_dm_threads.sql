-- =============================================================================
-- Open listing direct messages: 1:1 between post author and offer row party
-- =============================================================================
-- Reverts service_chat_messages access to author + claimer only (no broadcast
-- thread for all pending offerers / usage rows).
-- Adds service_offer_dm_threads (one per open_listing offer) and messages with
-- RLS so only those two users can participate.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Revert service chat to claimed-job participants only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_access_service_chat(p_service_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = p_service_id
      AND (p.author_id = auth.uid() OR p.claimed_by = auth.uid())
  );
$$;

COMMENT ON FUNCTION public.user_can_access_service_chat(uuid) IS
  'True if the current user may read/send service_chat_messages for this service (author or claimer only).';

-- Policies reference the function — recreate if names unchanged (already match).
DROP POLICY IF EXISTS "service_chat_messages_select_participants" ON public.service_chat_messages;
DROP POLICY IF EXISTS "service_chat_messages_insert_participants" ON public.service_chat_messages;

CREATE POLICY "service_chat_messages_select_participants"
  ON public.service_chat_messages FOR SELECT
  USING (public.user_can_access_service_chat(service_id));

CREATE POLICY "service_chat_messages_insert_participants"
  ON public.service_chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.user_can_access_service_chat(service_id)
  );

-- ---------------------------------------------------------------------------
-- 2. Threads + messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_offer_dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL UNIQUE REFERENCES public.service_offers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_offer_dm_threads_offer
  ON public.service_offer_dm_threads(offer_id);

CREATE TABLE IF NOT EXISTS public.service_offer_dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.service_offer_dm_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_service_offer_dm_messages_thread
  ON public.service_offer_dm_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_service_offer_dm_messages_created
  ON public.service_offer_dm_messages(created_at);

ALTER TABLE public.service_offer_dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_offer_dm_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_can_access_offer_dm_thread(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_offer_dm_threads t
    INNER JOIN public.service_offers o ON o.id = t.offer_id
    INNER JOIN public.community_posts p ON p.id = o.service_id
    WHERE t.id = p_thread_id
      AND p.post_type = 'service'
      AND (p.author_id = auth.uid() OR o.offerer_id = auth.uid())
  );
$$;

COMMENT ON FUNCTION public.user_can_access_offer_dm_thread(uuid) IS
  'True if the current user is the service author or the offerer for this DM thread.';

GRANT EXECUTE ON FUNCTION public.user_can_access_offer_dm_thread(uuid) TO authenticated;

CREATE POLICY "offer_dm_threads_select"
  ON public.service_offer_dm_threads FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_offers o
      INNER JOIN public.community_posts p ON p.id = o.service_id
      WHERE o.id = service_offer_dm_threads.offer_id
        AND p.post_type = 'service'
        AND (p.author_id = auth.uid() OR o.offerer_id = auth.uid())
    )
  );

CREATE POLICY "offer_dm_messages_select"
  ON public.service_offer_dm_messages FOR SELECT
  USING (public.user_can_access_offer_dm_thread(thread_id));

CREATE POLICY "offer_dm_messages_insert"
  ON public.service_offer_dm_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.user_can_access_offer_dm_thread(thread_id)
    AND EXISTS (
      SELECT 1
      FROM public.service_offer_dm_threads t
      INNER JOIN public.service_offers o ON o.id = t.offer_id
      WHERE t.id = thread_id
        AND o.offer_kind = 'open_listing'
        AND o.status = 'pending'
    )
  );

GRANT SELECT ON public.service_offer_dm_threads TO authenticated;
GRANT SELECT, INSERT ON public.service_offer_dm_messages TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_open_offer_dm_thread(p_offer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.service_offers;
  v_svc public.community_posts;
  v_thread_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_offer FROM public.service_offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;
  IF v_offer.offer_kind <> 'open_listing' THEN
    RAISE EXCEPTION 'Direct chat is only for open listings';
  END IF;

  SELECT * INTO v_svc FROM public.community_posts
   WHERE id = v_offer.service_id AND post_type = 'service';
  IF v_svc.id IS NULL THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  SELECT id INTO v_thread_id
    FROM public.service_offer_dm_threads
   WHERE offer_id = p_offer_id;

  IF v_thread_id IS NOT NULL THEN
    IF v_uid NOT IN (v_svc.author_id, v_offer.offerer_id) THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;
    RETURN v_thread_id;
  END IF;

  IF v_offer.status <> 'pending' THEN
    RAISE EXCEPTION 'This listing is no longer active';
  END IF;

  IF v_uid NOT IN (v_svc.author_id, v_offer.offerer_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.service_offer_dm_threads (offer_id)
  VALUES (p_offer_id)
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_open_offer_dm_thread(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_offer_dm_messages_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.user_can_access_offer_dm_thread(p_thread_id) THEN
    RETURN;
  END IF;

  UPDATE public.service_offer_dm_messages
     SET read_at = now()
   WHERE thread_id = p_thread_id
     AND sender_id IS DISTINCT FROM auth.uid()
     AND read_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_offer_dm_messages_read(uuid) TO authenticated;

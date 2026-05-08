-- =============================================================================
-- Service chat: offerers + feedback authors can participate (open marketplace)
-- =============================================================================
-- Previously only community_posts.author_id and claimed_by could read/send.
-- Adds:
--   • Pending offer creators on this service (negotiate like before assign).
--   • Students who recorded feedback on an open listing (service_offer_usages).
-- Also updates mark_service_messages_read to match.
-- =============================================================================

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
      AND (
        p.author_id = auth.uid()
        OR p.claimed_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.service_offers o
          WHERE o.service_id = p.id
            AND o.offerer_id = auth.uid()
            AND o.status = 'pending'
        )
        OR EXISTS (
          SELECT 1
          FROM public.service_offer_usages u
          INNER JOIN public.service_offers o ON o.id = u.offer_id
          WHERE o.service_id = p.id
            AND u.user_id = auth.uid()
        )
      )
  );
$$;

COMMENT ON FUNCTION public.user_can_access_service_chat(uuid) IS
  'True if the current user may read/send service_chat_messages for this service (author, claimer, pending offerer, or open-listing feedback author).';

GRANT EXECUTE ON FUNCTION public.user_can_access_service_chat(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can read chat messages for their services" ON public.service_chat_messages;
DROP POLICY IF EXISTS "Users can insert chat messages for their services" ON public.service_chat_messages;

CREATE POLICY "service_chat_messages_select_participants"
  ON public.service_chat_messages FOR SELECT
  USING (public.user_can_access_service_chat(service_id));

CREATE POLICY "service_chat_messages_insert_participants"
  ON public.service_chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.user_can_access_service_chat(service_id)
  );

CREATE OR REPLACE FUNCTION public.mark_service_messages_read(p_service_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.user_can_access_service_chat(p_service_id) THEN
    RETURN;
  END IF;

  UPDATE public.service_chat_messages
     SET read_at = now()
   WHERE service_id = p_service_id
     AND sender_id IS DISTINCT FROM auth.uid()
     AND read_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_service_messages_read(uuid) TO authenticated;

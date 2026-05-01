-- 20260501000009_chat_read_receipts.sql

-- Add read_at column
ALTER TABLE public.service_chat_messages 
ADD COLUMN IF NOT EXISTS read_at timestamptz DEFAULT null;

-- Create an RPC to mark all unread messages in a service chat as read
CREATE OR REPLACE FUNCTION public.mark_service_messages_read(p_service_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.service_chat_messages
  SET read_at = now()
  WHERE service_id = p_service_id
    AND sender_id != auth.uid() -- only mark messages from the other person
    AND read_at IS NULL
    -- Ensure the current user is part of this service
    AND EXISTS (
      SELECT 1 FROM public.community_posts p 
      WHERE p.id = p_service_id 
      AND (p.author_id = auth.uid() OR p.claimed_by = auth.uid())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

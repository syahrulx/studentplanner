-- ==============================================================================
-- 20260430140000_service_chat_messages.sql
-- Description: Creates the service_chat_messages table for in-app peer-to-peer 
--              communication between service requesters and providers.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.service_chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for fast querying
CREATE INDEX idx_service_chat_messages_service_id ON public.service_chat_messages(service_id);
CREATE INDEX idx_service_chat_messages_created_at ON public.service_chat_messages(created_at);

-- RLS Policies
ALTER TABLE public.service_chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow reading messages if the user is the author or the taker of the service
CREATE POLICY "Users can read chat messages for their services" 
ON public.service_chat_messages FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.community_posts p 
    WHERE p.id = service_chat_messages.service_id 
    AND (p.author_id = auth.uid() OR p.claimed_by = auth.uid())
  )
);

-- Allow inserting messages if the user is the author or the taker of the service
CREATE POLICY "Users can insert chat messages for their services" 
ON public.service_chat_messages FOR INSERT 
WITH CHECK (
  auth.uid() = sender_id AND 
  EXISTS (
    SELECT 1 FROM public.community_posts p 
    WHERE p.id = service_chat_messages.service_id 
    AND (p.author_id = auth.uid() OR p.claimed_by = auth.uid())
  )
);

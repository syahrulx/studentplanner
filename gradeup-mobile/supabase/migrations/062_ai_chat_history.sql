-- Table: ai_chat_sessions
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: ai_chat_messages
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'ai')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for ai_chat_sessions
CREATE POLICY "Users can view their own chat sessions"
    ON public.ai_chat_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat sessions"
    ON public.ai_chat_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat sessions"
    ON public.ai_chat_sessions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat sessions"
    ON public.ai_chat_sessions FOR DELETE
    USING (auth.uid() = user_id);

-- Policies for ai_chat_messages
CREATE POLICY "Users can view messages of their chat sessions"
    ON public.ai_chat_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.ai_chat_sessions s 
            WHERE s.id = ai_chat_messages.session_id 
            AND s.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create messages in their chat sessions"
    ON public.ai_chat_messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ai_chat_sessions s 
            WHERE s.id = ai_chat_messages.session_id 
            AND s.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages in their chat sessions"
    ON public.ai_chat_messages FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.ai_chat_sessions s 
            WHERE s.id = ai_chat_messages.session_id 
            AND s.user_id = auth.uid()
        )
    );

-- Add indices for performance
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_user_id ON public.ai_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_id ON public.ai_chat_messages(session_id);

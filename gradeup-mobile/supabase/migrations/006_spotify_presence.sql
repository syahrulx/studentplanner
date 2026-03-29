-- Secure token storage (only readable by the token owner)
CREATE TABLE IF NOT EXISTS public.spotify_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.spotify_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own tokens" ON public.spotify_tokens;
CREATE POLICY "Users can manage own tokens"
  ON public.spotify_tokens FOR ALL USING (auth.uid() = user_id);

-- Add music presence columns to user_activities
ALTER TABLE public.user_activities
  ADD COLUMN IF NOT EXISTS song_name TEXT,
  ADD COLUMN IF NOT EXISTS song_artist TEXT,
  ADD COLUMN IF NOT EXISTS song_album_art TEXT,
  ADD COLUMN IF NOT EXISTS song_track_id TEXT,
  ADD COLUMN IF NOT EXISTS is_playing BOOLEAN DEFAULT FALSE;

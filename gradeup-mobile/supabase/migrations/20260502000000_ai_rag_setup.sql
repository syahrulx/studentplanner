-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a table to store chunks of notes and their embeddings
CREATE TABLE IF NOT EXISTS public.note_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536)
);

-- Index for faster vector search (optional but good for performance)
-- We use an IVFFlat or HNSW index. HNSW is recommended for pgvector 0.5.0+
CREATE INDEX IF NOT EXISTS note_embeddings_embedding_idx 
ON public.note_embeddings USING hnsw (embedding vector_cosine_ops);

-- Create a function to similarity search note chunks
CREATE OR REPLACE FUNCTION match_note_embeddings (
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT,
  p_user_id UUID,
  p_subject_id TEXT
)
RETURNS TABLE (
  id UUID,
  note_id TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ne.id,
    ne.note_id,
    ne.content,
    1 - (ne.embedding <=> query_embedding) AS similarity
  FROM public.note_embeddings ne
  WHERE 1 - (ne.embedding <=> query_embedding) > match_threshold
    AND ne.user_id = p_user_id
    AND ne.subject_id = p_subject_id
  ORDER BY ne.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- RLS Policies
ALTER TABLE public.note_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own embeddings"
    ON public.note_embeddings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own embeddings"
    ON public.note_embeddings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own embeddings"
    ON public.note_embeddings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own embeddings"
    ON public.note_embeddings FOR DELETE
    USING (auth.uid() = user_id);

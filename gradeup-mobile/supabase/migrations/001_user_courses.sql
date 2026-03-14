-- User subjects/courses – each user has their own subjects for tasks, study time, notes, etc.
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Create user_courses table
CREATE TABLE IF NOT EXISTS user_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  name TEXT NOT NULL,
  credit_hours INTEGER NOT NULL DEFAULT 3,
  workload JSONB NOT NULL DEFAULT '[2,3,4,6,5,7,8,4,6,8,10,9,10,4]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, subject_id)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_user_courses_user_id ON user_courses(user_id);

-- Row Level Security: users can only access their own courses
ALTER TABLE user_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own courses" ON user_courses;
CREATE POLICY "Users can view own courses" ON user_courses
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own courses" ON user_courses;
CREATE POLICY "Users can insert own courses" ON user_courses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own courses" ON user_courses;
CREATE POLICY "Users can update own courses" ON user_courses
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own courses" ON user_courses;
CREATE POLICY "Users can delete own courses" ON user_courses
  FOR DELETE USING (auth.uid() = user_id);

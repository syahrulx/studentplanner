-- Fix RLS for tasks table to allow shared task recipients to view task details
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they strictly restrict to user_id (most common)
DROP POLICY IF EXISTS "Users can read own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can view tasks shared with them" ON public.tasks;

-- Create generic read policy: users can read if they own it or if it's shared with them
CREATE POLICY "Users can view tasks shared with them" ON public.tasks
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.shared_tasks st
      WHERE st.task_id = tasks.id AND (st.recipient_id = auth.uid() OR st.owner_id = auth.uid())
    )
  );

-- Keep insert, update, delete for owners only
DROP POLICY IF EXISTS "Users can insert own tasks" ON public.tasks;
CREATE POLICY "Users can insert own tasks" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tasks" ON public.tasks;
CREATE POLICY "Users can update own tasks" ON public.tasks FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own tasks" ON public.tasks;
CREATE POLICY "Users can delete own tasks" ON public.tasks FOR DELETE USING (auth.uid() = user_id);

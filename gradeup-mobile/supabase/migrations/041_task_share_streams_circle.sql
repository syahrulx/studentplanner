-- Add circle-level auto-share streams support
-- Allow task_share_streams to target a circle instead of an individual recipient.

-- Step 1: Add optional circle_id column
ALTER TABLE public.task_share_streams
  ADD COLUMN circle_id uuid REFERENCES public.circles(id) ON DELETE CASCADE;

-- Step 2: Make recipient_id nullable (circle streams don't have a single recipient)
ALTER TABLE public.task_share_streams
  ALTER COLUMN recipient_id DROP NOT NULL;

-- Step 3: Add unique constraint for circle streams
ALTER TABLE public.task_share_streams
  ADD CONSTRAINT uq_task_share_stream_circle UNIQUE (owner_id, circle_id);

-- Step 4: Allow recipients (circle members) to view circle-based streams
DROP POLICY IF EXISTS "Users can select their own task_share_streams (owner or recipient)" ON public.task_share_streams;
CREATE POLICY "Users can select their own task_share_streams (owner or recipient or circle member)"
ON public.task_share_streams
FOR SELECT
USING (
  auth.uid() = owner_id
  OR auth.uid() = recipient_id
  OR circle_id IN (
    SELECT circle_id FROM public.circle_members WHERE user_id = auth.uid()
  )
);

-- Add a unique constraint on (task_id, owner_id, recipient_id) to prevent
-- duplicate shared_tasks rows when sharing the same task to the same friend.
-- Existing duplicates (if any) must be cleaned up before this runs.

-- Step 1: Remove duplicate rows keeping only the newest per (task_id, owner_id, recipient_id)
DELETE FROM shared_tasks
WHERE id NOT IN (
  SELECT DISTINCT ON (task_id, owner_id, recipient_id) id
  FROM shared_tasks
  ORDER BY task_id, owner_id, recipient_id, created_at DESC
);

-- Step 2: Add the unique constraint
ALTER TABLE shared_tasks
  ADD CONSTRAINT uq_shared_tasks_task_owner_recipient
  UNIQUE (task_id, owner_id, recipient_id);

-- ============================================================
-- GPA Tracker: Updates to existing tables
-- ============================================================

-- Add semester_id to user_courses so we can group subjects into semesters
ALTER TABLE public.user_courses 
ADD COLUMN IF NOT EXISTS semester_id INTEGER NOT NULL DEFAULT 1;

-- Add override_grade to subject_grade_configs for quick historic entries
ALTER TABLE public.subject_grade_configs 
ADD COLUMN IF NOT EXISTS override_grade TEXT;

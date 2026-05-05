-- ============================================================
-- Events Instagram Redesign Migration
-- Adds: image_urls (multi-photo), post_likes, like_count, post_reports
-- ============================================================

-- 1. Multi-image support on community_posts
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

-- Migrate existing single image_url into image_urls array
UPDATE public.community_posts
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL
  AND (image_urls IS NULL OR image_urls = '{}');

-- 2. Like count column (denormalized for fast reads)
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS like_count int NOT NULL DEFAULT 0;

-- 3. Post Likes table
CREATE TABLE IF NOT EXISTS public.post_likes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid        NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_likes_select" ON public.post_likes;
CREATE POLICY "post_likes_select" ON public.post_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "post_likes_insert" ON public.post_likes;
CREATE POLICY "post_likes_insert" ON public.post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_likes_delete" ON public.post_likes;
CREATE POLICY "post_likes_delete" ON public.post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Trigger to keep like_count in sync
CREATE OR REPLACE FUNCTION public.update_post_like_count()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts
    SET like_count = GREATEST(0, like_count + 1)
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts
    SET like_count = GREATEST(0, like_count - 1)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_post_like_count ON public.post_likes;
CREATE TRIGGER trg_update_post_like_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_post_like_count();

-- 5. Post Reports table (Apple compliance: UGC moderation)
CREATE TABLE IF NOT EXISTS public.post_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid        NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  reporter_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      text        NOT NULL DEFAULT 'inappropriate',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, reporter_id)
);

ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_reports_insert" ON public.post_reports;
CREATE POLICY "post_reports_insert" ON public.post_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Only admins can read reports (via service role or admin_users check)
DROP POLICY IF EXISTS "post_reports_admin_select" ON public.post_reports;
CREATE POLICY "post_reports_admin_select" ON public.post_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()
    )
  );

-- Auto-flag a post when it gets 5+ reports
CREATE OR REPLACE FUNCTION public.auto_flag_reported_post()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  report_count int;
BEGIN
  SELECT COUNT(*) INTO report_count
  FROM public.post_reports
  WHERE post_id = NEW.post_id;

  IF report_count >= 5 THEN
    UPDATE public.community_posts
    SET status = 'flagged'
    WHERE id = NEW.post_id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_flag_reported_post ON public.post_reports;
CREATE TRIGGER trg_auto_flag_reported_post
  AFTER INSERT ON public.post_reports
  FOR EACH ROW EXECUTE FUNCTION public.auto_flag_reported_post();

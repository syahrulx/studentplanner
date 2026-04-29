-- Run this to update the existing INSERT policy
-- (since the migration was already applied, we need to drop and recreate)

DROP POLICY IF EXISTS "Users can create community posts" ON public.community_posts;

CREATE POLICY "Users can create community posts"
  ON public.community_posts FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (
      post_type = 'service'
      OR (
        post_type IN ('event', 'memo')
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.authority_status = 'approved'
        )
      )
    )
  );

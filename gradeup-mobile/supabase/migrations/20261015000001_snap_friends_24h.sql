-- 20261015000001_snap_friends_24h.sql
--
-- A snap is for 24 hours. The app only ever showed friends live snaps, but the
-- "Users can read friends snaps" rule had no time limit, so anyone querying
-- the API directly could read every snap a friend had ever posted. Campus and
-- university snaps were already limited to 24 hours.
--
-- After this, other students can read a snap only while it is live, whoever
-- it was shared with. The author still reads all of their own snaps ("Users
-- can read own snaps", unchanged), which is what Snap Memories uses. Admins
-- are unchanged.
--
-- Replaces one policy with the same one plus `expires_at > now()`. Changes no
-- data. Safe to run twice. The app already treats an expired snap as "Snap
-- not found" (getSnapById), so nothing changes on screen.

DROP POLICY IF EXISTS "Users can read friends snaps" ON public.study_snaps;
CREATE POLICY "Users can read friends snaps"
  ON public.study_snaps FOR SELECT
  USING (
    status <> 'removed'
    AND expires_at > now()
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.requester_id = (SELECT auth.uid()) AND f.addressee_id = study_snaps.user_id)
          OR (f.addressee_id = (SELECT auth.uid()) AND f.requester_id = study_snaps.user_id)
        )
    )
  );

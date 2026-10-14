-- STATUS 13 Oct 2026: both jobs are DONE. Puzzle #31 was already gone;
-- Izwan's crossword_scores row deleted (1 row). Kept for the record only.

-- The two data jobs still outstanding. These are not migrations, so
-- CHECK-MIGRATIONS.sql does not cover them.
--
-- Run the COUNT first in each pair. Look at the number before you delete
-- anything — this database has ~30,000 real students in it.

-- ─── 1. Crossword test puzzle #31 ───────────────────────────────────────────
-- It was a test row that shipped by accident. Pack 1 should be 30 puzzles.

-- Check first (expect 1 row if it is still there, 0 if already gone):
SELECT id, title FROM public.crossword_puzzles WHERE id = 31;

-- Only if the above returned a row:
-- DELETE FROM public.crossword_puzzles WHERE id = 31;


-- ─── 2. Reset Izwan's crossword scores ──────────────────────────────────────
-- Account a44b03d4-3ab8-47f5-91cf-f88720fcb204 (Izwan's account).
--
-- IMPORTANT: do this only AFTER 1.8.6 or later is installed on your phone.
-- An older build still posts scores and syncs them back, so deleting now just
-- means they reappear.

-- Check first — how many rows, and the highest score:
-- (Each game names its score differently: crossword total_points,
-- word game score, 2048 best_score. Fixed 13 Oct — the first version used
-- "score" for all three and failed before reading anything.)
SELECT 'crossword' AS game, count(*) AS rows, max(total_points) AS best
FROM public.crossword_scores WHERE user_id = 'a44b03d4-3ab8-47f5-91cf-f88720fcb204'
UNION ALL
SELECT 'word game', count(*), max(score)
FROM public.word_game_scores WHERE user_id = 'a44b03d4-3ab8-47f5-91cf-f88720fcb204'
UNION ALL
SELECT '2048', count(*), max(best_score)
FROM public.game_2048_scores WHERE user_id = 'a44b03d4-3ab8-47f5-91cf-f88720fcb204';

-- You asked for crossword only. Uncomment just this one:
-- DELETE FROM public.crossword_scores
-- WHERE user_id = 'a44b03d4-3ab8-47f5-91cf-f88720fcb204';

-- The other two are here only so you can see the numbers above. Leave them
-- commented unless you decide you want those cleared as well:
-- DELETE FROM public.word_game_scores
-- WHERE user_id = 'a44b03d4-3ab8-47f5-91cf-f88720fcb204';
-- DELETE FROM public.game_2048_scores
-- WHERE user_id = 'a44b03d4-3ab8-47f5-91cf-f88720fcb204';

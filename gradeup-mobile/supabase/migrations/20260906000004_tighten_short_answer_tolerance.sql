-- ---------------------------------------------------------------------------
-- Short-answer typo tolerance was too loose.
--
-- Caught by the first run of the offline eval suite. At a flat 20% of the
-- expected answer's length, an 11-character answer tolerates 2 edits, and
-- "shareholder" is exactly 2 edits from "stakeholder": two different words in
-- project management, one silently marked as the other.
--
-- The tolerance is now capped at 2, so a genuine typo still passes while
-- near-miss vocabulary stays apart.
--
--   stakeholder vs stakeholdr   distance 1  -> accepted (typo)
--   stakeholder vs shareholder  distance 2  -> rejected (different word)
--
-- `gradeShortAnswer` in src/lib/quizGrading.ts applies the identical rule. The
-- two must not drift: the client grades the instant feedback and this function
-- grades the score that is saved, so a mismatch shows the student one verdict
-- and records the other.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------------

create or replace function public.quiz_short_answer_correct(p_given text, p_expected text, p_accepted jsonb)
returns boolean
language plpgsql immutable
as $$
declare
  given    text := regexp_replace(public.quiz_normalize_answer(p_given), '\s+', ' ', 'g');
  expected text := regexp_replace(public.quiz_normalize_answer(p_expected), '\s+', ' ', 'g');
  alias    text;
  tolerance int;
begin
  if given = '' or expected = '' then return false; end if;
  if given = expected then return true; end if;

  if p_accepted is not null and jsonb_typeof(p_accepted) = 'array' then
    for alias in select jsonb_array_elements_text(p_accepted) loop
      if given = regexp_replace(public.quiz_normalize_answer(alias), '\s+', ' ', 'g') then
        return true;
      end if;
    end loop;
  end if;

  -- Mirrors gradeShortAnswer: min(2, max(1, floor(len * 0.15))).
  tolerance := least(2, greatest(1, floor(length(expected) * 0.15)));
  if length(given) >= 3 and levenshtein(given, expected) <= tolerance then
    return true;
  end if;
  return false;
end
$$;

import { useMemo, useState, type ReactNode } from 'react';
import {
  upsertAdminCrosswordPuzzle,
  deleteAdminCrosswordPuzzle,
  type AdminCrosswordPuzzle,
  type CrosswordWordInput,
} from '../lib/api';
import { Button } from '../ui/Button';
import { Notice, SidePanel } from '../ui/page';
import { DANGER_TEXT_BTN } from './config/buttons';
import { errorText } from './config/errorText';

type Props = {
  /** null = creating a new level. */
  puzzle: AdminCrosswordPuzzle | null;
  onClose: () => void;
  onSaved: () => void;
};

type Direction = 'across' | 'down';

function emptyGrid(size: number): (string | null)[][] {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

/**
 * Client-side mirror of the server's grid-building, for the live preview
 * only. The edge function independently recomputes the grid and clue
 * numbers from the same raw word list on save — this preview never gets
 * sent as-is, it's purely a same-page sanity check for the admin.
 */
function buildPreviewGrid(
  size: number,
  words: CrosswordWordInput[],
): { grid: (string | null)[][]; conflicts: Set<string> } {
  const grid = emptyGrid(size);
  const conflicts = new Set<string>();
  for (const w of words) {
    const answer = w.answer.toUpperCase().replace(/[^A-Z]/g, '');
    const [dr, dc] = w.direction === 'across' ? [0, 1] : [1, 0];
    for (let i = 0; i < answer.length; i++) {
      const r = w.row + dr * i;
      const c = w.col + dc * i;
      if (r < 0 || r >= size || c < 0 || c >= size) {
        conflicts.add(`${r},${c}`);
        continue;
      }
      const ch = answer[i];
      const existing = grid[r][c];
      if (existing != null && existing !== ch) {
        conflicts.add(`${r},${c}`);
        continue;
      }
      grid[r][c] = ch;
    }
  }
  return { grid, conflicts };
}

export function CrosswordPuzzleEditor({ puzzle, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(puzzle?.title ?? '');
  const [size, setSize] = useState(puzzle?.size ?? 7);
  const [bonusWord, setBonusWord] = useState(puzzle?.bonus_word ?? '');
  const [bonusHint, setBonusHint] = useState(puzzle?.bonus_hint ?? '');
  const [isPublished, setIsPublished] = useState(puzzle?.is_published ?? true);
  const [words, setWords] = useState<CrosswordWordInput[]>(() =>
    (puzzle?.clues ?? []).map((c) => ({
      answer: c.answer,
      clue: c.clue,
      direction: c.direction,
      row: c.row,
      col: c.col,
    })),
  );

  const [wAnswer, setWAnswer] = useState('');
  const [wClue, setWClue] = useState('');
  const [wDirection, setWDirection] = useState<Direction>('across');
  const [wRow, setWRow] = useState(1);
  const [wCol, setWCol] = useState(1);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { grid, conflicts } = useMemo(() => buildPreviewGrid(size, words), [size, words]);

  // Display only: has anything changed since the panel opened? Used to ask
  // before an accidental close (Esc, clicking outside, ✕) throws work away.
  const [initialSnapshot] = useState(() => JSON.stringify([title, size, bonusWord, bonusHint, isPublished, words]));
  const dirty =
    JSON.stringify([title, size, bonusWord, bonusHint, isPublished, words]) !== initialSnapshot ||
    wAnswer.trim() !== '' || wClue.trim() !== '';
  function closeFromPanel() {
    if (saving) return;
    if (dirty && !window.confirm('Close without saving? Your changes to this level will be lost.')) return;
    onClose();
  }

  function addWord() {
    const answer = wAnswer.toUpperCase().replace(/[^A-Z]/g, '');
    if (!answer || answer.length < 2) {
      setError('Word must be at least 2 letters.');
      return;
    }
    if (!wClue.trim()) {
      setError('Enter a clue for this word.');
      return;
    }
    setError(null);
    setWords((prev) => [...prev, { answer, clue: wClue.trim(), direction: wDirection, row: wRow - 1, col: wCol - 1 }]);
    setWAnswer('');
    setWClue('');
    setWRow(1);
    setWCol(1);
  }

  function removeWord(idx: number) {
    setWords((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!title.trim()) return setError('Title is required.');
    if (!bonusWord.trim()) return setError('Bonus word is required.');
    if (!bonusHint.trim()) return setError('Bonus hint is required.');
    if (words.length === 0) return setError('Add at least one word.');
    if (conflicts.size > 0) return setError('Fix the highlighted conflicts before saving.');

    setSaving(true);
    setError(null);
    try {
      await upsertAdminCrosswordPuzzle({
        id: puzzle?.id,
        title: title.trim(),
        size,
        bonusWord: bonusWord.trim(),
        bonusHint: bonusHint.trim(),
        isPublished,
        words,
      });
      onSaved();
    } catch (e) {
      // The server re-validates everything (grid bounds, letter conflicts,
      // clue numbering) independently — a save can still fail here even
      // when the client-side preview looks clean, so this message is the
      // one that actually matters.
      setError(errorText(e, 'Could not save this level.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!puzzle) return;
    if (!confirm(`Delete level #${puzzle.id} "${puzzle.title}"? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteAdminCrosswordPuzzle(puzzle.id);
      onSaved();
    } catch (e) {
      setError(errorText(e, 'Could not delete this level.'));
      setSaving(false);
    }
  }

  return (
    <SidePanel
      title={puzzle ? `Edit level #${puzzle.id}` : 'New crossword level'}
      subtitle="The server checks the grid again when you save."
      width="max-w-4xl"
      onClose={closeFromPanel}
      footer={
        <>
          {/* In the always-visible footer so a failed save is seen next to the button. */}
          {error ? <Notice tone="danger" className="w-full">{error}</Notice> : null}
          {puzzle ? (
            <button type="button" onClick={handleDelete} disabled={saving} className={`mr-auto ${DANGER_TEXT_BTN}`}>
              Delete level
            </button>
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save level'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="cw-title">
          <input id="cw-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. In the Kitchen" />
        </Field>
        <Field label="Grid size (5–15)" htmlFor="cw-size">
          <input
            id="cw-size"
            type="number"
            min={5}
            max={15}
            className={inputCls}
            value={size}
            onChange={(e) => setSize(Math.max(5, Math.min(15, Number(e.target.value) || 7)))}
          />
        </Field>
        <Field label="Bonus word" htmlFor="cw-bonus-word">
          <input
            id="cw-bonus-word"
            className={inputCls}
            value={bonusWord}
            onChange={(e) => setBonusWord(e.target.value)}
            placeholder="Hidden word, never on the grid"
          />
        </Field>
        <Field label="Bonus hint" htmlFor="cw-bonus-hint">
          <input id="cw-bonus-hint" className={inputCls} value={bonusHint} onChange={(e) => setBonusHint(e.target.value)} placeholder="Shown to the player" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600 dark:border-slate-700 dark:bg-slate-950"
        />
        Published (visible to players)
      </label>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        {/* Live grid preview */}
        <div>
          <div className={SUB_LABEL}>Live preview</div>
          <div
            className="mt-2 grid w-max gap-[2px] rounded-xl bg-slate-200 p-[2px] dark:bg-slate-700"
            style={{ gridTemplateColumns: `repeat(${size}, 28px)` }}
          >
            {grid.flatMap((rowArr, r) =>
              rowArr.map((ch, c) => {
                const key = `${r},${c}`;
                const hasConflict = conflicts.has(key);
                return (
                  <div
                    key={key}
                    className={
                      'grid h-[28px] w-[28px] place-items-center rounded-[3px] text-xs font-black ' +
                      (hasConflict
                        ? 'bg-rose-500 text-white dark:bg-rose-500'
                        : ch != null
                          ? 'bg-white text-slate-900 dark:bg-slate-100 dark:text-slate-900'
                          : 'bg-slate-300 dark:bg-slate-800')
                    }
                  >
                    {ch}
                  </div>
                );
              }),
            )}
          </div>
          {conflicts.size > 0 && (
            <div className="mt-2 max-w-[260px] text-xs font-bold text-rose-600 dark:text-rose-400">
              {conflicts.size} conflicting or out-of-bounds cell{conflicts.size === 1 ? '' : 's'}. Fix before saving.
            </div>
          )}
        </div>

        {/* Word list */}
        <div className="min-w-0">
          <div className={SUB_LABEL}>Words ({words.length})</div>
          <div className="mt-2 flex flex-col gap-2">
            {words.map((w, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-2 dark:border-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {w.answer}{' '}
                    <span className="font-semibold text-slate-400 dark:text-slate-500">
                      · {w.direction} · row {w.row + 1}, col {w.col + 1}
                    </span>
                  </div>
                  <div className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{w.clue}</div>
                </div>
                <button type="button" onClick={() => removeWord(i)} className={`shrink-0 ${DANGER_TEXT_BTN}`}>
                  Remove
                </button>
              </div>
            ))}
            {words.length === 0 && <div className="text-sm font-semibold text-slate-400 dark:text-slate-500">No words yet. Add one below.</div>}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/50">
            <div className={SUB_LABEL}>Add a word</div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
              <input
                className={inputCls + ' sm:col-span-2'}
                placeholder="Answer"
                aria-label="Answer"
                value={wAnswer}
                onChange={(e) => setWAnswer(e.target.value)}
              />
              <select className={inputCls} aria-label="Direction" value={wDirection} onChange={(e) => setWDirection(e.target.value as Direction)}>
                <option value="across">Across</option>
                <option value="down">Down</option>
              </select>
              <input
                type="number"
                min={1}
                max={size}
                className={inputCls}
                placeholder="Row"
                aria-label="Row (from 1, top)"
                value={wRow}
                onChange={(e) => setWRow(Number(e.target.value) || 1)}
              />
              <input
                type="number"
                min={1}
                max={size}
                className={inputCls}
                placeholder="Col"
                aria-label="Column (from 1, left)"
                value={wCol}
                onChange={(e) => setWCol(Number(e.target.value) || 1)}
              />
              <Button type="button" size="sm" onClick={addWord}>+ Add</Button>
            </div>
            <input
              className={inputCls + ' mt-2 w-full'}
              placeholder="Clue text"
              aria-label="Clue text"
              value={wClue}
              onChange={(e) => setWClue(e.target.value)}
            />
            <div className="mt-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">Row and column count from 1, starting at the top-left.</div>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

const SUB_LABEL = 'text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400';

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-100';

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</label>
      {children}
    </div>
  );
}

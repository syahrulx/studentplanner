import { useMemo, useState, type ReactNode } from 'react';
import {
  upsertAdminCrosswordPuzzle,
  deleteAdminCrosswordPuzzle,
  type AdminCrosswordPuzzle,
  type CrosswordWordInput,
} from '../lib/api';

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
    } catch (e: any) {
      // The server re-validates everything (grid bounds, letter conflicts,
      // clue numbering) independently — a save can still fail here even
      // when the client-side preview looks clean, so this message is the
      // one that actually matters.
      setError(e?.message || 'Could not save this level.');
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
    } catch (e: any) {
      setError(e?.message || 'Could not delete this level.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
            {puzzle ? `Edit Level #${puzzle.id}` : 'New Crossword Level'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-bold text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title">
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. In the Kitchen" />
            </Field>
            <Field label="Grid size">
              <input
                type="number"
                min={5}
                max={15}
                className={inputCls}
                value={size}
                onChange={(e) => setSize(Math.max(5, Math.min(15, Number(e.target.value) || 7)))}
              />
            </Field>
            <Field label="Bonus word">
              <input
                className={inputCls}
                value={bonusWord}
                onChange={(e) => setBonusWord(e.target.value)}
                placeholder="Hidden word — never appears on the grid"
              />
            </Field>
            <Field label="Bonus hint">
              <input className={inputCls} value={bonusHint} onChange={(e) => setBonusHint(e.target.value)} placeholder="Shown to the player" />
            </Field>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
            Published (visible to players)
          </label>

          <div className="mt-6 grid gap-6 lg:grid-cols-[auto_1fr]">
            {/* Live grid preview */}
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Live preview</div>
              <div
                className="mt-2 grid gap-[2px] rounded-xl bg-slate-200 p-[2px] dark:bg-slate-700"
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
                            ? 'bg-red-400 text-white'
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
                <div className="mt-2 text-xs font-bold text-red-600 dark:text-red-400">
                  {conflicts.size} conflicting/out-of-bounds cell{conflicts.size === 1 ? '' : 's'} — fix before saving.
                </div>
              )}
            </div>

            {/* Word list */}
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Words ({words.length})</div>
              <div className="mt-2 flex flex-col gap-2">
                {words.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                        {w.answer}{' '}
                        <span className="font-semibold text-slate-400">
                          · {w.direction} · row {w.row + 1}, col {w.col + 1}
                        </span>
                      </div>
                      <div className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{w.clue}</div>
                    </div>
                    <button
                      onClick={() => removeWord(i)}
                      className="shrink-0 rounded-xl px-2 py-1 text-xs font-bold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {words.length === 0 && <div className="text-sm font-semibold text-slate-400">No words yet — add one below.</div>}
              </div>

              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <input
                    className={inputCls + ' sm:col-span-2'}
                    placeholder="Answer"
                    value={wAnswer}
                    onChange={(e) => setWAnswer(e.target.value)}
                  />
                  <select className={inputCls} value={wDirection} onChange={(e) => setWDirection(e.target.value as Direction)}>
                    <option value="across">Across</option>
                    <option value="down">Down</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={size}
                    className={inputCls}
                    placeholder="Row"
                    value={wRow}
                    onChange={(e) => setWRow(Number(e.target.value) || 1)}
                  />
                  <input
                    type="number"
                    min={1}
                    max={size}
                    className={inputCls}
                    placeholder="Col"
                    value={wCol}
                    onChange={(e) => setWCol(Number(e.target.value) || 1)}
                  />
                  <button
                    onClick={addWord}
                    className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    + Add
                  </button>
                </div>
                <input
                  className={inputCls + ' mt-2 w-full'}
                  placeholder="Clue text"
                  value={wClue}
                  onChange={(e) => setWClue(e.target.value)}
                />
                <div className="mt-1 text-[11px] font-semibold text-slate-400">Row/col are 1-indexed from the top-left.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 dark:border-slate-800">
          {puzzle ? (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="rounded-2xl px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Delete level
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {saving ? 'Saving…' : 'Save level'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}

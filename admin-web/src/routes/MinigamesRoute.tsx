import { useMemo, useState } from 'react';
import { MotionPanel, MotionSection } from '../ui/motion';
import { useAdminSearch } from '../state/AdminSearchContext';
import { matchesAdminSearch } from '../lib/adminSearch';
import { CROSSWORD_PUZZLES, type CrosswordPuzzle, type CrosswordClue } from '../data/crosswordPuzzles';

const PUZZLES = CROSSWORD_PUZZLES;

type GameTab = 'crossword' | 'word' | 'g2048';

export function MinigamesRoute() {
  const { searchQuery } = useAdminSearch();
  const [tab, setTab] = useState<GameTab>('crossword');
  const [selectedId, setSelectedId] = useState<number>(PUZZLES[0]?.id ?? 1);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return PUZZLES;
    return PUZZLES.filter((p) =>
      matchesAdminSearch(searchQuery, p.title, `#${p.id}`, ...p.clues.map((c) => `${c.answer} ${c.clue}`)),
    );
  }, [searchQuery]);

  const selected = PUZZLES.find((p) => p.id === selectedId) ?? PUZZLES[0];

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Minigames</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Scoring rules and content for the in-app mini games. Crossword answers are shown for support.
        </div>
      </MotionSection>

      {/* Game selector */}
      <div className="mt-5 inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        {([
          ['crossword', 'Crossword'],
          ['word', 'Word Game'],
          ['g2048', '2048'],
        ] as [GameTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              'rounded-xl px-4 py-2 text-sm font-bold transition ' +
              (tab === key
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'crossword' && (
        <CrosswordSection
          puzzles={filtered}
          selected={selected}
          onSelect={setSelectedId}
        />
      )}
      {tab === 'word' && <WordGameSection />}
      {tab === 'g2048' && <Game2048Section />}
    </div>
  );
}

// ───────────────────────── Crossword ─────────────────────────

function CrosswordSection({
  puzzles,
  selected,
  onSelect,
}: {
  puzzles: CrosswordPuzzle[];
  selected: CrosswordPuzzle | undefined;
  onSelect: (id: number) => void;
}) {
  return (
    <>
      <MotionPanel className="mt-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Crossword rules</div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Puzzles" value={`${PUZZLES.length}`} />
            <Stat label="Per day" value="2" />
            <Stat label="Base points" value="100" />
            <Stat label="Bonus word" value="+25 each" />
            <Stat label="Streak bonus" value="+5/day (max +35)" />
            <Stat label="Grid" value="7 × 7" />
            <Stat label="Language" value="English" />
            <Stat label="Ranking" value="Total points" />
          </div>
        </div>
      </MotionPanel>

      <div className="mt-6 grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Puzzle list */}
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="max-h-[70vh] overflow-y-auto">
              {puzzles.map((p) => {
                const active = selected?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p.id)}
                    className={
                      'flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ' +
                      (active
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800')
                    }
                  >
                    <span className="font-bold">#{p.id} · {p.title}</span>
                    <span className={active ? 'text-white/70 dark:text-slate-600' : 'text-slate-400'}>{p.clues.length}w</span>
                  </button>
                );
              })}
              {puzzles.length === 0 && (
                <div className="px-4 py-6 text-center text-sm font-semibold text-slate-400">No puzzles match your search.</div>
              )}
            </div>
          </div>
        </MotionPanel>

        {/* Detail: grid + answers */}
        <MotionPanel>
          {selected && <PuzzleDetail puzzle={selected} />}
        </MotionPanel>
      </div>
    </>
  );
}

function PuzzleDetail({ puzzle }: { puzzle: CrosswordPuzzle }) {
  // Map start-cell numbers + bonus cells for rendering.
  const numberAt = new Map<string, number>();
  const bonusCell = new Set<string>();
  for (const clue of puzzle.clues) {
    numberAt.set(`${clue.row},${clue.col}`, clue.number);
    const [dr, dc] = clue.direction === 'across' ? [0, 1] : [1, 0];
    for (let i = 0; i < clue.answer.length; i++) {
      if (clue.bonus) bonusCell.add(`${clue.row + dr * i},${clue.col + dc * i}`);
    }
  }

  const across = puzzle.clues.filter((c) => c.direction === 'across').sort((a, b) => a.number - b.number);
  const down = puzzle.clues.filter((c) => c.direction === 'down').sort((a, b) => a.number - b.number);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="text-lg font-black text-slate-900 dark:text-slate-100">#{puzzle.id} · {puzzle.title}</div>
        <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          ★ Bonus: {puzzle.bonusWord}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-6 lg:flex-row">
        {/* Grid */}
        <div className="shrink-0">
          <div
            className="grid gap-[2px] rounded-xl bg-slate-200 p-[2px] dark:bg-slate-700"
            style={{ gridTemplateColumns: `repeat(${puzzle.size}, 34px)` }}
          >
            {puzzle.solution.flatMap((row, r) =>
              row.map((ch, c) => {
                const key = `${r},${c}`;
                if (ch === null) {
                  return <div key={key} className="h-[34px] w-[34px] rounded-[3px] bg-slate-300 dark:bg-slate-800" />;
                }
                const num = numberAt.get(key);
                const isBonus = bonusCell.has(key);
                return (
                  <div
                    key={key}
                    className={
                      'relative grid h-[34px] w-[34px] place-items-center rounded-[3px] text-sm font-black ' +
                      (isBonus
                        ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-400 dark:bg-amber-500/10 dark:text-amber-200'
                        : 'bg-white text-slate-900 dark:bg-slate-100 dark:text-slate-900')
                    }
                  >
                    {num != null && (
                      <span className="absolute left-[2px] top-[1px] text-[8px] font-bold text-slate-400">{num}</span>
                    )}
                    {ch}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        {/* Clues + answers */}
        <div className="min-w-0 flex-1 grid gap-5 sm:grid-cols-2">
          <ClueList title="Across" clues={across} />
          <ClueList title="Down" clues={down} />
        </div>
      </div>
    </div>
  );
}

function ClueList({ title, clues }: { title: string; clues: CrosswordClue[] }) {
  return (
    <div>
      <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-2 flex flex-col gap-2">
        {clues.map((c) => (
          <div key={`${c.direction}-${c.number}`} className="text-sm">
            <span className="font-black text-slate-900 dark:text-slate-100">{c.number}.</span>{' '}
            <span className="text-slate-600 dark:text-slate-300">{c.clue}</span>{' '}
            <span className={'font-bold ' + (c.bonus ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-400')}>
              — {c.answer}{c.bonus ? ' ★' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-base font-black text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

// ───────────────────────── Word game ─────────────────────────

function WordGameSection() {
  return (
    <MotionPanel className="mt-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="text-lg font-black text-slate-900 dark:text-slate-100">Word Game (Connections)</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Group 16 words into 4 hidden categories. Puzzle content ships inside the app.
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Levels" value="100" />
          <Stat label="Perfect score" value="250 + time bonus" />
          <Stat label="Mistake penalty" value="-50 each" />
          <Stat label="Ranking" value="Total score" />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
          Scores sync to <code className="font-mono">word_game_scores</code>. Leaderboards (global / friends) are shown in-app.
        </div>
      </div>
    </MotionPanel>
  );
}

// ───────────────────────── 2048 ─────────────────────────

function Game2048Section() {
  return (
    <MotionPanel className="mt-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="text-lg font-black text-slate-900 dark:text-slate-100">2048 Challenge</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Slide and merge tiles. Rencana Points are awarded by the highest tile reached.
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Reach 128" value="+5" />
          <Stat label="Reach 256" value="+10" />
          <Stat label="Reach 512" value="+20" />
          <Stat label="Reach 1024" value="+50" />
          <Stat label="Reach 2048" value="+100" />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
          Scores sync to <code className="font-mono">game_2048_scores</code>. Ranked by highest tile, then best score.
        </div>
      </div>
    </MotionPanel>
  );
}

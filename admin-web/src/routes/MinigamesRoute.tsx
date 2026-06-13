import { useEffect, useMemo, useState } from 'react';
import { MotionPanel, MotionSection } from '../ui/motion';
import { useAdminSearch } from '../state/AdminSearchContext';
import { matchesAdminSearch } from '../lib/adminSearch';
import { supabase } from '../lib/supabase';
import { CROSSWORD_PUZZLES, type CrosswordPuzzle, type CrosswordClue } from '../data/crosswordPuzzles';
import { CONNECTIONS_PUZZLES, type ConnectionsPuzzle } from '../data/connectionsPuzzles';

const PUZZLES = CROSSWORD_PUZZLES;

type GameTab = 'crossword' | 'word' | 'g2048';

export function MinigamesRoute() {
  const [tab, setTab] = useState<GameTab>('crossword');

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Minigames</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Top players, scoring rules and full content for the in-app mini games. Crossword answers and the hidden bonus word are shown for support.
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

      {tab === 'crossword' && <CrosswordSection />}
      {tab === 'word' && <WordGameSection />}
      {tab === 'g2048' && <Game2048Section />}
    </div>
  );
}

// ───────────────────────── Leaderboard (shared) ─────────────────────────

interface LbRow {
  user_id: string;
  name: string;
  avatar_url?: string;
  primary: number;
  secondary: string;
}

async function withNames(
  rows: any[],
  map: (r: any) => { primary: number; secondary: string },
): Promise<LbRow[]> {
  const ids = rows.map((r) => r.user_id).filter(Boolean);
  let profileMap = new Map<string, any>();
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, name, avatar_url').in('id', ids);
    profileMap = new Map((profs || []).map((p: any) => [p.id, p]));
  }
  return rows.map((r) => {
    const p = profileMap.get(r.user_id);
    return { user_id: r.user_id, name: p?.name || 'Player', avatar_url: p?.avatar_url, ...map(r) };
  });
}

async function loadCrosswordLb(): Promise<LbRow[]> {
  const { data, error } = await supabase
    .from('crossword_scores')
    .select('user_id, total_points, puzzles_completed, best_streak')
    .order('total_points', { ascending: false })
    .order('puzzles_completed', { ascending: false })
    .limit(10);
  if (error) throw error;
  return withNames(data || [], (r) => ({
    primary: r.total_points ?? 0,
    secondary: `${r.puzzles_completed ?? 0} solved · 🔥 ${r.best_streak ?? 0}`,
  }));
}

async function load2048Lb(): Promise<LbRow[]> {
  const { data, error } = await supabase
    .from('game_2048_scores')
    .select('user_id, best_score, best_tile, games_played')
    .order('best_tile', { ascending: false })
    .order('best_score', { ascending: false })
    .limit(10);
  if (error) throw error;
  return withNames(data || [], (r) => ({
    primary: r.best_score ?? 0,
    secondary: `tile ${r.best_tile ?? 0} · ${r.games_played ?? 0} games`,
  }));
}

async function loadWordLb(): Promise<LbRow[]> {
  // Word game stores one row per puzzle, so aggregate via RPC; fall back to a
  // client-side sum if the RPC isn't deployed.
  const rpc = await supabase.rpc('get_word_game_leaderboard', { p_limit: 10 });
  if (!rpc.error && rpc.data) {
    return withNames(rpc.data, (r) => ({
      primary: Number(r.total_score) || 0,
      secondary: `${r.puzzles_solved ?? 0} solved`,
    }));
  }
  const { data, error } = await supabase.from('word_game_scores').select('user_id, score').limit(5000);
  if (error) throw error;
  const totals = new Map<string, { score: number; n: number }>();
  for (const r of data || []) {
    const cur = totals.get(r.user_id) || { score: 0, n: 0 };
    cur.score += r.score ?? 0;
    cur.n += 1;
    totals.set(r.user_id, cur);
  }
  const top = [...totals.entries()]
    .map(([user_id, v]) => ({ user_id, total_score: v.score, puzzles_solved: v.n }))
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 10);
  return withNames(top, (r) => ({ primary: r.total_score, secondary: `${r.puzzles_solved} solved` }));
}

const MEDAL = ['🥇', '🥈', '🥉'];

function GameLeaderboard({ title, unit, load }: { title: string; unit: string; load: () => Promise<LbRow[]> }) {
  const [rows, setRows] = useState<LbRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    setRows(null);
    setErr(null);
    load()
      .then((r) => on && setRows(r))
      .catch((e) => on && setErr(e?.message || 'Failed to load'));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
        <div className="text-xs font-bold text-slate-400">Top 10</div>
      </div>

      {err && <div className="mt-4 text-sm font-semibold text-rose-500">{err}</div>}
      {!rows && !err && <div className="mt-4 text-sm font-semibold text-slate-400">Loading…</div>}
      {rows && rows.length === 0 && (
        <div className="mt-4 text-sm font-semibold text-slate-400">No scores yet.</div>
      )}

      {rows && rows.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <div
              key={r.user_id}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 odd:bg-slate-50 dark:odd:bg-slate-950/40"
            >
              <div className="w-7 text-center text-sm font-black text-slate-500 dark:text-slate-400">
                {i < 3 ? MEDAL[i] : i + 1}
              </div>
              {r.avatar_url ? (
                <img src={r.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-200 text-xs font-black text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  {(r.name[0] || '?').toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{r.name}</div>
                <div className="truncate text-xs font-semibold text-slate-400">{r.secondary}</div>
              </div>
              <div className="text-right">
                <div className="text-base font-black text-slate-900 dark:text-slate-100">{r.primary.toLocaleString()}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{unit}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Crossword ─────────────────────────

function CrosswordSection() {
  const { searchQuery } = useAdminSearch();
  const [selectedId, setSelectedId] = useState<number>(PUZZLES[0]?.id ?? 1);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return PUZZLES;
    return PUZZLES.filter((p) =>
      matchesAdminSearch(searchQuery, p.title, `#${p.id}`, p.bonusWord, ...p.clues.map((c) => `${c.answer} ${c.clue}`)),
    );
  }, [searchQuery]);

  const selected = PUZZLES.find((p) => p.id === selectedId) ?? PUZZLES[0];

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
      {/* Left column: rules + puzzle browser */}
      <div className="flex min-w-0 flex-col gap-5">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Crossword rules</div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Puzzles" value={`${PUZZLES.length}`} />
              <Stat label="Per day" value="2 (in order)" />
              <Stat label="Base points" value="100" />
              <Stat label="Hidden bonus" value="+25 if guessed" />
              <Stat label="Streak bonus" value="+5/day (max +35)" />
              <Stat label="Hints" value="2 per puzzle" />
              <Stat label="Grid" value="7 × 7" />
              <Stat label="Ranking" value="Total points" />
            </div>
          </div>
        </MotionPanel>

        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          {/* Puzzle list */}
          <MotionPanel>
            <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <div className="max-h-[70vh] overflow-y-auto">
                {filtered.map((p) => {
                  const active = selected?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
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
                {filtered.length === 0 && (
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
      </div>

      {/* Right rail: leaderboard */}
      <MotionPanel>
        <GameLeaderboard title="Crossword leaders" unit="pts" load={loadCrosswordLb} />
      </MotionPanel>
    </div>
  );
}

function PuzzleDetail({ puzzle }: { puzzle: CrosswordPuzzle }) {
  const numberAt = new Map<string, number>();
  for (const clue of puzzle.clues) {
    numberAt.set(`${clue.row},${clue.col}`, clue.number);
  }

  const across = puzzle.clues.filter((c) => c.direction === 'across').sort((a, b) => a.number - b.number);
  const down = puzzle.clues.filter((c) => c.direction === 'down').sort((a, b) => a.number - b.number);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div className="text-lg font-black text-slate-900 dark:text-slate-100">#{puzzle.id} · {puzzle.title}</div>

      {/* Hidden bonus word — not part of the grid */}
      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
          🔍 Hidden bonus word · never appears on the board
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/70 px-3 py-2 dark:bg-slate-900/40">
            <div className="text-[10px] font-black uppercase tracking-wide text-amber-600/80 dark:text-amber-400/70">Answer</div>
            <div className="mt-0.5 text-xl font-black tracking-widest text-amber-800 dark:text-amber-200">{puzzle.bonusWord}</div>
          </div>
          <div className="rounded-xl bg-white/70 px-3 py-2 dark:bg-slate-900/40">
            <div className="text-[10px] font-black uppercase tracking-wide text-amber-600/80 dark:text-amber-400/70">Hint shown to player</div>
            <div className="mt-0.5 text-sm font-semibold text-amber-800/90 dark:text-amber-200/90">“{puzzle.bonusHint}”</div>
          </div>
        </div>
        <div className="mt-2 text-xs font-semibold text-amber-700/70 dark:text-amber-300/70">
          Players tap “Find the hidden word”, read the hint and type a guess. A correct guess adds +25 points; otherwise the puzzle still completes normally.
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
                return (
                  <div
                    key={key}
                    className="relative grid h-[34px] w-[34px] place-items-center rounded-[3px] bg-white text-sm font-black text-slate-900 dark:bg-slate-100 dark:text-slate-900"
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
            <span className="font-bold text-emerald-600 dark:text-emerald-400">— {c.answer}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Word game ─────────────────────────

const WORD_COLORS: Record<string, string> = {
  yellow: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200',
  purple: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200',
};

function WordGameSection() {
  const { searchQuery } = useAdminSearch();
  const [selectedId, setSelectedId] = useState<number>(CONNECTIONS_PUZZLES[0]?.id ?? 1);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return CONNECTIONS_PUZZLES;
    return CONNECTIONS_PUZZLES.filter((p) =>
      matchesAdminSearch(searchQuery, `#${p.id}`, ...p.groups.flatMap((g) => [g.label, ...g.words])),
    );
  }, [searchQuery]);

  const selected = CONNECTIONS_PUZZLES.find((p) => p.id === selectedId) ?? CONNECTIONS_PUZZLES[0];

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
      {/* Left column: rules + level browser */}
      <div className="flex min-w-0 flex-col gap-5">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="text-lg font-black text-slate-900 dark:text-slate-100">Word Game (Connections)</div>
            <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Group 16 words into 4 hidden categories per level.
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Levels" value={`${CONNECTIONS_PUZZLES.length}`} />
              <Stat label="Perfect score" value="250 + time bonus" />
              <Stat label="Mistake penalty" value="-50 each" />
              <Stat label="Ranking" value="Total score" />
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
              Scores sync to <code className="font-mono">word_game_scores</code> (one row per level). Difficulty rises by level: 1–20 easy, 21–40 medium, 41–60 hard, 61–80 very hard, 81–100 expert.
            </div>
          </div>
        </MotionPanel>

        <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
          {/* Level list */}
          <MotionPanel>
            <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <div className="max-h-[70vh] overflow-y-auto">
                {filtered.map((p) => {
                  const active = selected?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={
                        'flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ' +
                        (active
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800')
                      }
                    >
                      <span className="font-bold">Level #{p.id}</span>
                      <span className={active ? 'text-white/70 dark:text-slate-600' : 'text-slate-400'}>{levelTier(p.id)}</span>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm font-semibold text-slate-400">No levels match your search.</div>
                )}
              </div>
            </div>
          </MotionPanel>

          {/* Answers */}
          <MotionPanel>
            {selected && <WordPuzzleDetail puzzle={selected} />}
          </MotionPanel>
        </div>
      </div>

      {/* Right rail: leaderboard */}
      <MotionPanel>
        <GameLeaderboard title="Word Game leaders" unit="pts" load={loadWordLb} />
      </MotionPanel>
    </div>
  );
}

function levelTier(id: number): string {
  if (id <= 20) return 'Easy';
  if (id <= 40) return 'Medium';
  if (id <= 60) return 'Hard';
  if (id <= 80) return 'V.Hard';
  return 'Expert';
}

function WordPuzzleDetail({ puzzle }: { puzzle: ConnectionsPuzzle }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="text-lg font-black text-slate-900 dark:text-slate-100">Level #{puzzle.id}</div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {levelTier(puzzle.id)}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {puzzle.groups.map((g, i) => (
          <div key={i} className={'rounded-2xl px-4 py-3 ' + (WORD_COLORS[g.color] || WORD_COLORS.yellow)}>
            <div className="text-xs font-black uppercase tracking-wide opacity-80">{g.label}</div>
            <div className="mt-1 text-sm font-black tracking-wide">{g.words.join(' · ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── 2048 ─────────────────────────

function Game2048Section() {
  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
      <MotionPanel>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="text-lg font-black text-slate-900 dark:text-slate-100">2048 Challenge</div>
          <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
            Slide and merge tiles. Rencana Points are awarded by the highest tile reached.
          </div>

          <div className="mt-4 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Settings</div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Grid" value="4 × 4" />
            <Stat label="New tile" value="2 or 4" />
            <Stat label="Win tile" value="2048" />
            <Stat label="After win" value="Keep playing" />
            <Stat label="Best score" value="Saved locally" />
            <Stat label="Ranking" value="Highest tile, then score" />
            <Stat label="Controls" value="Swipe / arrows" />
            <Stat label="Storage" value="game_2048_scores" />
          </div>

          <div className="mt-5 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Rencana Points by tile</div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Reach 128" value="+5" />
            <Stat label="Reach 256" value="+10" />
            <Stat label="Reach 512" value="+20" />
            <Stat label="Reach 1024" value="+50" />
            <Stat label="Reach 2048" value="+100" />
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
            There are no fixed answers — 2048 is procedural. Points are granted once per milestone tile per game; the leaderboard ranks by the highest tile ever reached, then best score.
          </div>
        </div>
      </MotionPanel>
      <MotionPanel>
        <GameLeaderboard title="2048 leaders" unit="score" load={load2048Lb} />
      </MotionPanel>
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

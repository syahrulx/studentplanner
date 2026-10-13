import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MotionPanel, MotionSection } from '../ui/motion';
import { Button } from '../ui/Button';
import { Chip, EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SkeletonRows } from '../ui/page';
import { Footnote, RuleList } from '../components/config/RuleList';
import { errorText } from '../components/config/errorText';
import { useAdminSearch } from '../state/AdminSearchContext';
import { matchesAdminSearch } from '../lib/adminSearch';
import { supabase } from '../lib/supabase';
import {
  CROSSWORD_PUZZLES,
  MOVIE_CROSSWORD_PUZZLES,
  type CrosswordPuzzle,
  type CrosswordClue,
} from '../data/crosswordPuzzles';
import { CONNECTIONS_PUZZLES, type ConnectionsPuzzle } from '../data/connectionsPuzzles';
import { listAdminCrosswordPuzzles, type AdminCrosswordPuzzle } from '../lib/api';
import { CrosswordPuzzleEditor } from '../components/CrosswordPuzzleEditor';

/**
 * The packs, named the same way the app names them.
 *
 * This page used to show one flat list of the Starter Pack plus whatever
 * admins had created, which is what the app did too before the two were split
 * — so neither matched what a student sees.
 */
const PACKS: { label: string; puzzles: CrosswordPuzzle[] }[] = [
  { label: 'Starter Pack', puzzles: CROSSWORD_PUZZLES },
  { label: 'Movie Night', puzzles: MOVIE_CROSSWORD_PUZZLES },
];
const PUZZLES = PACKS.flatMap((p) => p.puzzles);

/** Admin-created levels (ids >= 31) reshaped to the same display type as the hardcoded ones. */
function adminPuzzleToDisplay(p: AdminCrosswordPuzzle): CrosswordPuzzle {
  return {
    id: p.id,
    title: p.title,
    size: p.size,
    solution: p.solution,
    clues: p.clues,
    bonusWord: p.bonus_word,
    bonusHint: p.bonus_hint,
  };
}

type GameTab = 'crossword' | 'word' | 'g2048';

export function MinigamesRoute() {
  const [tab, setTab] = useState<GameTab>('crossword');

  return (
    <div className="space-y-5">
      <MotionSection>
        <PageHeader
          title="Minigames"
          description="Top players, scoring rules and full content for the in-app mini games. Answers and the hidden bonus word are shown for support."
        />
      </MotionSection>

      <div role="group" aria-label="Choose a game">
        <PillGroup label="Game">
          {([
            ['crossword', 'Crossword'],
            ['word', 'Word game'],
            ['g2048', '2048'],
          ] as [GameTab, string][]).map(([key, label]) => (
            <Pill key={key} active={tab === key} onClick={() => setTab(key)}>{label}</Pill>
          ))}
        </PillGroup>
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

type ProfileLite = { id: string; name?: string | null; avatar_url?: string | null };

async function withNames<R extends { user_id: string }>(
  rows: R[],
  map: (r: R) => { primary: number; secondary: string },
): Promise<LbRow[]> {
  const ids = rows.map((r) => r.user_id).filter(Boolean);
  let profileMap = new Map<string, ProfileLite>();
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, name, avatar_url').in('id', ids);
    profileMap = new Map(((profs || []) as ProfileLite[]).map((p) => [p.id, p]));
  }
  return rows.map((r) => {
    const p = profileMap.get(r.user_id);
    return { user_id: r.user_id, name: p?.name || 'Player', avatar_url: p?.avatar_url ?? undefined, ...map(r) };
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
    secondary: `${r.puzzles_completed ?? 0} solved · best streak ${r.best_streak ?? 0}`,
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
    const rpcRows = rpc.data as { user_id: string; total_score: number | string | null; puzzles_solved: number | null }[];
    return withNames(rpcRows, (r) => ({
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

/** Gold, silver and bronze tints for the top three ranks. */
const RANK_TONE = [
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
];

const SUB_LABEL = 'text-[11px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500';

function GameLeaderboard({ unit, load }: { unit: string; load: () => Promise<LbRow[]> }) {
  const [rows, setRows] = useState<LbRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    setRows(null);
    setErr(null);
    load()
      .then((r) => on && setRows(r))
      .catch((e) => on && setErr(errorText(e, 'Failed to load')));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Panel title="Top 10 players">
      {err && <Notice tone="danger">{err}</Notice>}
      {!rows && !err && <SkeletonRows rows={4} height="h-10" />}
      {rows && rows.length === 0 && <EmptyState title="No scores yet." />}

      {rows && rows.length > 0 && (
        <ol className="-mx-2 flex flex-col gap-0.5">
          {rows.map((r, i) => (
            <li key={r.user_id} className="flex items-center gap-3 rounded-2xl px-2 py-2 odd:bg-slate-50 dark:odd:bg-slate-950/40">
              <span
                className={
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ' +
                  (i < 3 ? RANK_TONE[i] : 'text-slate-500 dark:text-slate-400')
                }
                aria-label={`Rank ${i + 1}`}
              >
                {i + 1}
              </span>
              {r.avatar_url ? (
                <img src={r.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-black text-slate-600 dark:bg-slate-700 dark:text-slate-200" aria-hidden="true">
                  {(r.name[0] || '?').toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{r.name}</div>
                <div className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{r.secondary}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black tabular-nums text-slate-900 dark:text-slate-100">{r.primary.toLocaleString()}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{unit}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** One row of a game's level list (selected = dark). */
function LevelButton({ active, onClick, label, meta }: { active: boolean; onClick: () => void; label: ReactNode; meta: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left text-sm transition ' +
        (active
          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800')
      }
    >
      <span className="min-w-0 truncate font-bold">{label}</span>
      <span className={'shrink-0 text-xs ' + (active ? 'text-white/70 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500')}>{meta}</span>
    </button>
  );
}

// ───────────────────────── Crossword ─────────────────────────

/** Admin-created level ids always start at 31 — see 20260806000003_crossword_puzzles_table.sql. */
/**
 * Which puzzles an admin may edit.
 *
 * This was `id >= 31`, which worked only while everything above 30 lived in
 * the database. Movie Night ships in the app at 1001+, so an id test now marks
 * it editable and offers an Edit button for a row that does not exist. The
 * only honest answer is whether the id came back from the admin table.
 */
function makeIsAdminPuzzle(adminIds: Set<number>) {
  return (id: number) => adminIds.has(id);
}

function CrosswordSection() {
  const { searchQuery } = useAdminSearch();
  const [adminPuzzles, setAdminPuzzles] = useState<AdminCrosswordPuzzle[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); // null while adding a new level
  const [selectedId, setSelectedId] = useState<number>(PUZZLES[0]?.id ?? 1);

  async function refreshAdminPuzzles() {
    setLoadingAdmin(true);
    setLoadError(null);
    try {
      setAdminPuzzles(await listAdminCrosswordPuzzles());
    } catch (e) {
      setLoadError(errorText(e, 'Could not load admin-created levels.'));
    } finally {
      setLoadingAdmin(false);
    }
  }

  useEffect(() => {
    void refreshAdminPuzzles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adminIds = useMemo(() => new Set(adminPuzzles.map((p) => p.id)), [adminPuzzles]);
  const isAdminPuzzle = useMemo(() => makeIsAdminPuzzle(adminIds), [adminIds]);

  /** The packs as the app groups them, plus whatever admins have added. */
  const groups = useMemo(() => {
    const out = PACKS.map((pack) => ({ label: pack.label, puzzles: pack.puzzles }));
    const extra = adminPuzzles.map(adminPuzzleToDisplay);
    if (extra.length > 0) out.push({ label: 'Extra Puzzles', puzzles: extra });
    return out;
  }, [adminPuzzles]);

  const combined = useMemo(() => groups.flatMap((g) => g.puzzles), [groups]);

  /** Search narrows inside each pack, so the headings stay meaningful. */
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return groups;
    return groups
      .map((g) => ({
        label: g.label,
        puzzles: g.puzzles.filter((p) =>
          matchesAdminSearch(q, p.title, `#${p.id}`, p.bonusWord, ...p.clues.map((c) => `${c.answer} ${c.clue}`)),
        ),
      }))
      .filter((g) => g.puzzles.length > 0);
  }, [groups, searchQuery]);
  const filteredCount = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.puzzles.length, 0),
    [filteredGroups],
  );

  const selected = combined.find((p) => p.id === selectedId) ?? combined[0];
  const editingPuzzle = editingId != null ? adminPuzzles.find((p) => p.id === editingId) ?? null : null;

  function openNewEditor() {
    setEditingId(null);
    setEditorOpen(true);
  }
  function openEditEditor(id: number) {
    setEditingId(id);
    setEditorOpen(true);
  }
  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
  }
  async function handleSaved() {
    closeEditor();
    await refreshAdminPuzzles();
  }

  return (
    <div className="space-y-5">
      {loadError && <Notice tone="danger">{loadError}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <MotionPanel>
          <Panel title="Crossword rules">
            <RuleList
              items={[
                ['Puzzles', combined.length],
                ['Per day', '2 (in order)'],
                ['Base points', '100'],
                ['Hidden bonus', '+25 if guessed'],
                ['Streak bonus', '+5/day (max +35)'],
                ['Hints', '2 per puzzle'],
                ['Grid', 'Admin-defined (5–15)'],
                ['Ranking', 'Total points'],
              ]}
            />
            <Footnote>
              Hidden bonus word: players tap “Find the hidden word”, read the hint and type a guess. It never appears on the board.
              A correct guess adds +25 points; otherwise the puzzle still completes normally.
            </Footnote>
          </Panel>
        </MotionPanel>
        <MotionPanel>
          <GameLeaderboard unit="pts" load={loadCrosswordLb} />
        </MotionPanel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        {/* Puzzle list */}
        <MotionPanel>
          <Panel
            title="Levels"
            actions={<Button type="button" size="sm" onClick={openNewEditor}>+ Add level</Button>}
            padded={false}
          >
            <div className="max-h-[70vh] overflow-y-auto p-2">
              {filteredGroups.map((group) => (
                <div key={group.label}>
                  <div className={'sticky top-0 z-10 bg-white px-3 pb-1.5 pt-3 dark:bg-slate-900 ' + SUB_LABEL}>
                    {group.label} · {group.puzzles.length}
                  </div>
                  {group.puzzles.map((p) => {
                    const isAdmin = isAdminPuzzle(p.id);
                    return (
                      <LevelButton
                        key={p.id}
                        active={selected?.id === p.id}
                        onClick={() => setSelectedId(p.id)}
                        label={
                          <>
                            #{p.id} · {p.title}
                            {isAdmin && <span className="ml-1.5 opacity-60" title="Admin-created, can be edited" aria-label="Admin-created">★</span>}
                          </>
                        }
                        meta={`${p.clues.length}w`}
                      />
                    );
                  })}
                </div>
              ))}
              {loadingAdmin && (
                <div className="px-3 py-3 text-center text-xs font-semibold text-slate-400 dark:text-slate-500">Loading admin levels…</div>
              )}
              {filteredCount === 0 && !loadingAdmin && (
                <div className="px-3 py-6 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">No puzzles match your search.</div>
              )}
            </div>
          </Panel>
        </MotionPanel>

        {/* Detail: grid + answers */}
        <MotionPanel>
          {selected && (
            <PuzzleDetail
              puzzle={selected}
              isAdminPuzzle={isAdminPuzzle(selected.id)}
              onEdit={() => openEditEditor(selected.id)}
            />
          )}
        </MotionPanel>
      </div>

      {editorOpen && (
        <CrosswordPuzzleEditor puzzle={editingPuzzle} onClose={closeEditor} onSaved={handleSaved} />
      )}
    </div>
  );
}

function PuzzleDetail({
  puzzle,
  isAdminPuzzle,
  onEdit,
}: {
  puzzle: CrosswordPuzzle;
  isAdminPuzzle?: boolean;
  onEdit?: () => void;
}) {
  const numberAt = new Map<string, number>();
  for (const clue of puzzle.clues) {
    numberAt.set(`${clue.row},${clue.col}`, clue.number);
  }

  const across = puzzle.clues.filter((c) => c.direction === 'across').sort((a, b) => a.number - b.number);
  const down = puzzle.clues.filter((c) => c.direction === 'down').sort((a, b) => a.number - b.number);

  return (
    <Panel
      title={<span className="text-base">#{puzzle.id} · {puzzle.title}</span>}
      actions={
        isAdminPuzzle ? (
          <Button type="button" variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
        ) : (
          <Chip title="Ships inside the app, so it cannot be edited here">Built-in</Chip>
        )
      }
    >
      <div className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-2 dark:border-amber-900/50 dark:bg-amber-950/40">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">Hidden bonus word</div>
          <div className="mt-0.5 break-words text-xl font-black tracking-widest text-amber-900 dark:text-amber-100">{puzzle.bonusWord}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">Hint shown to player</div>
          <div className="mt-0.5 text-sm font-semibold text-amber-900 dark:text-amber-100">“{puzzle.bonusHint}”</div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-6 xl:flex-row">
        {/* Grid */}
        <div className="shrink-0 overflow-x-auto">
          <div
            className="grid w-max gap-[2px] rounded-xl bg-slate-200 p-[2px] dark:bg-slate-700"
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
        <div className="grid min-w-0 flex-1 gap-5 sm:grid-cols-2">
          <ClueList title="Across" clues={across} />
          <ClueList title="Down" clues={down} />
        </div>
      </div>
    </Panel>
  );
}

function ClueList({ title, clues }: { title: string; clues: CrosswordClue[] }) {
  return (
    <div>
      <div className={SUB_LABEL}>{title}</div>
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
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <MotionPanel>
          <Panel title="Word game (Connections)" description="Group 16 words into 4 hidden categories per level.">
            <RuleList
              items={[
                ['Levels', CONNECTIONS_PUZZLES.length],
                ['Perfect score', '250 + time bonus'],
                ['Mistake penalty', '-50 each'],
                ['Ranking', 'Total score'],
              ]}
            />
            <Footnote>
              Scores sync to <code className="font-mono">word_game_scores</code> (one row per level). Difficulty rises by level:
              1–20 easy, 21–40 medium, 41–60 hard, 61–80 very hard, 81–100 expert.
            </Footnote>
          </Panel>
        </MotionPanel>
        <MotionPanel>
          <GameLeaderboard unit="pts" load={loadWordLb} />
        </MotionPanel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        {/* Level list */}
        <MotionPanel>
          <Panel title="Levels" padded={false}>
            <div className="max-h-[70vh] overflow-y-auto p-2">
              {filtered.map((p) => (
                <LevelButton
                  key={p.id}
                  active={selected?.id === p.id}
                  onClick={() => setSelectedId(p.id)}
                  label={`Level #${p.id}`}
                  meta={levelTier(p.id)}
                />
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">No levels match your search.</div>
              )}
            </div>
          </Panel>
        </MotionPanel>

        {/* Answers */}
        <MotionPanel>
          {selected && <WordPuzzleDetail puzzle={selected} />}
        </MotionPanel>
      </div>
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
    <Panel title={<span className="text-base">Level #{puzzle.id}</span>} actions={<Chip>{levelTier(puzzle.id)}</Chip>}>
      <div className="flex flex-col gap-3">
        {puzzle.groups.map((g, i) => (
          <div key={i} className={'rounded-2xl px-4 py-3 ' + (WORD_COLORS[g.color] || WORD_COLORS.yellow)}>
            <div className="text-xs font-black uppercase tracking-wide opacity-80">{g.label}</div>
            <div className="mt-1 text-sm font-black tracking-wide">{g.words.join(' · ')}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ───────────────────────── 2048 ─────────────────────────

function Game2048Section() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <MotionPanel>
        <Panel title="2048 challenge" description="Slide and merge tiles. Rencana Points are awarded by the highest tile reached.">
          <div className={SUB_LABEL}>Settings</div>
          <div className="mt-2">
            <RuleList
              items={[
                ['Grid', '4 × 4'],
                ['New tile', '2 or 4'],
                ['Win tile', '2048'],
                ['After win', 'Keep playing'],
                ['Best score', 'Saved locally'],
                ['Ranking', 'Highest tile, then score'],
                ['Controls', 'Swipe / arrows'],
                ['Storage', 'game_2048_scores'],
              ]}
            />
          </div>

          <div className={'mt-6 ' + SUB_LABEL}>Rencana Points by tile</div>
          <div className="mt-2">
            <RuleList
              columns={5}
              items={[
                ['Reach 128', '+5'],
                ['Reach 256', '+10'],
                ['Reach 512', '+20'],
                ['Reach 1024', '+50'],
                ['Reach 2048', '+100'],
              ]}
            />
          </div>
          <Footnote>
            There are no fixed answers: 2048 is procedural. Points are granted once per milestone tile per game.
          </Footnote>
        </Panel>
      </MotionPanel>
      <MotionPanel>
        <GameLeaderboard unit="score" load={load2048Lb} />
      </MotionPanel>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MotionSection } from '../ui/motion';
import {
  listConfessionUniversities,
  listConfessionCampusSummary,
  listConfessions,
  listConfessionComments,
  setConfessionStatus,
  setConfessionCommentStatus,
  markConfessionSuspectReviewed,
  listConfessionBlockedWords,
  addConfessionBlockedWord,
  setConfessionBlockedWordActive,
  deleteConfessionBlockedWord,
  rescoreConfessionSuspects,
  type ConfessionUniversitySummary,
  type ConfessionCampusSummary,
  type AdminConfession,
  type AdminConfessionComment,
  type ConfessionBlockedWord,
} from '../lib/api';

const PAGE_SIZE = 25;

/** '' is a real campus key — the rows a single-campus university posts under. */
const campusKey = (campus: string | null) => campus ?? '';
const campusLabel = (campus: string | null) => (campus ?? '').trim() || 'No campus';

function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 30) return `${Math.round(mins / (60 * 24))}d ago`;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

const CARD =
  'rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900';
const PILL_ON =
  'bg-slate-900 text-white dark:bg-white dark:text-slate-950';
const PILL_OFF =
  'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'muted' }) {
  const colour =
    tone === 'amber'
      ? value > 0
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-300 dark:text-slate-600'
      : tone === 'muted'
        ? 'text-slate-400'
        : 'text-slate-900 dark:text-slate-100';
  return (
    <div>
      <div className={`text-xl font-black leading-none ${colour}`}>{value}</div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

function SuspectChips({ terms, reviewed }: { terms: string[]; reviewed?: boolean }) {
  if (!terms?.length) return null;
  // The evidence survives the decision: a cleared flag still shows what was
  // matched, in grey, so the call can be revisited.
  const tone = reviewed
    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${tone}`}>
        {reviewed ? 'Marked safe' : 'Looks like'}
      </span>
      {terms.map((t) => (
        <span
          key={t}
          className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold ${
            reviewed
              ? 'border-slate-200 text-slate-400 dark:border-slate-700'
              : 'border-amber-200 text-amber-700 dark:border-amber-900/60 dark:text-amber-300'
          }`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: AdminConfession['status'] }) {
  const tone =
    status === 'active' ? 'bg-emerald-500' : status === 'flagged' ? 'bg-amber-500' : 'bg-slate-400';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      {status === 'active' ? 'live' : status}
    </span>
  );
}

/**
 * Confession moderation, walked the way the data is shaped: university, then
 * campus, then a page of posts, then one post's replies. Nothing below the
 * level you are looking at is fetched, so opening this screen costs one
 * grouped count no matter how big the wall gets.
 */
export function ConfessionsRoute() {
  const [tab, setTab] = useState<'feed' | 'words'>('feed');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Level 1: universities ─────────────────────────────────────────────────
  const [unis, setUnis] = useState<ConfessionUniversitySummary[]>([]);
  const [unisLoading, setUnisLoading] = useState(true);
  const [uni, setUni] = useState<string | null>(null);

  const loadUnis = useCallback(async () => {
    setUnisLoading(true);
    try {
      setUnis(await listConfessionUniversities());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load universities.');
    } finally {
      setUnisLoading(false);
    }
  }, []);
  useEffect(() => { void loadUnis(); }, [loadUnis]);

  // ── Level 2: campuses ─────────────────────────────────────────────────────
  const [campuses, setCampuses] = useState<ConfessionCampusSummary[]>([]);
  const [campusLoading, setCampusLoading] = useState(false);
  const [campus, setCampus] = useState<ConfessionCampusSummary | null>(null);
  /** Viewing the whole university: the campus filter is dropped, not set. */
  const [allCampuses, setAllCampuses] = useState(false);

  /** Totals across the campuses of the open university. */
  const uniTotals = useMemo(() => campuses.reduce(
    (a, c) => ({
      total: a.total + Number(c.total),
      active: a.active + Number(c.active_count),
      suspect: a.suspect + Number(c.suspect_count),
      reported: a.reported + Number(c.reported_count),
      removed: a.removed + Number(c.removed_count),
    }),
    { total: 0, active: 0, suspect: 0, reported: 0, removed: 0 },
  ), [campuses]);

  const loadCampuses = useCallback(async () => {
    if (!uni) return;
    setCampusLoading(true);
    try {
      setCampuses(await listConfessionCampusSummary(uni));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load campuses.');
    } finally {
      setCampusLoading(false);
    }
  }, [uni]);
  useEffect(() => { void loadCampuses(); }, [loadCampuses]);

  // ── Level 3: posts ────────────────────────────────────────────────────────
  const [rows, setRows] = useState<AdminConfession[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [suspectOnly, setSuspectOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const total = rows[0]?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadRows = useCallback(async () => {
    if (!campus && !(allCampuses && uni)) return;
    setRowsLoading(true);
    try {
      setRows(await listConfessions({
        university: campus?.university_id ?? uni,
        // null means "every campus", which is not the same as '' — that is the
        // key for posts with no campus at all.
        campus: campus ? campusKey(campus.campus) : null,
        status: statusFilter || null,
        suspectOnly,
        search: appliedSearch || null,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load confessions.');
    } finally {
      setRowsLoading(false);
    }
  }, [campus, allCampuses, uni, page, statusFilter, suspectOnly, appliedSearch]);
  useEffect(() => { void loadRows(); }, [loadRows]);

  // ── Level 4: replies, one post at a time ──────────────────────────────────
  const [openReplies, setOpenReplies] = useState<string | null>(null);
  const [replies, setReplies] = useState<AdminConfessionComment[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);

  async function toggleReplies(row: AdminConfession) {
    if (openReplies === row.id) { setOpenReplies(null); return; }
    setOpenReplies(row.id);
    setReplies([]);
    if (row.comment_count === 0) return;
    setRepliesLoading(true);
    try {
      setReplies(await listConfessionComments(row.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load replies.');
    } finally {
      setRepliesLoading(false);
    }
  }

  const [pendingRemove, setPendingRemove] = useState<AdminConfession | null>(null);
  const [removeReason, setRemoveReason] = useState('');

  async function applyStatus(row: AdminConfession, status: AdminConfession['status'], reason?: string) {
    setBusy(true);
    try {
      await setConfessionStatus(row.id, status, reason);
      setPendingRemove(null);
      setRemoveReason('');
      await loadRows();
      await loadCampuses();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that confession.');
    } finally {
      setBusy(false);
    }
  }

  async function markSafe(row: AdminConfession) {
    setBusy(true);
    try {
      await markConfessionSuspectReviewed(row.id, true);
      await loadRows();
      await loadCampuses();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear that flag.');
    } finally {
      setBusy(false);
    }
  }

  async function applyCommentStatus(id: string, status: AdminConfessionComment['status']) {
    setBusy(true);
    try {
      await setConfessionCommentStatus(id, status);
      setReplies((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that reply.');
    } finally {
      setBusy(false);
    }
  }

  // ── Blocked words ─────────────────────────────────────────────────────────
  const [words, setWords] = useState<ConfessionBlockedWord[]>([]);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [newWord, setNewWord] = useState('');

  const loadWords = useCallback(async () => {
    setWordsLoading(true);
    try {
      setWords(await listConfessionBlockedWords());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the word list.');
    } finally {
      setWordsLoading(false);
    }
  }, []);
  useEffect(() => { if (tab === 'words') void loadWords(); }, [tab, loadWords]);

  async function addWord() {
    const pattern = newWord.trim();
    if (pattern.length < 2) { setError('A blocked word needs at least two characters.'); return; }
    setBusy(true);
    try {
      await addConfessionBlockedWord(pattern);
      setNewWord('');
      await loadWords();
      // A new word should flag what is already posted, not only what comes next.
      await rescoreConfessionSuspects();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that word.');
    } finally {
      setBusy(false);
    }
  }

  const activeWords = useMemo(() => words.filter((w) => w.active), [words]);
  const mutedWords = useMemo(() => words.filter((w) => !w.active), [words]);

  const crumbs = (
    <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
      <button
        onClick={() => { setUni(null); setCampus(null); setAllCampuses(false); setRows([]); }}
        className={uni ? 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200' : 'text-slate-900 dark:text-slate-100'}
      >
        All universities
      </button>
      {uni && (
        <>
          <span className="text-slate-300 dark:text-slate-700">/</span>
          <button
            onClick={() => { setCampus(null); setAllCampuses(false); setRows([]); }}
            className={campus || allCampuses ? 'uppercase text-slate-400 hover:text-slate-700 dark:hover:text-slate-200' : 'uppercase text-slate-900 dark:text-slate-100'}
          >
            {uni}
          </button>
        </>
      )}
      {(campus || allCampuses) && (
        <>
          <span className="text-slate-300 dark:text-slate-700">/</span>
          <span className="text-slate-900 dark:text-slate-100">
            {campus ? campusLabel(campus.campus) : 'All campuses'}
          </span>
        </>
      )}
    </div>
  );

  return (
    <div>
      <MotionSection>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              Confessions
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Anonymous posts, campus by campus. Words the filter only suspects are marked for you.
            </div>
          </div>
          <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            {([['feed', 'Feed'], ['words', 'Filter']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  tab === key
                    ? 'bg-white text-slate-900 shadow-elev1 dark:bg-slate-950 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </MotionSection>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {tab === 'feed' && (
        <MotionSection delay={0.06} className="mt-6">
          <div className="mb-4">{crumbs}</div>

          {/* ── Universities ── */}
          {!uni && (
            unisLoading ? (
              <div className={`${CARD} flex items-center justify-center py-20 text-sm font-semibold text-slate-400`}>
                Loading…
              </div>
            ) : unis.length === 0 ? (
              <div className={`${CARD} flex items-center justify-center py-20 text-sm font-semibold text-slate-400`}>
                No confessions have been posted yet.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {unis.map((u) => (
                  <button
                    key={u.university_id}
                    onClick={() => { setUni(u.university_id); setCampus(null); }}
                    className={`${CARD} p-5 text-left transition hover:-translate-y-0.5 hover:shadow-elev1`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">
                          {u.university_id}
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-400">
                          {u.campus_count} campus{u.campus_count === 1 ? '' : 'es'} · {when(u.last_at)}
                        </div>
                      </div>
                      {u.suspect_count > 0 && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          {u.suspect_count} to review
                        </span>
                      )}
                    </div>
                    <div className="mt-5 grid grid-cols-4 gap-3">
                      <Stat label="Live" value={u.active_count} />
                      <Stat label="Flagged" value={u.suspect_count} tone="amber" />
                      <Stat label="Reported" value={u.reported_count} tone="amber" />
                      <Stat label="Removed" value={u.removed_count} tone="muted" />
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── Campuses ── */}
          {uni && !campus && !allCampuses && (
            campusLoading ? (
              <div className={`${CARD} flex items-center justify-center py-20 text-sm font-semibold text-slate-400`}>
                Loading…
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {/* Every campus at once, so "did I see all of them?" has an
                    answer that does not depend on visiting each card. */}
                <button
                  onClick={() => {
                    setAllCampuses(true); setCampus(null);
                    setRows([]); setPage(0); setStatusFilter(''); setSuspectOnly(false);
                    setSearch(''); setAppliedSearch(''); setOpenReplies(null);
                  }}
                  className={`${CARD} p-5 text-left transition hover:-translate-y-0.5 hover:shadow-elev1`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-100">
                      All campuses
                    </div>
                    {uniTotals.suspect > 0 && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        {uniTotals.suspect}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-400">
                    {uniTotals.total} confession{uniTotals.total === 1 ? '' : 's'} in one list
                  </div>
                  <div className="mt-5 grid grid-cols-4 gap-3">
                    <Stat label="Live" value={uniTotals.active} />
                    <Stat label="Flagged" value={uniTotals.suspect} tone="amber" />
                    <Stat label="Reported" value={uniTotals.reported} tone="amber" />
                    <Stat label="Removed" value={uniTotals.removed} tone="muted" />
                  </div>
                </button>

                {campuses.map((c) => (
                  <button
                    key={campusKey(c.campus)}
                    onClick={() => {
                      setCampus(c); setAllCampuses(false);
                      setRows([]); setPage(0); setStatusFilter(''); setSuspectOnly(false);
                      setSearch(''); setAppliedSearch(''); setOpenReplies(null);
                    }}
                    className={`${CARD} p-5 text-left transition hover:-translate-y-0.5 hover:shadow-elev1`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-100">
                        {campusLabel(c.campus)}
                      </div>
                      {c.suspect_count > 0 && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          {c.suspect_count}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-400">{when(c.last_at)}</div>
                    <div className="mt-5 grid grid-cols-4 gap-3">
                      <Stat label="Live" value={c.active_count} />
                      <Stat label="Flagged" value={c.suspect_count} tone="amber" />
                      <Stat label="Reported" value={c.reported_count} tone="amber" />
                      <Stat label="Removed" value={c.removed_count} tone="muted" />
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* ── Posts ── */}
          {(campus || allCampuses) && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {([['', 'All'], ['active', 'Live'], ['flagged', 'Flagged'], ['removed', 'Removed']] as const).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { setStatusFilter(key); setPage(0); }}
                      className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${statusFilter === key ? PILL_ON : PILL_OFF}`}
                    >
                      {label}
                    </button>
                  ),
                )}
                <button
                  onClick={() => { setSuspectOnly((v) => !v); setPage(0); }}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                    suspectOnly
                      ? 'bg-amber-500 text-white'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}
                >
                  Needs review{(campus ? Number(campus.suspect_count) : uniTotals.suspect) > 0
                    ? ` · ${campus ? campus.suspect_count : uniTotals.suspect}` : ''}
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setAppliedSearch(search); setPage(0); } }}
                    placeholder="Search text…"
                    className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  />
                  <button
                    onClick={() => { setAppliedSearch(search); setPage(0); }}
                    className={`rounded-full px-4 py-1.5 text-sm font-bold ${PILL_ON}`}
                  >
                    Search
                  </button>
                </div>
              </div>

              {rowsLoading ? (
                <div className={`${CARD} flex items-center justify-center py-20 text-sm font-semibold text-slate-400`}>
                  Loading…
                </div>
              ) : rows.length === 0 ? (
                <div className={`${CARD} flex items-center justify-center py-20 text-sm font-semibold text-slate-400`}>
                  Nothing matches this filter.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className={`${CARD} flex flex-col p-5 ${
                        row.suspect_terms.length > 0 && !row.suspect_reviewed_at && row.status !== 'removed'
                          ? 'ring-1 ring-amber-300 dark:ring-amber-900/70'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                          <span className="font-mono">#{row.confession_no ?? '—'}</span>
                          <span>·</span>
                          <span>{when(row.created_at)}</span>
                          {row.tag && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400">{row.tag}</span>}
                        </div>
                        <StatusDot status={row.status} />
                      </div>

                      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] font-semibold leading-relaxed text-slate-800 dark:text-slate-200">
                        {row.content}
                      </p>

                      <SuspectChips terms={row.suspect_terms} reviewed={!!row.suspect_reviewed_at} />

                      {row.removed_reason && (
                        <div className="mt-2 text-xs font-semibold text-slate-400">Removed: {row.removed_reason}</div>
                      )}

                      <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs font-bold text-slate-400 dark:border-slate-800">
                        <span>♥ {row.like_count}</span>
                        <button
                          onClick={() => void toggleReplies(row)}
                          className="transition hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          💬 {row.comment_count} {openReplies === row.id ? '▲' : '▾'}
                        </button>
                        {row.report_count > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">⚑ {row.report_count} reported</span>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          {row.suspect_terms.length > 0 && row.status !== 'removed' && (
                            <button
                              disabled={busy}
                              onClick={() => void (row.suspect_reviewed_at
                                ? markConfessionSuspectReviewed(row.id, false).then(loadRows).then(loadCampuses)
                                : markSafe(row))}
                              className={`rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                                row.suspect_reviewed_at
                                  ? 'bg-slate-100 text-slate-500 hover:bg-amber-100 hover:text-amber-700 dark:bg-slate-800 dark:text-slate-400'
                                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300'
                              }`}
                            >
                              {row.suspect_reviewed_at ? 'Flag again' : 'Mark safe'}
                            </button>
                          )}
                          {row.status === 'removed' ? (
                            <button
                              disabled={busy}
                              onClick={() => void applyStatus(row, 'active')}
                              className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700 disabled:opacity-50 dark:bg-emerald-900/40 dark:text-emerald-300"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              disabled={busy}
                              onClick={() => { setPendingRemove(row); setRemoveReason(''); }}
                              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-red-100 hover:text-red-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>

                      {openReplies === row.id && (
                        <div className="mt-3 space-y-2 border-l-2 border-slate-100 pl-3 dark:border-slate-800">
                          {repliesLoading ? (
                            <div className="py-2 text-xs font-semibold text-slate-400">Loading replies…</div>
                          ) : replies.length === 0 ? (
                            <div className="py-2 text-xs font-semibold text-slate-400">No replies.</div>
                          ) : (
                            replies.map((r) => (
                              <div key={r.id} className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
                                <div className="flex items-start justify-between gap-3">
                                  <p className={`whitespace-pre-wrap break-words text-sm font-semibold ${
                                    r.status === 'removed'
                                      ? 'text-slate-400 line-through'
                                      : 'text-slate-700 dark:text-slate-300'
                                  }`}>
                                    {r.content}
                                  </p>
                                  <button
                                    disabled={busy}
                                    onClick={() => void applyCommentStatus(r.id, r.status === 'removed' ? 'active' : 'removed')}
                                    className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-red-100 hover:text-red-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-400"
                                  >
                                    {r.status === 'removed' ? 'Restore' : 'Remove'}
                                  </button>
                                </div>
                                <div className="mt-1 text-[11px] font-semibold text-slate-400">{when(r.created_at)}</div>
                                <SuspectChips terms={r.suspect_terms} />
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {rows.length > 0 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-400">
                    Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length} of {total}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={page === 0 || rowsLoading}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className={`rounded-full px-4 py-1.5 text-sm font-bold disabled:opacity-40 ${PILL_OFF}`}
                    >
                      Previous
                    </button>
                    <span className="text-xs font-bold text-slate-500">{page + 1} / {pageCount}</span>
                    <button
                      disabled={page + 1 >= pageCount || rowsLoading}
                      onClick={() => setPage((p) => p + 1)}
                      className={`rounded-full px-4 py-1.5 text-sm font-bold disabled:opacity-40 ${PILL_OFF}`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </MotionSection>
      )}

      {/* ── Filter ── */}
      {tab === 'words' && (
        <MotionSection delay={0.06} className="mt-6">
          <div className={`${CARD} p-6`}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void addWord(); }}
                placeholder="Add a word or phrase…"
                className="min-w-[220px] flex-1 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
              <button
                disabled={busy || newWord.trim().length < 2}
                onClick={() => void addWord()}
                className={`rounded-full px-5 py-2.5 text-sm font-bold disabled:opacity-40 ${PILL_ON}`}
              >
                Add
              </button>
            </div>

            <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
              Blocked anywhere inside a confession or reply. Disguises are caught too — a post
              reading “p0rn”, “p&nbsp;o&nbsp;r&nbsp;n” or “pxrn” is left up and marked
              <span className="mx-1 rounded-full bg-amber-100 px-2 py-0.5 font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                needs review
              </span>
              for you. Phone numbers, emails and links are blocked by their own rules, so they do
              not belong in this list.
            </p>

            {wordsLoading ? (
              <div className="py-10 text-center text-sm font-semibold text-slate-400">Loading…</div>
            ) : (
              <>
                <div className="mt-6 flex flex-wrap gap-2">
                  {activeWords.map((w) => (
                    <span
                      key={w.id}
                      className="group inline-flex items-center gap-2 rounded-full bg-slate-100 py-1.5 pl-4 pr-2 font-mono text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {w.pattern}
                      <button
                        title="Turn off"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try { await setConfessionBlockedWordActive(w.id, false); await loadWords(); }
                          catch (e) { setError(e instanceof Error ? e.message : 'Could not update that word.'); }
                          finally { setBusy(false); }
                        }}
                        className="grid h-5 w-5 place-items-center rounded-full text-slate-400 transition hover:bg-slate-300 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {activeWords.length === 0 && (
                    <span className="text-sm font-semibold text-slate-400">Nothing is blocked right now.</span>
                  )}
                </div>

                {mutedWords.length > 0 && (
                  <>
                    <div className="mt-8 text-[11px] font-black uppercase tracking-wider text-slate-400">
                      Turned off
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mutedWords.map((w) => (
                        <span
                          key={w.id}
                          className="inline-flex items-center gap-2 rounded-full border border-dashed border-slate-300 py-1.5 pl-4 pr-2 font-mono text-sm font-bold text-slate-400 dark:border-slate-700"
                        >
                          {w.pattern}
                          <button
                            title="Turn back on"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try { await setConfessionBlockedWordActive(w.id, true); await loadWords(); }
                              catch (e) { setError(e instanceof Error ? e.message : 'Could not update that word.'); }
                              finally { setBusy(false); }
                            }}
                            className="grid h-5 w-5 place-items-center rounded-full text-slate-400 transition hover:bg-emerald-100 hover:text-emerald-700"
                          >
                            ↺
                          </button>
                          <button
                            title="Delete for good"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try { await deleteConfessionBlockedWord(w.id); await loadWords(); }
                              catch (e) { setError(e instanceof Error ? e.message : 'Could not delete that word.'); }
                              finally { setBusy(false); }
                            }}
                            className="grid h-5 w-5 place-items-center rounded-full text-slate-400 transition hover:bg-red-100 hover:text-red-700"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </MotionSection>
      )}

      {pendingRemove && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setPendingRemove(null)}>
          <div
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-elev1 dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-black text-slate-900 dark:text-slate-100">Remove this confession?</div>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              It leaves the student feed immediately. The row is kept so the campus numbering stays
              correct, and you can restore it from the Removed filter.
            </p>
            <div className="mt-3 max-h-32 overflow-y-auto rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {pendingRemove.content}
            </div>
            <input
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="Reason (optional)"
              className="mt-3 w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingRemove(null)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${PILL_OFF}`}
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={() => void applyStatus(pendingRemove, 'removed', removeReason)}
                className="rounded-full bg-red-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

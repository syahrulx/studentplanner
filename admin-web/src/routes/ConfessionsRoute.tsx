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
import { Button } from '../ui/Button';
import { TextInput } from '../ui/Input';
import { EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SkeletonRows } from '../ui/page';
import { campusKey, campusLabel, when } from '../components/moderation/confessionFormat';
import {
  ConfessionActions,
  ConfessionCard,
  ConfessionThreadPanel,
  DrillCard,
  RemoveConfessionDialog,
} from '../components/moderation/ConfessionParts';

const PAGE_SIZE = 25;

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
    // A search runs everywhere, so it does not wait for a university and a
    // campus to be picked first. Without this the box looked broken: typing a
    // word and pressing Enter returned here and never asked the database, so
    // nothing ever appeared. Browsing still starts from a campus, because a
    // list of every confession ever posted is not a useful first screen.
    if (!appliedSearch && !campus && !(allCampuses && uni)) return;
    setRowsLoading(true);
    try {
      setRows(await listConfessions({
        // While searching, an unset university or campus means "everywhere".
        university: appliedSearch && !campus && !allCampuses ? null : (campus?.university_id ?? uni),
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

  /** Opens one post's replies in the side panel (closing is the panel's job). */
  async function openThread(row: AdminConfession) {
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

  const openRow = openReplies ? rows.find((r) => r.id === openReplies) ?? null : null;
  const closeRemove = useCallback(() => setPendingRemove(null), []);
  const reviewCount = campus ? Number(campus.suspect_count) : uniTotals.suspect;
  const runSearch = () => { setAppliedSearch(search); setPage(0); };

  /** The Mark safe / Flag again and Remove / Restore buttons for one post. */
  const actionsFor = (row: AdminConfession) => (
    <ConfessionActions
      row={row}
      busy={busy}
      onToggleSafe={() => void (row.suspect_reviewed_at
        ? markConfessionSuspectReviewed(row.id, false).then(loadRows).then(loadCampuses)
        : markSafe(row))}
      onRestore={() => void applyStatus(row, 'active')}
      onRemove={() => { setPendingRemove(row); setRemoveReason(''); }}
    />
  );

  const crumbClass = (current: boolean) => current
    ? 'rounded-lg px-1.5 py-0.5 text-slate-900 dark:text-slate-100'
    : 'rounded-lg px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200';

  const crumbs = (
    <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1 text-sm font-bold">
      <button
        type="button"
        onClick={() => { setUni(null); setCampus(null); setAllCampuses(false); setRows([]); }}
        className={crumbClass(!uni)}
        aria-current={!uni ? 'page' : undefined}
      >
        All universities
      </button>
      {uni && (
        <>
          <span aria-hidden className="text-slate-300 dark:text-slate-700">/</span>
          <button
            type="button"
            onClick={() => { setCampus(null); setAllCampuses(false); setRows([]); }}
            className={`uppercase ${crumbClass(!(campus || allCampuses))}`}
            aria-current={!(campus || allCampuses) ? 'page' : undefined}
          >
            {uni}
          </button>
        </>
      )}
      {(campus || allCampuses) && (
        <>
          <span aria-hidden className="text-slate-300 dark:text-slate-700">/</span>
          <span className={crumbClass(true)} aria-current="page">
            {campus ? campusLabel(campus.campus) : 'All campuses'}
          </span>
        </>
      )}
    </nav>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Confessions"
        description="Anonymous posts, campus by campus. Posts with words the filter only suspects wait for your review."
        actions={
          <PillGroup>
            <Pill active={tab === 'feed'} onClick={() => setTab('feed')}>Posts</Pill>
            <Pill active={tab === 'words'} onClick={() => setTab('words')}>Blocked words</Pill>
          </PillGroup>
        }
      />

      {error && <Notice tone="danger">{error}</Notice>}

      {tab === 'feed' && (
        <MotionSection delay={0.06} className="space-y-4">
          {/* Search sits above the university and campus pickers because it
              searches all of them, so you can look for a word without first
              knowing where it was posted. It is the only search box: it also
              narrows the posts list once a campus is open. */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {crumbs}
            <div className="flex w-full items-center gap-2 lg:w-auto lg:min-w-[420px]">
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                placeholder="Search every confession…"
                aria-label="Search confessions"
                className="flex-1"
              />
              <Button onClick={runSearch}>Search</Button>
              {appliedSearch ? (
                <Button
                  variant="ghost"
                  onClick={() => { setSearch(''); setAppliedSearch(''); setPage(0); }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          {/* ── Universities ── */}
          {!uni && !appliedSearch && (
            unisLoading ? (
              <SkeletonRows rows={3} height="h-32" />
            ) : unis.length === 0 ? (
              <EmptyState title="No confessions have been posted yet." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {unis.map((u) => (
                  <DrillCard
                    key={u.university_id}
                    uppercase
                    title={u.university_id}
                    subtitle={`${u.campus_count} campus${u.campus_count === 1 ? '' : 'es'} · ${when(u.last_at)}`}
                    counts={{ live: u.active_count, review: u.suspect_count, reported: u.reported_count, removed: u.removed_count }}
                    onClick={() => { setUni(u.university_id); setCampus(null); }}
                  />
                ))}
              </div>
            )
          )}

          {/* ── Campuses ── */}
          {uni && !campus && !allCampuses && !appliedSearch && (
            campusLoading ? (
              <SkeletonRows rows={3} height="h-32" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {/* Every campus at once, so "did I see all of them?" has an
                    answer that does not depend on visiting each card. */}
                <DrillCard
                  title="All campuses"
                  subtitle={`${uniTotals.total} confession${uniTotals.total === 1 ? '' : 's'} in one list`}
                  counts={{ live: uniTotals.active, review: uniTotals.suspect, reported: uniTotals.reported, removed: uniTotals.removed }}
                  onClick={() => {
                    setAllCampuses(true); setCampus(null);
                    setRows([]); setPage(0); setStatusFilter(''); setSuspectOnly(false);
                    setSearch(''); setAppliedSearch(''); setOpenReplies(null);
                  }}
                />

                {campuses.map((c) => (
                  <DrillCard
                    key={campusKey(c.campus)}
                    title={campusLabel(c.campus)}
                    subtitle={when(c.last_at)}
                    counts={{ live: c.active_count, review: c.suspect_count, reported: c.reported_count, removed: c.removed_count }}
                    onClick={() => {
                      setCampus(c); setAllCampuses(false);
                      setRows([]); setPage(0); setStatusFilter(''); setSuspectOnly(false);
                      setSearch(''); setAppliedSearch(''); setOpenReplies(null);
                    }}
                  />
                ))}
              </div>
            )
          )}

          {/* ── Posts ── */}
          {(campus || allCampuses || appliedSearch) && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <PillGroup label="Status">
                  {([['', 'All'], ['active', 'Live'], ['flagged', 'Flagged'], ['removed', 'Removed']] as const).map(
                    ([key, label]) => (
                      <Pill
                        key={key}
                        active={statusFilter === key}
                        onClick={() => { setStatusFilter(key); setPage(0); }}
                      >
                        {label}
                      </Pill>
                    ),
                  )}
                </PillGroup>
                <Pill
                  active={suspectOnly}
                  alert
                  count={reviewCount > 0 ? reviewCount : null}
                  onClick={() => { setSuspectOnly((v) => !v); setPage(0); }}
                  title="Posts with a word the filter only suspects, not yet marked safe"
                >
                  Needs review
                </Pill>
                {appliedSearch ? (
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Results for “{appliedSearch}”
                  </span>
                ) : null}
              </div>

              {rowsLoading ? (
                <SkeletonRows rows={4} height="h-40" />
              ) : rows.length === 0 ? (
                <EmptyState title="Nothing matches this filter." />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {rows.map((row) => (
                    <ConfessionCard
                      key={row.id}
                      row={row}
                      onOpenReplies={() => void openThread(row)}
                      actions={actionsFor(row)}
                    />
                  ))}
                </div>
              )}

              {rows.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length} of {total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={page === 0 || rowsLoading}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{page + 1} / {pageCount}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={page + 1 >= pageCount || rowsLoading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </MotionSection>
      )}

      {/* ── Blocked words ── */}
      {tab === 'words' && (
        <MotionSection delay={0.06}>
          <Panel
            title={`Blocked words${wordsLoading ? '' : ` · ${activeWords.length} in use`}`}
            description="Blocked anywhere inside a confession or reply."
          >
            <div className="flex flex-wrap items-center gap-2">
              <TextInput
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void addWord(); }}
                placeholder="Add a word or phrase…"
                aria-label="New blocked word or phrase"
                className="min-w-[220px] flex-1"
              />
              <Button disabled={busy || newWord.trim().length < 2} onClick={() => void addWord()}>
                Add
              </Button>
            </div>

            <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
              Disguises are caught too — a post reading “p0rn”, “p&nbsp;o&nbsp;r&nbsp;n” or “pxrn” is left up and marked
              <span className="mx-1 rounded-lg bg-amber-100 px-2 py-0.5 font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                needs review
              </span>
              for you. Phone numbers, emails and links are blocked by their own rules, so they do
              not belong in this list.
            </p>

            {wordsLoading ? (
              <div className="mt-6"><SkeletonRows rows={2} height="h-10" /></div>
            ) : (
              <>
                <div className="mt-6 flex flex-wrap gap-2">
                  {activeWords.map((w) => (
                    <span
                      key={w.id}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-100 py-1.5 pl-4 pr-2 font-mono text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {w.pattern}
                      <button
                        type="button"
                        title="Turn off"
                        aria-label={`Turn off ${w.pattern}`}
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try { await setConfessionBlockedWordActive(w.id, false); await loadWords(); }
                          catch (e) { setError(e instanceof Error ? e.message : 'Could not update that word.'); }
                          finally { setBusy(false); }
                        }}
                        className="grid h-5 w-5 place-items-center rounded-full text-slate-400 transition hover:bg-slate-300 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {activeWords.length === 0 && (
                    <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">Nothing is blocked right now.</span>
                  )}
                </div>

                {mutedWords.length > 0 && (
                  <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                      Turned off · {mutedWords.length}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mutedWords.map((w) => (
                        <span
                          key={w.id}
                          className="inline-flex items-center gap-2 rounded-full border border-dashed border-slate-300 py-1.5 pl-4 pr-2 font-mono text-sm font-bold text-slate-400 dark:border-slate-700 dark:text-slate-500"
                        >
                          {w.pattern}
                          <button
                            type="button"
                            title="Turn back on"
                            aria-label={`Turn ${w.pattern} back on`}
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try { await setConfessionBlockedWordActive(w.id, true); await loadWords(); }
                              catch (e) { setError(e instanceof Error ? e.message : 'Could not update that word.'); }
                              finally { setBusy(false); }
                            }}
                            className="grid h-5 w-5 place-items-center rounded-full text-slate-400 transition hover:bg-emerald-100 hover:text-emerald-700 disabled:opacity-50 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300"
                          >
                            ↺
                          </button>
                          <button
                            type="button"
                            title="Delete for good"
                            aria-label={`Delete ${w.pattern} for good`}
                            disabled={busy}
                            onClick={async () => {
                              if (!window.confirm(`Delete the blocked word "${w.pattern}" for good? Confessions using it will no longer be blocked, and you would need to add it again by hand.`)) return;
                              setBusy(true);
                              try { await deleteConfessionBlockedWord(w.id); await loadWords(); }
                              catch (e) { setError(e instanceof Error ? e.message : 'Could not delete that word.'); }
                              finally { setBusy(false); }
                            }}
                            className="grid h-5 w-5 place-items-center rounded-full text-slate-400 transition hover:bg-rose-100 hover:text-rose-700 disabled:opacity-50 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </Panel>
        </MotionSection>
      )}

      {openRow && (
        <ConfessionThreadPanel
          row={openRow}
          replies={replies}
          loading={repliesLoading}
          busy={busy}
          onClose={() => setOpenReplies(null)}
          onCommentStatus={(id, status) => void applyCommentStatus(id, status)}
          actions={actionsFor(openRow)}
        />
      )}

      {pendingRemove && (
        <RemoveConfessionDialog
          row={pendingRemove}
          reason={removeReason}
          onReasonChange={setRemoveReason}
          busy={busy}
          onCancel={closeRemove}
          onConfirm={() => void applyStatus(pendingRemove, 'removed', removeReason)}
        />
      )}
    </div>
  );
}

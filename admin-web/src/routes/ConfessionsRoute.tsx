import { useCallback, useEffect, useMemo, useState } from 'react';
import { MotionPanel, MotionSection } from '../ui/motion';
import { IconFileText, IconClipboard } from '../ui/icons';
import {
  listConfessionCampusSummary,
  listConfessions,
  setConfessionStatus,
  listConfessionBlockedWords,
  addConfessionBlockedWord,
  setConfessionBlockedWordActive,
  deleteConfessionBlockedWord,
  type ConfessionCampusSummary,
  type AdminConfession,
  type ConfessionBlockedWord,
} from '../lib/api';

const PAGE_SIZE = 25;

/** '' is a real campus key — the rows a single-campus university posts under. */
function campusKey(campus: string | null): string {
  return campus ?? '';
}

function campusLabel(campus: string | null): string {
  const c = (campus ?? '').trim();
  return c ? c : 'No campus';
}

function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: AdminConfession['status'] }) {
  const style =
    status === 'active'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      : status === 'flagged'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
        : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${style}`}>
      {status}
    </span>
  );
}

/**
 * Confession moderation.
 *
 * Nothing loads the whole wall. The first screen is one row per campus, which
 * is a grouped count and stays small however many confessions exist; opening
 * one fetches a page of 25 at a time. The server caps the page size too, so a
 * hand-built request cannot pull everything either.
 */
export function ConfessionsRoute() {
  const [tab, setTab] = useState<'feed' | 'words'>('feed');

  // ── Campus folders ────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<ConfessionCampusSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      setSummary(await listConfessionCampusSummary());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load campuses.');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  // ── One campus ────────────────────────────────────────────────────────────
  const [open, setOpen] = useState<ConfessionCampusSummary | null>(null);
  const [rows, setRows] = useState<AdminConfession[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const total = rows[0]?.total_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadRows = useCallback(async () => {
    if (!open) return;
    setRowsLoading(true);
    try {
      setRows(await listConfessions({
        university: open.university_id,
        campus: campusKey(open.campus),
        status: statusFilter || null,
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
  }, [open, page, statusFilter, appliedSearch]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const openCampus = (row: ConfessionCampusSummary) => {
    setOpen(row);
    setRows([]);
    setPage(0);
    setStatusFilter('');
    setSearch('');
    setAppliedSearch('');
  };

  const [pendingRemove, setPendingRemove] = useState<AdminConfession | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function applyStatus(row: AdminConfession, status: AdminConfession['status'], reason?: string) {
    setBusy(true);
    try {
      await setConfessionStatus(row.id, status, reason);
      setPendingRemove(null);
      setRemoveReason('');
      await loadRows();
      await loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that confession.');
    } finally {
      setBusy(false);
    }
  }

  // ── Blocked words ─────────────────────────────────────────────────────────
  const [words, setWords] = useState<ConfessionBlockedWord[]>([]);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [newNote, setNewNote] = useState('');

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
    if (pattern.length < 2) {
      setError('A blocked word needs at least two characters.');
      return;
    }
    setBusy(true);
    try {
      await addConfessionBlockedWord(pattern, newNote.trim() || undefined);
      setNewWord('');
      setNewNote('');
      await loadWords();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that word.');
    } finally {
      setBusy(false);
    }
  }

  const activeWordCount = useMemo(() => words.filter((w) => w.active).length, [words]);

  return (
    <div>
      <MotionSection>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              Confessions
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Review what students post, and keep the word filter up to date.
            </div>
          </div>
          <div className="flex gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            {([['feed', 'Feed'], ['words', 'Blocked words']] as const).map(([key, label]) => (
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

      {tab === 'feed' && !open && (
        <MotionSection delay={0.06} className="mt-6">
          <MotionPanel>
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-400 dark:border-slate-800">
                Pick a campus — nothing loads until you open one
              </div>
              {summaryLoading ? (
                <div className="flex items-center justify-center py-20 text-sm font-semibold text-slate-400">Loading…</div>
              ) : summary.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20">
                  <IconFileText className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-semibold text-slate-400">No confessions have been posted yet.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-400">Campus</th>
                      <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-400">University</th>
                      <th className="px-5 py-3 text-right text-xs font-black uppercase tracking-wider text-slate-400">Live</th>
                      <th className="px-5 py-3 text-right text-xs font-black uppercase tracking-wider text-slate-400">Reported</th>
                      <th className="px-5 py-3 text-right text-xs font-black uppercase tracking-wider text-slate-400">Removed</th>
                      <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-400">Latest</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {summary.map((row) => (
                      <tr
                        key={`${row.university_id}::${campusKey(row.campus)}`}
                        className="cursor-pointer transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                        onClick={() => openCampus(row)}
                      >
                        <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-slate-100">{campusLabel(row.campus)}</td>
                        <td className="px-5 py-3.5 font-semibold uppercase text-slate-500 dark:text-slate-400">{row.university_id}</td>
                        <td className="px-5 py-3.5 text-right font-bold text-slate-900 dark:text-slate-100">{row.active_count}</td>
                        <td className={`px-5 py-3.5 text-right font-bold ${row.reported_count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                          {row.reported_count}
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-slate-400">{row.removed_count}</td>
                        <td className="px-5 py-3.5 font-semibold text-slate-500 dark:text-slate-400">{when(row.last_at)}</td>
                        <td className="px-5 py-3.5 text-right text-sm font-bold text-brand-600">Open →</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </MotionPanel>
        </MotionSection>
      )}

      {tab === 'feed' && open && (
        <MotionSection delay={0.06} className="mt-6">
          <MotionPanel>
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <button
                  onClick={() => { setOpen(null); setRows([]); }}
                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  ← All campuses
                </button>
                <div className="font-black text-slate-900 dark:text-slate-100">{campusLabel(open.campus)}</div>
                <div className="text-xs font-semibold uppercase text-slate-400">{open.university_id}</div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  >
                    <option value="">All statuses</option>
                    <option value="active">Live</option>
                    <option value="flagged">Flagged</option>
                    <option value="removed">Removed</option>
                  </select>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setAppliedSearch(search); setPage(0); } }}
                    placeholder="Search text…"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  />
                  <button
                    onClick={() => { setAppliedSearch(search); setPage(0); }}
                    className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white dark:bg-white dark:text-slate-950"
                  >
                    Search
                  </button>
                </div>
              </div>

              {rowsLoading ? (
                <div className="flex items-center justify-center py-20 text-sm font-semibold text-slate-400">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20">
                  <IconClipboard className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-semibold text-slate-400">Nothing matches this filter.</p>
                </div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                        <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-400">#</th>
                        <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-400">Content</th>
                        <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-400">Posted</th>
                        <th className="px-5 py-3 text-right text-xs font-black uppercase tracking-wider text-slate-400">Reports</th>
                        <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-400">Status</th>
                        <th className="px-5 py-3 text-right text-xs font-black uppercase tracking-wider text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rows.map((row) => (
                        <tr key={row.id} className="align-top transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-400">{row.confession_no ?? '—'}</td>
                          <td className="max-w-lg px-5 py-3.5">
                            <div className="whitespace-pre-wrap break-words font-semibold text-slate-800 dark:text-slate-200">
                              {row.content}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-slate-400">
                              {row.tag ? `#${row.tag} · ` : ''}
                              {row.is_anonymous ? 'anonymous' : 'named'} · ♥ {row.like_count} · 💬 {row.comment_count}
                              {row.removed_reason ? ` · removed: ${row.removed_reason}` : ''}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-slate-500 dark:text-slate-400">{when(row.created_at)}</td>
                          <td className={`px-5 py-3.5 text-right font-bold ${row.report_count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                            {row.report_count}
                          </td>
                          <td className="px-5 py-3.5"><StatusBadge status={row.status} /></td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center justify-end gap-2">
                              {row.status === 'removed' ? (
                                <button
                                  disabled={busy}
                                  onClick={() => void applyStatus(row, 'active')}
                                  className="rounded-xl bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-900/40 dark:text-emerald-300"
                                >
                                  Restore
                                </button>
                              ) : (
                                <button
                                  disabled={busy}
                                  onClick={() => { setPendingRemove(row); setRemoveReason(''); }}
                                  className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-red-100 hover:text-red-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-400">
                      Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + rows.length} of {total}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={page === 0 || rowsLoading}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300"
                      >
                        Previous
                      </button>
                      <span className="text-xs font-bold text-slate-500">{page + 1} / {pageCount}</span>
                      <button
                        disabled={page + 1 >= pageCount || rowsLoading}
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </MotionPanel>
        </MotionSection>
      )}

      {tab === 'words' && (
        <MotionSection delay={0.06} className="mt-6">
          <MotionPanel>
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {activeWordCount} word{activeWordCount === 1 ? '' : 's'} active
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Matched anywhere inside a confession or a comment, lowercase, as plain text —
                  “nude” also catches “nudes”. Phone numbers, emails and links are blocked
                  separately and always, so they do not need to be listed here.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void addWord(); }}
                    placeholder="Word or phrase"
                    className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  />
                  <input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Why (optional)"
                    className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  />
                  <button
                    disabled={busy}
                    onClick={() => void addWord()}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"
                  >
                    Add word
                  </button>
                </div>
              </div>

              {wordsLoading ? (
                <div className="flex items-center justify-center py-20 text-sm font-semibold text-slate-400">Loading…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-400">Word</th>
                      <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-400">Why</th>
                      <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-slate-400">Added</th>
                      <th className="px-5 py-3 text-right text-xs font-black uppercase tracking-wider text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {words.map((w) => (
                      <tr key={w.id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className={`px-5 py-3.5 font-mono font-bold ${w.active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 line-through'}`}>
                          {w.pattern}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-slate-500 dark:text-slate-400">{w.note ?? '—'}</td>
                        <td className="px-5 py-3.5 font-semibold text-slate-400">{when(w.created_at)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await setConfessionBlockedWordActive(w.id, !w.active);
                                  await loadWords();
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : 'Could not update that word.');
                                } finally { setBusy(false); }
                              }}
                              className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {w.active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  await deleteConfessionBlockedWord(w.id);
                                  await loadWords();
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : 'Could not delete that word.');
                                } finally { setBusy(false); }
                              }}
                              className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-red-100 hover:text-red-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </MotionPanel>
        </MotionSection>
      )}

      {pendingRemove && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setPendingRemove(null)}>
          <div
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-elev1 dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-black text-slate-900 dark:text-slate-100">Remove this confession?</div>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              It disappears from the student feed immediately. The row is kept so the campus
              numbering stays correct, and you can restore it from the Removed filter.
            </p>
            <div className="mt-3 max-h-32 overflow-y-auto rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {pendingRemove.content}
            </div>
            <input
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="Reason (optional, kept for the audit trail)"
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingRemove(null)}
                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={() => void applyStatus(pendingRemove, 'removed', removeReason)}
                className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
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

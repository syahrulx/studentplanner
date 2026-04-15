import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listAttendanceUserEvents,
  listAttendanceUserSummary,
  type AttendanceEventRow,
  type AttendanceUserSummaryRow,
} from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';

function pct01(x: number): string {
  const v = Number.isFinite(x) ? x : 0;
  return `${Math.round(v * 100)}%`;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function statusBadge(s: AttendanceEventRow['status']) {
  if (s === 'present') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (s === 'absent') return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
  return 'bg-slate-500/15 text-slate-700 dark:text-slate-300';
}

export function StudentPerformanceRoute() {
  const { searchQuery } = useAdminSearch();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AttendanceUserSummaryRow[]>([]);

  const [sinceDays, setSinceDays] = useState(14);
  const [universityFilter, setUniversityFilter] = useState('');
  const [minTotal, setMinTotal] = useState(0);
  const [maxPresentRatePct, setMaxPresentRatePct] = useState<number | ''>('');

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [eventsBusy, setEventsBusy] = useState(false);
  const [eventsErr, setEventsErr] = useState('');
  const [events, setEvents] = useState<AttendanceEventRow[]>([]);
  const [eventsFrom, setEventsFrom] = useState('');
  const [eventsTo, setEventsTo] = useState('');
  const [eventsStatus, setEventsStatus] = useState<'all' | AttendanceEventRow['status']>('all');

  const load = useCallback(async () => {
    setBusy(true);
    setErr('');
    try {
      const list = await listAttendanceUserSummary({ limit: 300, sinceDays });
      setItems(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load performance');
    } finally {
      setBusy(false);
    }
  }, [sinceDays]);

  const loadEvents = useCallback(async (userId: string, opts?: { keepSelection?: boolean }) => {
    setSelectedUserId(userId);
    setEventsBusy(true);
    setEventsErr('');
    try {
      const list = await listAttendanceUserEvents({ userId, limit: 200, from: eventsFrom, to: eventsTo });
      setEvents(list);
    } catch (e) {
      setEventsErr(e instanceof Error ? e.message : 'Failed to load events');
      setEvents([]);
    } finally {
      setEventsBusy(false);
    }
    if (!opts?.keepSelection) {
      // keep selected user as-is (state already updated)
    }
  }, [eventsFrom, eventsTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const universities = useMemo(() => {
    const set = new Set<string>();
    for (const u of items) {
      const uni = (u.profile?.university_id || '').trim();
      if (uni) set.add(uni);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim();
    const uni = universityFilter.trim();
    const minT = clampInt(Number(minTotal), 0, 100000);
    const maxPct = maxPresentRatePct === '' ? null : clampInt(Number(maxPresentRatePct), 0, 100);

    return items
      .filter((u) => {
        if (uni) {
          const pu = (u.profile?.university_id || '').trim();
          if (pu !== uni) return false;
        }
        if (u.total < minT) return false;
        if (maxPct !== null) {
          const ratePct = Math.round(clamp01(u.present_rate) * 100);
          if (ratePct > maxPct) return false;
        }
        if (!q) return true;
        const p = u.profile;
        return matchesAdminSearch(
          q,
          u.user_id,
          p?.name,
          p?.student_id,
          p?.university_id,
          String(u.total),
          String(u.present),
          String(u.absent),
          String(u.cancelled),
          pct01(u.present_rate),
          pct01(u.last_present_rate),
        );
      })
      .sort((a, b) => {
        // default: lowest present rate first, then higher total
        const ar = clamp01(a.present_rate);
        const br = clamp01(b.present_rate);
        if (ar !== br) return ar - br;
        return (b.total ?? 0) - (a.total ?? 0);
      });
  }, [items, maxPresentRatePct, minTotal, searchQuery, universityFilter]);

  const filteredEvents = useMemo(() => {
    if (eventsStatus === 'all') return events;
    return events.filter((e) => e.status === eventsStatus);
  }, [events, eventsStatus]);

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Student performance</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Attendance check-ins recorded from the mobile notification (and in-app fallback).
        </div>
      </MotionSection>

      <MotionSection delay={0.04} className="mt-6">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-black text-slate-900 dark:text-slate-100">Students</div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {busy ? 'Loading…' : `${filtered.length} rows`} (rate shown for last {sinceDays} days)
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => {
                    setUniversityFilter('');
                    setMinTotal(0);
                    setMaxPresentRatePct('');
                    setSinceDays(14);
                  }}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-900 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Reset filters
                </button>
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={busy}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-900 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Refresh
                </button>
              </div>
            </div>

            {err ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
                {err}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Since (days)</div>
                <select
                  className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={sinceDays}
                  onChange={(e) => setSinceDays(clampInt(Number(e.target.value), 1, 365))}
                >
                  <option value={7}>7</option>
                  <option value={14}>14</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                  <option value={90}>90</option>
                </select>
              </label>

              <label className="block">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">University</div>
                <select
                  className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={universityFilter}
                  onChange={(e) => setUniversityFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {universities.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Min total</div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={minTotal}
                  onChange={(e) => setMinTotal(clampInt(Number(e.target.value), 0, 100000))}
                  className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="0"
                />
              </label>

              <label className="block">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Max present rate (%)
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={maxPresentRatePct}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') setMaxPresentRatePct('');
                    else setMaxPresentRatePct(clampInt(Number(raw), 0, 100));
                  }}
                  className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="e.g. 60"
                />
              </label>
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Student ID</th>
                    <th className="px-3 py-2">University</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Present rate</th>
                    <th className="px-3 py-2 text-right">Last {sinceDays}d rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const p = u.profile;
                    const selected = selectedUserId === u.user_id;
                    const name = (p?.name || '').trim() || '—';
                    const sid = (p?.student_id || '').trim() || '—';
                    const uni = (p?.university_id || '').trim() || '—';
                    return (
                      <tr
                        key={u.user_id}
                        className={`cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/80 dark:hover:bg-slate-800/40 ${
                          selected ? 'bg-brand-500/12 dark:bg-brand-500/20' : ''
                        }`}
                        onClick={() => void loadEvents(u.user_id)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open performance for ${name}`}
                        aria-selected={selected}
                      >
                        <td className="px-3 py-2">
                          <span className="font-black text-brand-600 dark:text-brand-400">{name}</span>
                          <div className="text-[10px] font-mono font-semibold text-slate-400">{u.user_id}</div>
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{sid}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{uni}</td>
                        <td className="px-3 py-2 text-right font-black text-slate-900 dark:text-slate-100">{u.total}</td>
                        <td className="px-3 py-2 text-right font-black text-slate-900 dark:text-slate-100">
                          {pct01(u.present_rate)}
                        </td>
                        <td className="px-3 py-2 text-right font-black text-slate-900 dark:text-slate-100">
                          {pct01(u.last_present_rate)}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !busy ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center font-semibold text-slate-500 dark:text-slate-400">
                        No attendance events yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </MotionPanel>
      </MotionSection>

      {selectedUserId ? (
        <MotionSection delay={0.08} className="mt-6">
          <MotionPanel>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100">Recent events</div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {eventsBusy ? 'Loading…' : `${filteredEvents.length} events`} for selected student
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setEventsFrom('');
                      setEventsTo('');
                      setEventsStatus('all');
                    }}
                    className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-900 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Reset events filters
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadEvents(selectedUserId, { keepSelection: true })}
                    disabled={eventsBusy}
                    className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-900 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Reload
                  </button>
                </div>
              </div>

              {eventsErr ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
                  {eventsErr}
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30 sm:grid-cols-3">
                <label className="block">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">From</div>
                  <input
                    type="datetime-local"
                    value={eventsFrom}
                    onChange={(e) => setEventsFrom(e.target.value)}
                    className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">To</div>
                  <input
                    type="datetime-local"
                    value={eventsTo}
                    onChange={(e) => setEventsTo(e.target.value)}
                    className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</div>
                  <select
                    value={eventsStatus}
                    onChange={(e) => setEventsStatus(e.target.value as any)}
                    className="mt-1 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="all">All</option>
                    <option value="present">present</option>
                    <option value="absent">absent</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </label>
                <div className="sm:col-span-3">
                  <button
                    type="button"
                    onClick={() => void loadEvents(selectedUserId, { keepSelection: true })}
                    disabled={eventsBusy}
                    className="h-10 rounded-2xl bg-brand-600 px-4 text-xs font-black text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    Apply (reload from server)
                  </button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Subject</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((e) => {
                      const subject = (e.subject_name || e.subject_code || 'Class').trim();
                      return (
                        <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800/80">
                          <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                            {new Date(e.scheduled_start_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-black text-slate-900 dark:text-slate-100">{subject}</div>
                            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{e.subject_code}</div>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-black ${statusBadge(e.status)}`}>
                              {e.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">{e.source}</td>
                          <td className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                            {new Date(e.recorded_at).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredEvents.length === 0 && !eventsBusy ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center font-semibold text-slate-500 dark:text-slate-400">
                          No events for this user yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </MotionPanel>
        </MotionSection>
      ) : null}
    </div>
  );
}


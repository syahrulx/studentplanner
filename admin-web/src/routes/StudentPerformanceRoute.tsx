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

function riskMeta(u: AttendanceUserSummaryRow): { label: 'Strong' | 'Watch' | 'At risk'; cls: string; reason: string } {
  const total = Number(u.total ?? 0);
  const pr = clamp01(Number(u.present_rate ?? 0));
  const lr = clamp01(Number(u.last_present_rate ?? 0));
  const cancelled = Number(u.cancelled ?? 0);
  const absent = Number(u.absent ?? 0);
  const lowData = total < 5;

  // Use last_present_rate as a "recent" hint (if available).
  const recentIsBad = lr > 0 ? lr < 0.7 : pr < 0.7;
  const overallBad = pr < 0.75;
  const highCancelled = total >= 6 && cancelled / Math.max(1, total) >= 0.35;
  const highAbsent = total >= 6 && absent / Math.max(1, total) >= 0.35;

  if (!lowData && (recentIsBad || (overallBad && (highAbsent || highCancelled)))) {
    const reason = recentIsBad
      ? 'Low recent present rate'
      : highAbsent
        ? 'High absences'
        : highCancelled
          ? 'High cancellations'
          : 'Low present rate';
    return { label: 'At risk', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300', reason };
  }

  if (!lowData && (pr < 0.85 || (lr > 0 && lr < 0.85))) {
    const reason = lr > 0 && lr < pr ? 'Recent dip' : 'Room to improve';
    return { label: 'Watch', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', reason };
  }

  if (lowData) {
    return { label: 'Watch', cls: 'bg-slate-500/15 text-slate-700 dark:text-slate-300', reason: 'Low data volume' };
  }

  return { label: 'Strong', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', reason: 'Consistent attendance' };
}

function Sparkline({ points, strokeClass }: { points: number[]; strokeClass: string }) {
  const w = 140;
  const h = 34;
  const pad = 2;
  const safe = points.length ? points : [0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = max - min || 1;
  const toXY = (v: number, i: number) => {
    const x = safe.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (safe.length - 1);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  };
  const d = safe.map((v, i) => toXY(v, i).join(',')).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline points={d} fill="none" className={strokeClass} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  const [sortKey, setSortKey] = useState<
    'name' | 'student_id' | 'university' | 'total' | 'present_rate' | 'last_present_rate' | 'risk'
  >('present_rate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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
        const ad = sortDir === 'asc' ? 1 : -1;
        const ap = a.profile;
        const bp = b.profile;
        const an = (ap?.name || '').trim();
        const bn = (bp?.name || '').trim();
        const asid = (ap?.student_id || '').trim();
        const bsid = (bp?.student_id || '').trim();
        const auni = (ap?.university_id || '').trim();
        const buni = (bp?.university_id || '').trim();

        const cmpStr = (x: string, y: string) => x.localeCompare(y);
        const cmpNum = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);

        if (sortKey === 'name') return ad * cmpStr(an || '—', bn || '—');
        if (sortKey === 'student_id') return ad * cmpStr(asid || '—', bsid || '—');
        if (sortKey === 'university') return ad * cmpStr(auni || '—', buni || '—');
        if (sortKey === 'total') return ad * cmpNum(Number(a.total ?? 0), Number(b.total ?? 0));
        if (sortKey === 'present_rate') return ad * cmpNum(clamp01(a.present_rate), clamp01(b.present_rate));
        if (sortKey === 'last_present_rate') return ad * cmpNum(clamp01(a.last_present_rate), clamp01(b.last_present_rate));
        if (sortKey === 'risk') {
          const rank = (x: AttendanceUserSummaryRow) => {
            const r = riskMeta(x).label;
            return r === 'At risk' ? 0 : r === 'Watch' ? 1 : 2;
          };
          return ad * cmpNum(rank(a), rank(b));
        }

        // fallback
        const ar = clamp01(a.present_rate);
        const br = clamp01(b.present_rate);
        if (ar !== br) return ad * (ar - br);
        return ad * (Number(a.total ?? 0) - Number(b.total ?? 0));
      });
  }, [items, maxPresentRatePct, minTotal, searchQuery, sortDir, sortKey, universityFilter]);

  const filteredEvents = useMemo(() => {
    if (eventsStatus === 'all') return events;
    return events.filter((e) => e.status === eventsStatus);
  }, [events, eventsStatus]);

  const kpis = useMemo(() => {
    const list = filtered;
    const students = list.length;
    const totalEvents = list.reduce((acc, u) => acc + Number(u.total ?? 0), 0);
    const presentEvents = list.reduce((acc, u) => acc + Number(u.present ?? 0), 0);
    const absentEvents = list.reduce((acc, u) => acc + Number(u.absent ?? 0), 0);
    const cancelledEvents = list.reduce((acc, u) => acc + Number(u.cancelled ?? 0), 0);
    const weightedPresentRate = totalEvents > 0 ? presentEvents / totalEvents : 0;
    const weightedLastRate =
      totalEvents > 0
        ? list.reduce((acc, u) => acc + clamp01(u.last_present_rate) * Number(u.total ?? 0), 0) / totalEvents
        : 0;
    const deltaPct = Math.round((weightedLastRate - weightedPresentRate) * 100);
    const atRisk = list.filter((u) => riskMeta(u).label === 'At risk').length;
    return {
      students,
      totalEvents,
      presentEvents,
      absentEvents,
      cancelledEvents,
      weightedPresentRate,
      weightedLastRate,
      deltaPct,
      atRisk,
    };
  }, [filtered]);

  const selectedUser = useMemo(() => items.find((x) => x.user_id === selectedUserId) ?? null, [items, selectedUserId]);
  const selectedRisk = useMemo(() => (selectedUser ? riskMeta(selectedUser) : null), [selectedUser]);

  const selectedSeries = useMemo(() => {
    const map = new Map<string, { present: number; total: number }>();
    for (const e of events) {
      const d = new Date(e.scheduled_start_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const it = map.get(key) ?? { present: 0, total: 0 };
      it.total += 1;
      if (e.status === 'present') it.present += 1;
      map.set(key, it);
    }
    const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    const last = keys.slice(Math.max(0, keys.length - 14));
    const pts = last.map((k) => {
      const it = map.get(k)!;
      return it.total > 0 ? it.present / it.total : 0;
    });
    return { keys: last, points: pts };
  }, [events]);

  const selectedBreakdown = useMemo(() => {
    let present = 0;
    let absent = 0;
    let cancelled = 0;
    for (const e of filteredEvents) {
      if (e.status === 'present') present += 1;
      else if (e.status === 'absent') absent += 1;
      else cancelled += 1;
    }
    const total = present + absent + cancelled;
    return { total, present, absent, cancelled };
  }, [filteredEvents]);

  const toggleSort = useCallback(
    (k: typeof sortKey) => {
      if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      else {
        setSortKey(k);
        setSortDir(k === 'name' || k === 'student_id' || k === 'university' ? 'asc' : 'desc');
      }
    },
    [sortKey],
  );

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Students tracked</div>
                <div className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{kpis.students}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Based on current filters</div>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Total check-ins</div>
                <div className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{kpis.totalEvents}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {kpis.presentEvents} present · {kpis.absentEvents} absent · {kpis.cancelledEvents} cancelled
                </div>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Avg present rate</div>
                  <Sparkline points={[kpis.weightedPresentRate, kpis.weightedLastRate]} strokeClass="stroke-brand-600 dark:stroke-brand-400" />
                </div>
                <div className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                  {pct01(kpis.weightedPresentRate)}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Trend: {kpis.deltaPct >= 0 ? '+' : ''}
                  {kpis.deltaPct}% vs recent rate
                </div>
              </div>
              <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">At-risk students</div>
                <div className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{kpis.atRisk}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Heuristic based on attendance only</div>
              </div>
            </div>

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
                    <th className="px-3 py-2">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('name')}>
                        Name
                        {sortKey === 'name' ? <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
                      </button>
                    </th>
                    <th className="px-3 py-2">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('student_id')}>
                        Student ID
                        {sortKey === 'student_id' ? <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
                      </button>
                    </th>
                    <th className="px-3 py-2">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('university')}>
                        University
                        {sortKey === 'university' ? <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('total')}>
                        Total
                        {sortKey === 'total' ? <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('present_rate')}>
                        Present rate
                        {sortKey === 'present_rate' ? <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('last_present_rate')}>
                        Last {sinceDays}d rate
                        {sortKey === 'last_present_rate' ? (
                          <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                        ) : null}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('risk')}>
                        Risk
                        {sortKey === 'risk' ? <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const p = u.profile;
                    const selected = selectedUserId === u.user_id;
                    const name = (p?.name || '').trim() || '—';
                    const sid = (p?.student_id || '').trim() || '—';
                    const uni = (p?.university_id || '').trim() || '—';
                    const risk = riskMeta(u);
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
                        <td className="px-3 py-2 text-right">
                          <span title={risk.reason} className={`inline-flex rounded-full px-2 py-1 text-[11px] font-black ${risk.cls}`}>
                            {risk.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !busy ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center font-semibold text-slate-500 dark:text-slate-400">
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
                      setSelectedUserId(null);
                      setEvents([]);
                      setEventsErr('');
                      setEventsBusy(false);
                    }}
                    className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-900 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Close details
                  </button>
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

              {selectedUser ? (
                <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Student</div>
                    <div className="mt-1 text-sm font-black text-slate-900 dark:text-slate-100">{selectedUser.profile?.name || '—'}</div>
                    <div className="mt-1 text-xs font-mono font-semibold text-slate-400">{selectedUser.user_id}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {selectedUser.profile?.university_id || '—'} · {selectedUser.profile?.student_id || '—'}
                    </div>
                    {selectedRisk ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-black ${selectedRisk.cls}`}>
                          {selectedRisk.label}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{selectedRisk.reason}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        14-day present trend
                      </div>
                      <Sparkline points={selectedSeries.points} strokeClass="stroke-emerald-600 dark:stroke-emerald-400" />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span>Latest:</span>
                      <span className="font-black text-slate-900 dark:text-slate-100">
                        {selectedSeries.points.length ? `${pct01(selectedSeries.points.at(-1) as number)}` : '—'}
                      </span>
                      <span>·</span>
                      <span>{selectedSeries.points.length} day(s)</span>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Based on loaded events for this user.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Status breakdown</div>
                    <div className="mt-3 space-y-2">
                      {(
                        [
                          { k: 'present', v: selectedBreakdown.present, cls: 'bg-emerald-500' },
                          { k: 'absent', v: selectedBreakdown.absent, cls: 'bg-rose-500' },
                          { k: 'cancelled', v: selectedBreakdown.cancelled, cls: 'bg-slate-500' },
                        ] as const
                      ).map((row) => {
                        const pct = selectedBreakdown.total > 0 ? Math.round((row.v / selectedBreakdown.total) * 100) : 0;
                        return (
                          <div key={row.k}>
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                              <span className="capitalize">{row.k}</span>
                              <span className="font-black text-slate-900 dark:text-slate-100">
                                {row.v} · {pct}%
                              </span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div className={`h-2 ${row.cls}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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


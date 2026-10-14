import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listAttendanceUserEvents,
  listAttendanceUserSummary,
  type AttendanceEventRow,
  type AttendanceUserSummaryRow,
} from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionSection } from '../ui/motion';
import { Button } from '../ui/Button';
import { Label, Select, TextInput } from '../ui/Input';
import { cn } from '../ui/cn';
import { Chip, EmptyState, FactGrid, Notice, PageHeader, Panel, Pill, PillGroup, SidePanel, SkeletonRows, StatItem, StatStrip } from '../ui/page';
import type { Tone } from '../ui/tones';

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

function statusTone(s: AttendanceEventRow['status']): Tone {
  if (s === 'present') return 'success';
  if (s === 'absent') return 'danger';
  return 'neutral';
}

function riskMeta(u: AttendanceUserSummaryRow): { label: 'Strong' | 'Watch' | 'At risk'; tone: Tone; reason: string } {
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
    return { label: 'At risk', tone: 'danger', reason };
  }

  if (!lowData && (pr < 0.85 || (lr > 0 && lr < 0.85))) {
    const reason = lr > 0 && lr < pr ? 'Recent dip' : 'Room to improve';
    return { label: 'Watch', tone: 'warning', reason };
  }

  if (lowData) {
    return { label: 'Watch', tone: 'neutral', reason: 'Low data volume' };
  }

  return { label: 'Strong', tone: 'success', reason: 'Consistent attendance' };
}

function Sparkline({ points, strokeClass, w = 140, h = 34 }: { points: number[]; strokeClass: string; w?: number; h?: number }) {
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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
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

  const closeDetails = () => {
    setSelectedUserId(null);
    setEvents([]);
    setEventsErr('');
    setEventsBusy(false);
  };

  const sortHeader = (k: typeof sortKey, label: string, right?: boolean) => (
    <th
      className={cn('px-3 py-2.5', right && 'text-right')}
      aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 dark:hover:text-white"
        onClick={() => toggleSort(k)}
      >
        {label}
        {sortKey === k ? <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
      </button>
    </th>
  );

  const capital = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance insights"
        description="Attendance check-ins recorded from the mobile notification (and the in-app fallback)."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={busy}>
            {busy ? 'Loading…' : 'Refresh'}
          </Button>
        }
      />

      {err ? <Notice tone="danger">{err}</Notice> : null}

      <MotionSection>
        <StatStrip>
          <StatItem label="Students tracked" value={kpis.students} hint="Based on current filters" />
          <StatItem
            label="Total check-ins"
            value={kpis.totalEvents}
            hint={`${kpis.presentEvents} present · ${kpis.absentEvents} absent · ${kpis.cancelledEvents} cancelled`}
          />
          <StatItem
            label="Avg present rate"
            value={pct01(kpis.weightedPresentRate)}
            hint={
              <span className="inline-flex items-center gap-1.5">
                <Sparkline
                  w={40}
                  h={14}
                  points={[kpis.weightedPresentRate, kpis.weightedLastRate]}
                  strokeClass="stroke-brand-600 dark:stroke-brand-400"
                />
                Trend: {kpis.deltaPct >= 0 ? '+' : ''}{kpis.deltaPct}% vs recent rate
              </span>
            }
          />
          <StatItem
            label="At-risk students"
            value={kpis.atRisk}
            tone={kpis.atRisk > 0 ? 'danger' : 'neutral'}
            hint="Heuristic based on attendance only"
          />
        </StatStrip>
      </MotionSection>

      <MotionSection delay={0.04}>
        <Panel
          title="Students"
          description={`${busy ? 'Loading…' : `${filtered.length} rows`} · rates for the last ${sinceDays} days · click a student for details`}
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setUniversityFilter('');
                setMinTotal(0);
                setMaxPresentRatePct('');
                setSinceDays(14);
              }}
            >
              Reset filters
            </Button>
          }
          padded={false}
        >
          <div className="space-y-3 border-b border-slate-100 p-5 dark:border-slate-800">
            <PillGroup label="Period">
              {[7, 14, 30, 60, 90].map((d) => (
                <Pill key={d} active={sinceDays === d} onClick={() => setSinceDays(clampInt(d, 1, 365))}>
                  {d} days
                </Pill>
              ))}
            </PillGroup>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="att-university" className="mb-1">University</Label>
                <Select id="att-university" value={universityFilter} onChange={(e) => setUniversityFilter(e.target.value)}>
                  <option value="">All</option>
                  {universities.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="att-min-total" className="mb-1">Min total</Label>
                <TextInput
                  id="att-min-total"
                  type="number"
                  min={0}
                  step={1}
                  value={minTotal}
                  onChange={(e) => setMinTotal(clampInt(Number(e.target.value), 0, 100000))}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="att-max-rate" className="mb-1">Max present rate (%)</Label>
                <TextInput
                  id="att-max-rate"
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
                  placeholder="e.g. 60"
                />
              </div>
            </div>
          </div>

          {busy && items.length === 0 ? (
            <div className="p-5"><SkeletonRows rows={5} height="h-12" /></div>
          ) : filtered.length === 0 ? (
            !busy ? <div className="p-5"><EmptyState title="No attendance events yet." /></div> : null
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-[11px] font-black text-slate-500 dark:text-slate-400">
                  <tr>
                    {sortHeader('name', 'Name')}
                    {sortHeader('student_id', 'Student ID')}
                    {sortHeader('university', 'University')}
                    {sortHeader('total', 'Total', true)}
                    {sortHeader('present_rate', 'Present rate', true)}
                    {sortHeader('last_present_rate', `Last ${sinceDays}d rate`, true)}
                    {sortHeader('risk', 'Risk', true)}
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
                        className={cn(
                          'cursor-pointer border-t border-slate-100 transition-colors focus:outline-none focus-visible:bg-slate-50 dark:border-slate-800 dark:focus-visible:bg-slate-800/40',
                          selected ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                        )}
                        onClick={() => void loadEvents(u.user_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            void loadEvents(u.user_id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open performance for ${name}`}
                        aria-selected={selected}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-black text-slate-900 dark:text-slate-100">{name}</div>
                          <div className="break-all font-mono text-[10px] font-semibold text-slate-400 dark:text-slate-500">{u.user_id}</div>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200">{sid}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">{uni}</td>
                        <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-900 dark:text-slate-100">{u.total}</td>
                        <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-900 dark:text-slate-100">{pct01(u.present_rate)}</td>
                        <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-900 dark:text-slate-100">{pct01(u.last_present_rate)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Chip tone={risk.tone} title={risk.reason}>{risk.label}</Chip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </MotionSection>

      {selectedUserId ? (
        <SidePanel
          width="max-w-3xl"
          title={selectedUser?.profile?.name || '—'}
          subtitle={<span className="break-all font-mono">{selectedUserId}</span>}
          chips={
            selectedRisk ? (
              <>
                <Chip tone={selectedRisk.tone}>{selectedRisk.label}</Chip>
                <Chip tone="neutral">{selectedRisk.reason}</Chip>
              </>
            ) : null
          }
          onClose={closeDetails}
        >
          {eventsErr ? <Notice tone="danger">{eventsErr}</Notice> : null}

          {selectedUser ? (
            <>
              <FactGrid
                items={[
                  ['University', selectedUser.profile?.university_id || '—'],
                  ['Student ID', selectedUser.profile?.student_id || '—'],
                ]}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">14-day present trend</div>
                    <Sparkline w={110} h={30} points={selectedSeries.points} strokeClass="stroke-emerald-600 dark:stroke-emerald-400" />
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Latest:{' '}
                    <span className="font-black text-slate-900 dark:text-slate-100">
                      {selectedSeries.points.length ? `${pct01(selectedSeries.points.at(-1) as number)}` : '—'}
                    </span>
                    {' · '}{selectedSeries.points.length} day(s) · based on loaded events
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Status breakdown</div>
                  <div className="mt-3 space-y-2">
                    {(
                      [
                        { k: 'present', v: selectedBreakdown.present, cls: 'bg-emerald-500' },
                        { k: 'absent', v: selectedBreakdown.absent, cls: 'bg-rose-500' },
                        { k: 'cancelled', v: selectedBreakdown.cancelled, cls: 'bg-slate-400 dark:bg-slate-500' },
                      ] as const
                    ).map((row) => {
                      const pct = selectedBreakdown.total > 0 ? Math.round((row.v / selectedBreakdown.total) * 100) : 0;
                      return (
                        <div key={row.k}>
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                            <span>{capital(row.k)}</span>
                            <span className="font-black tabular-nums text-slate-900 dark:text-slate-100">{row.v} · {pct}%</span>
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
            </>
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Recent events</h3>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {eventsBusy ? 'Loading…' : `${filteredEvents.length} events`}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="att-events-from" className="mb-1">From</Label>
                  <TextInput id="att-events-from" type="datetime-local" value={eventsFrom} onChange={(e) => setEventsFrom(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="att-events-to" className="mb-1">To</Label>
                  <TextInput id="att-events-to" type="datetime-local" value={eventsTo} onChange={(e) => setEventsTo(e.target.value)} />
                </div>
              </div>
              <PillGroup label="Status">
                {(['all', 'present', 'absent', 'cancelled'] as const).map((st) => (
                  <Pill key={st} active={eventsStatus === st} onClick={() => setEventsStatus(st)}>
                    {capital(st)}
                  </Pill>
                ))}
              </PillGroup>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void loadEvents(selectedUserId, { keepSelection: true })} disabled={eventsBusy}>
                  {eventsBusy ? 'Loading…' : 'Apply dates and reload'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEventsFrom('');
                    setEventsTo('');
                    setEventsStatus('all');
                  }}
                >
                  Reset event filters
                </Button>
              </div>
            </div>

            {eventsBusy && events.length === 0 ? (
              <SkeletonRows rows={3} height="h-16" />
            ) : filteredEvents.length === 0 ? (
              !eventsBusy ? <EmptyState title="No events for this user yet." /> : null
            ) : (
              <ul className="space-y-2">
                {filteredEvents.map((e) => {
                  const subject = (e.subject_name || e.subject_code || 'Class').trim();
                  return (
                    <li key={e.id} className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-black text-slate-900 dark:text-slate-100">{subject}</div>
                          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{e.subject_code}</div>
                        </div>
                        <Chip tone={statusTone(e.status)}>{capital(e.status)}</Chip>
                      </div>
                      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                        <div>
                          <dt className="inline font-black text-slate-400">When </dt>
                          <dd className="inline font-semibold text-slate-700 dark:text-slate-200">{new Date(e.scheduled_start_at).toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt className="inline font-black text-slate-400">Recorded </dt>
                          <dd className="inline font-semibold text-slate-700 dark:text-slate-200">{new Date(e.recorded_at).toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt className="inline font-black text-slate-400">Source </dt>
                          <dd className="inline font-semibold text-slate-700 dark:text-slate-200">{e.source}</dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </SidePanel>
      ) : null}
    </div>
  );
}

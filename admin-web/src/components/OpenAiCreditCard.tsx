import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Cell,
} from 'recharts';
import { MotionSection } from '../ui/motion';
import { getOpenAiCreditUsage } from '../lib/api';
import { Chip, Notice, Panel, Pill, PillGroup, SkeletonRows, StatItem, StatStrip } from '../ui/page';
import type { Tone } from '../ui/tones';

type DailyCostPoint = { date: string; timestamp: number; costUsd: number };

type UsageData = {
  dailyCosts: DailyCostPoint[];
  thisMonthTotal: number;
  lastMonthTotal: number;
  last30Total: number;
  burnRate7d: number;
  todayCost: number;
  yesterdayCost: number;
  isAnomaly: boolean;
  anomalyMultiplier: number;
  momChange: number | null;
  projectedMonth: number;
  daysIntoThisMonth: number;
};

type ChartPoint = { date: string; cost: number; projected?: number };

// This is an internal spending guardrail, not the provider's live credit
// balance. Keeping it as a deployment setting avoids exposing billing details
// or credentials in the browser.
const monthlyBudgetUsd = Number(import.meta.env.VITE_OPENAI_MONTHLY_BUDGET_USD || 0);

// Chart colours work on both the light and dark panel.
const ACTUAL = '#14b8a6';
const PROJECTED = '#f97316';
const AXIS = '#64748B';
const tooltipStyle = { backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '12px', fontSize: '12px' };

export function OpenAiCreditCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<UsageData | null>(null);
  const [lastFetched, setLastFetched] = useState('');
  const [tab, setTab] = useState<'spend' | 'compare'>('spend');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await getOpenAiCreditUsage() as UsageData;
        if (active) {
          setData(res);
          const now = new Date();
          setLastFetched(`${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
          setLoading(false);
        }
      } catch (e: unknown) {
        if (active) { setError((e as { message?: string } | null)?.message || 'Failed to load.'); setLoading(false); }
      }
    }
    load();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <MotionSection>
        <Panel title="OpenAI spending" description="Loading spending data…">
          <SkeletonRows rows={1} height="h-20" />
        </Panel>
      </MotionSection>
    );
  }

  if (error) {
    return (
      <MotionSection>
        <Notice tone="danger" title="Could not load OpenAI spending">{error}</Notice>
      </MotionSection>
    );
  }

  if (!data) return null;

  const chartData: ChartPoint[] = data.dailyCosts.map(d => ({
    date: d.date.substring(5).replace('-', '/'),
    cost: parseFloat(d.costUsd.toFixed(4)),
  }));

  // Add 7-day projection
  const now = new Date();
  for (let i = 1; i <= 7; i++) {
    const fd = new Date(now);
    fd.setDate(now.getDate() + i);
    if (fd.getMonth() === now.getMonth()) {
      chartData.push({ date: fd.toISOString().substring(5,10).replace('-','/'), cost: 0, projected: parseFloat(data.burnRate7d.toFixed(4)) });
    }
  }

  const momTone: Tone = data.momChange === null ? 'neutral'
    : data.momChange > 20 ? 'danger'
    : data.momChange > 0 ? 'warning'
    : 'success';

  const momSign = data.momChange === null ? '—'
    : data.momChange > 0 ? `+${data.momChange.toFixed(1)}%`
    : `${data.momChange.toFixed(1)}%`;

  const compareData = [
    { label: 'Last month', total: data.lastMonthTotal, fill: '#64748B' },
    { label: 'This month*', total: data.thisMonthTotal, fill: ACTUAL },
    { label: 'Projected', total: data.projectedMonth, fill: PROJECTED },
  ];
  const hasBudget = Number.isFinite(monthlyBudgetUsd) && monthlyBudgetUsd > 0;
  const projectedUsagePct = hasBudget ? (data.projectedMonth / monthlyBudgetUsd) * 100 : 0;
  const projectedRemaining = hasBudget ? Math.max(0, monthlyBudgetUsd - data.projectedMonth) : 0;
  const reserveTone: Tone = !hasBudget
    ? 'info'
    : projectedUsagePct >= 95
      ? 'danger'
      : projectedUsagePct >= 85
        ? 'warning'
        : 'success';
  const reserveMessage = !hasBudget
    ? 'No monthly reserve is configured. Add VITE_OPENAI_MONTHLY_BUDGET_USD to enable proactive top-up reminders.'
    : projectedUsagePct >= 95
      ? `Critical: projected spend is ${projectedUsagePct.toFixed(0)}% of the monthly reserve. Review billing and top up now.`
      : projectedUsagePct >= 85
        ? `Warning: projected spend is ${projectedUsagePct.toFixed(0)}% of the monthly reserve. Plan a top-up soon.`
        : `Projected reserve remaining: $${projectedRemaining.toFixed(2)} (${Math.max(0, 100 - projectedUsagePct).toFixed(0)}%).`;

  const projectionHigher = data.projectedMonth > data.lastMonthTotal;

  return (
    <MotionSection>
      <Panel
        title="OpenAI spending"
        description={`Loaded automatically when this page opens · updated ${lastFetched}`}
        actions={data.isAnomaly ? <Chip tone="danger">Spend spike</Chip> : null}
      >
        <div className="space-y-4">
          {data.isAnomaly && (
            <Notice tone="danger">
              Yesterday's spend was <strong>${data.yesterdayCost.toFixed(3)}</strong> — <strong>{data.anomalyMultiplier.toFixed(1)}×</strong> your 7-day average of ${data.burnRate7d.toFixed(3)}/day. Check for unexpected API usage.
            </Notice>
          )}

          <Notice tone={reserveTone} title="AI budget reserve">
            {reserveMessage}
            {hasBudget ? (
              <div className="mt-1 text-xs opacity-80">
                Monthly reserve: ${monthlyBudgetUsd.toFixed(2)} · projected spend: ${data.projectedMonth.toFixed(2)}
              </div>
            ) : null}
          </Notice>

          <StatStrip>
            <StatItem label="This month" value={`$${data.thisMonthTotal.toFixed(2)}`} hint={`${data.daysIntoThisMonth} days in`} />
            <StatItem label="7-day burn rate" value={`$${data.burnRate7d.toFixed(3)}`} hint="per day (avg)" />
            <StatItem label="vs last month" value={momSign} hint={`last month: $${data.lastMonthTotal.toFixed(2)}`} tone={momTone} />
            <StatItem
              label="Month projection"
              value={`$${data.projectedMonth.toFixed(2)}`}
              hint={projectionHigher ? '▲ more than last month' : '▼ less than last month'}
              tone={projectionHigher ? 'warning' : 'success'}
            />
          </StatStrip>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <PillGroup>
              <Pill active={tab === 'spend'} onClick={() => setTab('spend')}>Daily spend</Pill>
              <Pill active={tab === 'compare'} onClick={() => setTab('compare')}>Month comparison</Pill>
            </PillGroup>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {tab === 'spend'
                ? 'Last 30 days, plus a 7-day projection (dashed)'
                : '*current month as of today'}
            </div>
          </div>

          {tab === 'spend' && (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ACTUAL} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={ACTUAL} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gProjected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PROJECTED} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={PROJECTED} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 10 }} tickMargin={8} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tickFormatter={(v) => `$${Number(v).toFixed(2)}`} tick={{ fill: AXIS, fontSize: 10 }} tickMargin={6} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: '#F8FAFC', fontWeight: 'bold' }}
                    labelStyle={{ color: '#94A3B8', marginBottom: '4px' }}
                    formatter={(v: unknown, name: unknown) => [`$${Number(v).toFixed(4)}`, name === 'cost' ? 'Actual' : 'Projected']}
                  />
                  <Area type="monotone" dataKey="cost" stroke={ACTUAL} strokeWidth={2} fillOpacity={1} fill="url(#gActual)" dot={false} />
                  <Area type="monotone" dataKey="projected" stroke={PROJECTED} strokeWidth={1.5} strokeDasharray="4 4" fillOpacity={1} fill="url(#gProjected)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {tab === 'compare' && (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compareData} margin={{ top: 10, right: 0, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${Number(v).toFixed(2)}`} tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: '#F8FAFC', fontWeight: 'bold' }}
                    labelStyle={{ color: '#94A3B8', marginBottom: '4px' }}
                    formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, 'Cost']}
                    cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                  />
                  <Bar dataKey="total" radius={[8,8,0,0]}>
                    {compareData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Add credit at{' '}
            <a
              href="https://platform.openai.com/settings/organization/billing/overview"
              target="_blank"
              rel="noreferrer"
              className="font-black text-brand-600 underline hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
            >
              platform.openai.com
            </a>
          </div>
        </div>
      </Panel>
    </MotionSection>
  );
}

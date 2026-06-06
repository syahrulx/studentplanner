import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Cell,
} from 'recharts';
import { MotionSection } from '../ui/motion';
import { getOpenAiCreditUsage } from '../lib/api';

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
      } catch (e: any) {
        if (active) { setError(e.message || 'Failed to load.'); setLoading(false); }
      }
    }
    load();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <MotionSection className="mt-8 rounded-3xl border border-slate-800 bg-[#0B1120] p-6">
        <div className="mb-4 flex items-center space-x-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
          <span className="text-sm text-slate-400">Loading OpenAI spending data…</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[1,2,3,4].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-800" />)}
        </div>
      </MotionSection>
    );
  }

  if (error) {
    return (
      <MotionSection className="mt-8 rounded-3xl border border-rose-900/40 bg-rose-950/40 p-6">
        <div className="flex items-center gap-2 font-semibold text-rose-100"><span>💳</span><span>OpenAI API Error</span></div>
        <div className="mt-2 text-sm text-rose-300">{error}</div>
      </MotionSection>
    );
  }

  if (!data) return null;

  const chartData = data.dailyCosts.map(d => ({
    date: d.date.substring(5).replace('-', '/'),
    cost: parseFloat(d.costUsd.toFixed(4)),
  }));

  // Add 7-day projection
  const now = new Date();
  for (let i = 1; i <= 7; i++) {
    const fd = new Date(now);
    fd.setDate(now.getDate() + i);
    if (fd.getMonth() === now.getMonth()) {
      chartData.push({ date: fd.toISOString().substring(5,10).replace('-','/'), cost: 0, projected: parseFloat(data.burnRate7d.toFixed(4)) } as any);
    }
  }

  const momColor = data.momChange === null ? 'text-slate-400'
    : data.momChange > 20 ? 'text-red-400'
    : data.momChange > 0 ? 'text-orange-400'
    : 'text-teal-400';

  const momSign = data.momChange === null ? '—'
    : data.momChange > 0 ? `+${data.momChange.toFixed(1)}%`
    : `${data.momChange.toFixed(1)}%`;

  const compareData = [
    { label: 'Last Month', total: data.lastMonthTotal, fill: '#64748B' },
    { label: 'This Month*', total: data.thisMonthTotal, fill: '#2DD4BF' },
    { label: 'Projected', total: data.projectedMonth, fill: '#f97316' },
  ];

  return (
    <MotionSection className="mt-8 rounded-3xl border border-slate-700/50 bg-[#0B1120] p-6 text-slate-300">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-lg font-black text-white">
            <span>💳</span><span>OpenAI API Spending</span>
          </div>
          <div className="mt-0.5 text-sm text-slate-400">Automated — no manual input needed</div>
        </div>
        {data.isAnomaly && (
          <div className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400 animate-pulse">
            🚨 Spend Spike!
          </div>
        )}
      </div>

      {/* Anomaly Banner */}
      {data.isAnomaly && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span className="mt-0.5 text-base">⚠️</span>
          <span>
            Yesterday's spend was <strong>${data.yesterdayCost.toFixed(3)}</strong> — <strong>{data.anomalyMultiplier.toFixed(1)}×</strong> your 7-day average of ${data.burnRate7d.toFixed(3)}/day. Check for unexpected API usage.
          </span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="This Month" value={`$${data.thisMonthTotal.toFixed(2)}`} sub={`${data.daysIntoThisMonth} days in`} />
        <StatCard label="7-Day Burn Rate" value={`$${data.burnRate7d.toFixed(3)}`} sub="per day (avg)" />
        <StatCard
          label="vs Last Month"
          value={momSign}
          sub={`last month: $${data.lastMonthTotal.toFixed(2)}`}
          accentClass={momColor}
        />
        <StatCard
          label="Month Projection"
          value={`$${data.projectedMonth.toFixed(2)}`}
          sub={data.projectedMonth > data.lastMonthTotal ? '▲ more than last month' : '▼ less than last month'}
          accentClass={data.projectedMonth > data.lastMonthTotal ? 'text-orange-400' : 'text-teal-400'}
        />
      </div>

      {/* Tab switcher */}
      <div className="mb-4 flex gap-2">
        {(['spend', 'compare'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-1.5 text-xs font-bold transition-colors ${
              tab === t ? 'bg-teal-500/20 text-teal-300' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'spend' ? '📈 Daily Spend (30d)' : '📊 Month Comparison'}
          </button>
        ))}
      </div>

      {tab === 'spend' && (
        <>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Daily Cost · Last 30 Days + 7-Day Projection
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2DD4BF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2DD4BF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gProjected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1E293B" />
                <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 10 }} tickMargin={8} axisLine={false} tickLine={false} interval={4} />
                <YAxis tickFormatter={(v) => `$${Number(v).toFixed(2)}`} tick={{ fill: '#64748B', fontSize: 10 }} tickMargin={6} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '12px', fontSize: '12px' }}
                  itemStyle={{ color: '#F8FAFC', fontWeight: 'bold' }}
                  labelStyle={{ color: '#94A3B8', marginBottom: '4px' }}
                  formatter={(v: number, name: string) => [`$${Number(v).toFixed(4)}`, name === 'cost' ? 'Actual' : 'Projected']}
                />
                <Area type="monotone" dataKey="cost" stroke="#2DD4BF" strokeWidth={2} fillOpacity={1} fill="url(#gActual)" dot={false} />
                <Area type="monotone" dataKey="projected" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 4" fillOpacity={1} fill="url(#gProjected)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {tab === 'compare' && (
        <>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Month-over-Month Comparison · *current month as of today
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData} margin={{ top: 10, right: 0, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1E293B" />
                <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${Number(v).toFixed(2)}`} tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '12px', fontSize: '12px' }}
                  formatter={(v: number) => [`$${Number(v).toFixed(2)}`, 'Cost']}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="total" radius={[8,8,0,0]}>
                  {compareData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
        <span>Auto-refreshes on page load · Add credit at <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer" className="text-teal-500 hover:text-teal-400 underline">platform.openai.com</a></span>
        <span>Updated {lastFetched}</span>
      </div>
    </MotionSection>
  );
}

function StatCard({ label, value, sub, accentClass }: {
  label: string; value: string; sub?: string; accentClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-black ${accentClass ?? 'text-white'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MotionSection } from '../ui/motion';
import { getOpenAiCreditUsage } from '../lib/api';

type DailyCost = {
  timestamp: number;
  line_items: Array<{ name: string; cost: number }>;
};

type UsageResponse = {
  total_usage: number;
  daily_costs: DailyCost[];
};

type SubscriptionResponse = {
  hard_limit_usd: number;
};

export function OpenAiCreditCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [budget, setBudget] = useState(0);
  const [thisMonthUsage, setThisMonthUsage] = useState(0);
  const [last30DaysUsage, setLast30DaysUsage] = useState(0);
  const [chartData, setChartData] = useState<Array<{ date: string; cost: number }>>([]);
  const [lastFetched, setLastFetched] = useState<string>('');

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const data = await getOpenAiCreditUsage();

        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
        
        let monthTotal = 0;
        const dailyData = data.usage.daily_costs.map((day) => {
          const dateStr = new Date(day.timestamp * 1000).toISOString().split('T')[0];
          const totalCostCents = day.line_items.reduce((acc, curr) => acc + curr.cost, 0);
          const totalCostDollars = totalCostCents / 100;

          if (dateStr >= startOfMonthStr) {
            monthTotal += totalCostDollars;
          }

          return {
            date: dateStr.substring(5), // e.g. "05-06"
            cost: totalCostDollars,
          };
        });

        if (active) {
          setBudget(data.subscription.hard_limit_usd);
          setLast30DaysUsage(data.usage.total_usage / 100);
          setThisMonthUsage(monthTotal);
          setChartData(dailyData);
          
          const now = new Date();
          const formattedDate = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
          setLastFetched(formattedDate);
          setLoading(false);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'An error occurred while fetching OpenAI data.');
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <MotionSection className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center space-x-2">
          <div className="h-5 w-5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-6 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      </MotionSection>
    );
  }

  if (error) {
    return (
      <MotionSection className="mt-8 rounded-3xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-900/40 dark:bg-rose-950/40">
        <div className="flex items-center space-x-2 font-semibold text-rose-900 dark:text-rose-100">
          <span>💳</span>
          <span>OpenAI API Credit Error</span>
        </div>
        <div className="mt-2 text-sm text-rose-800 dark:text-rose-200">{error}</div>
      </MotionSection>
    );
  }

  const budgetUsedPercent = budget > 0 ? Math.min((thisMonthUsage / budget) * 100, 100) : 0;
  const isDanger = budgetUsedPercent >= 90;

  return (
    <MotionSection className="mt-8 rounded-3xl border border-slate-200 bg-[#0B1120] p-6 text-slate-300 dark:border-slate-800">
      <div className="mb-6">
        <div className="flex items-center space-x-2 text-lg font-black text-white">
          <span>💳</span>
          <span>OpenAI API Credit</span>
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-400">
          Real-time spending from the OpenAI Organization Costs API
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {/* THIS MONTH */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">This Month</div>
          <div className="mt-2 text-3xl font-black text-white">${thisMonthUsage.toFixed(2)}</div>
        </div>

        {/* LAST 30 DAYS */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Last 30 Days</div>
          <div className="mt-2 text-3xl font-black text-white">${last30DaysUsage.toFixed(2)}</div>
        </div>

        {/* BUDGET */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Budget</div>
          <div className="mt-2 flex items-baseline space-x-1">
            <span className="text-3xl font-black text-white">${budget.toFixed(2)}</span>
            <span className="text-sm font-semibold text-slate-400">/mo</span>
          </div>
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between text-xs font-bold">
          <span className="text-slate-400">${thisMonthUsage.toFixed(2)} / ${budget.toFixed(2)}</span>
          <span className={isDanger ? 'text-rose-400' : 'text-[#2DD4BF]'}>{budgetUsedPercent.toFixed(1)}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isDanger ? 'bg-rose-500' : 'bg-[#2DD4BF]'}`}
            style={{ width: `${budgetUsedPercent}%` }}
          />
        </div>
      </div>

      {/* CHART */}
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
        Daily API Cost (Last 30 Days)
      </div>
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2DD4BF" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2DD4BF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1E293B" />
            <XAxis 
              dataKey="date" 
              tick={{ fill: '#64748B', fontSize: 11 }} 
              tickMargin={10} 
              axisLine={false} 
              tickLine={false} 
            />
            <YAxis 
              tickFormatter={(val) => `$${val.toFixed(2)}`} 
              tick={{ fill: '#64748B', fontSize: 11 }} 
              tickMargin={10} 
              axisLine={false} 
              tickLine={false} 
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '12px', fontSize: '13px' }}
              itemStyle={{ color: '#F8FAFC', fontWeight: 'bold' }}
              labelStyle={{ color: '#94A3B8', marginBottom: '4px' }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
            />
            <Area 
              type="step" 
              dataKey="cost" 
              stroke="#2DD4BF" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorCost)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 text-right text-xs text-slate-500">
        Data fetched {lastFetched}
      </div>
    </MotionSection>
  );
}

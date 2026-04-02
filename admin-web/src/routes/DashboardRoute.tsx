import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, Area, AreaChart, Tooltip, XAxis, YAxis } from 'recharts';
import {
  getAiTokenUsageSeriesLast14Days,
  getCourseUsageTop,
  getDashboardOverview,
  type AiTokenUsagePoint,
  type CourseUsageRow,
  type DashboardOverview,
} from '../lib/api';

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

export function DashboardRoute() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>('');
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [aiSeries, setAiSeries] = useState<AiTokenUsagePoint[]>([]);
  const [aiErr, setAiErr] = useState<string>('');
  const [courseUsage, setCourseUsage] = useState<CourseUsageRow[]>([]);
  const [courseUsageErr, setCourseUsageErr] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const series = await getAiTokenUsageSeriesLast14Days();
        if (!cancelled) setAiSeries(series);
      } catch (e) {
        if (!cancelled) setAiErr(e instanceof Error ? e.message : 'Failed to load AI token usage');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const rows = await getCourseUsageTop(10);
        if (!cancelled) setCourseUsage(rows);
      } catch (e) {
        if (!cancelled) setCourseUsageErr(e instanceof Error ? e.message : 'Failed to load course usage');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setBusy(true);
      setErr('');
      try {
        const data = await getDashboardOverview();
        if (!cancelled) setOverview(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load stats');
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(() => {
    return [
      { title: 'Total Users', value: overview ? String(overview.total_users) : busy ? '…' : '—' },
      { title: 'Total Universities', value: overview ? String(overview.total_universities) : busy ? '…' : '—' },
      { title: 'Courses in App', value: overview ? String(overview.total_courses) : busy ? '…' : '—' },
      { title: 'Timetables Generated', value: overview ? String(overview.total_timetables) : busy ? '…' : '—' },
    ];
  }, [overview, busy]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Overview</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Activity and key totals.
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title} title={c.title} value={c.value} />
        ))}
      </div>

      {err ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
          <div className="mt-3 space-y-2 text-xs font-semibold opacity-90">
            {/edge function/i.test(err) ? (
              <>
                <p className="text-rose-800 dark:text-rose-200">
                  Overview loads via the <span className="font-black">admin_users</span> Edge Function. This error usually means
                  the function is not deployed to the <span className="font-black">same</span> project as{' '}
                  <code className="rounded bg-rose-100/80 px-1 dark:bg-rose-900/50">VITE_SUPABASE_URL</code>, or the request was
                  blocked (network / ad blocker).
                </p>
                <p className="text-rose-800 dark:text-rose-200">
                  From <code className="rounded bg-rose-100/80 px-1 dark:bg-rose-900/50">gradeup-mobile/supabase</code>, link the
                  project and deploy:
                </p>
                <pre className="overflow-x-auto rounded-2xl border border-rose-200/60 bg-white/60 p-3 text-[11px] leading-relaxed text-rose-950 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-100">
                  npx supabase login{'\n'}
                  npx supabase link --project-ref &lt;your-ref&gt;{'\n'}
                  npx supabase functions deploy admin_users{'\n'}
                  npx supabase functions deploy admin_data
                </pre>
                <p className="text-rose-800 dark:text-rose-200">
                  In Supabase Dashboard → <span className="font-black">Edge Functions</span>, confirm{' '}
                  <span className="font-black">admin_users</span> appears. Other pages need <span className="font-black">admin_data</span>{' '}
                  too.
                </p>
              </>
            ) : null}
            <p className="text-rose-800 dark:text-rose-200">
              Also ensure migration <code className="rounded bg-rose-100/80 px-1 dark:bg-rose-900/50">018_admin_dashboard.sql</code>{' '}
              is applied and your user is in <code className="rounded bg-rose-100/80 px-1 dark:bg-rose-900/50">admin_users</code>{' '}
              (for normal login).
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-slate-900 dark:text-slate-100">AI token usage (last 14 days)</div>
            <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Total OpenAI tokens (prompt + completion)
            </div>
          </div>
        </div>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={aiSeries} margin={{ left: 6, right: 6, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="aiTokensFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                stroke="#94a3b8"
                tickFormatter={(v) => String(v).slice(5)}
              />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip />
              <Area type="monotone" dataKey="tokens" stroke="#2563eb" fill="url(#aiTokensFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {aiErr ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
            {aiErr}
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-slate-900 dark:text-slate-100">Top Courses</div>
            <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Which programme course is used by the most users.
            </div>
          </div>
        </div>

        {courseUsageErr ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
            {courseUsageErr}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2">Course</th>
                <th className="px-3 py-2">Users</th>
              </tr>
            </thead>
            <tbody>
              {courseUsage.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                    No course usage yet.
                  </td>
                </tr>
              ) : null}
              {courseUsage.map((r) => (
                <tr
                  key={r.course_id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40"
                >
                  <td className="px-3 py-3 text-sm">
                    <div className="font-black text-slate-900 dark:text-slate-100">{r.course_id}</div>
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{r.course_name ?? '—'}</div>
                  </td>
                  <td className="px-3 py-3 text-sm font-black text-slate-900 dark:text-slate-100">{r.user_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


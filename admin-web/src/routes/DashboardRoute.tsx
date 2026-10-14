import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, Area, AreaChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import {
  getAiTokenUsageSeriesLast14Days,
  getCourseUsageTop,
  getDashboardOverview,
  getOperationalDashboard,
  type AiTokenUsagePoint,
  type CourseUsageRow,
  type DashboardOverview,
  type OperationalAlert,
} from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { OpenAiCreditCard } from '../components/OpenAiCreditCard';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionSection } from '../ui/motion';
import { Chip, EmptyState, Notice, PageHeader, Panel, SkeletonRows, StatItem, StatStrip } from '../ui/page';
import { cn } from '../ui/cn';

const codeCls = 'rounded bg-rose-100/80 px-1 dark:bg-rose-900/50';

function alertCardCls(severity: OperationalAlert['severity']): string {
  if (severity === 'critical') return 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30';
  return 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40';
}

export function DashboardRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>('');
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [aiSeries, setAiSeries] = useState<AiTokenUsagePoint[]>([]);
  const [aiErr, setAiErr] = useState<string>('');
  const [courseUsage, setCourseUsage] = useState<CourseUsageRow[]>([]);
  const [courseUsageErr, setCourseUsageErr] = useState<string>('');
  const [operationalAlerts, setOperationalAlerts] = useState<OperationalAlert[]>([]);
  const [operationalErr, setOperationalErr] = useState('');

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
    void getOperationalDashboard()
      .then((result) => { if (!cancelled) setOperationalAlerts(result.alerts); })
      .catch((error) => { if (!cancelled) setOperationalErr(error instanceof Error ? error.message : 'Failed to load operational alerts'); });
    return () => { cancelled = true; };
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
    // `title` is the original card name, kept so top-search terms like "DAU" still match.
    const v = (n: number | undefined) => (overview ? String(n) : busy ? '…' : '—');
    return [
      { title: 'Total Users', label: 'Total users', value: v(overview?.total_users) },
      { title: 'DAU (24h)', label: 'Daily active (24h)', value: v(overview?.dau) },
      { title: 'MAU (30d)', label: 'Monthly active (30d)', value: v(overview?.mau) },
      { title: 'Total Universities', label: 'Universities', value: v(overview?.total_universities) },
      { title: 'Courses in App', label: 'Courses in app', value: v(overview?.total_courses) },
      { title: 'Timetables Generated', label: 'Timetables generated', value: v(overview?.total_timetables) },
    ];
  }, [overview, busy]);

  const cardsFiltered = useMemo(() => {
    if (!searchQuery.trim()) return cards;
    return cards.filter((c) => matchesAdminSearch(searchQuery, c.title, c.label, c.value));
  }, [cards, searchQuery]);

  const aiSeriesFiltered = useMemo(() => {
    if (!searchQuery.trim()) return aiSeries;
    return aiSeries.filter((p) => matchesAdminSearch(searchQuery, p.name, p.tokens));
  }, [aiSeries, searchQuery]);

  const courseUsageFiltered = useMemo(() => {
    if (!searchQuery.trim()) return courseUsage;
    return courseUsage.filter((r) => matchesAdminSearch(searchQuery, r.course_id, r.course_name, r.user_count));
  }, [courseUsage, searchQuery]);

  const searching = Boolean(searchQuery.trim());

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Activity and key totals." />

      {searching ? (
        <Notice tone="brand">Top search is on. The numbers, AI chart and course list below are filtered.</Notice>
      ) : null}

      <MotionSection>
        {cardsFiltered.length === 0 && searching ? (
          <Notice tone="neutral">
            No overview numbers match “{searchQuery.trim()}”. Clear the top search to see them all.
          </Notice>
        ) : (
          <StatStrip>
            {cardsFiltered.map((c) => (
              <StatItem key={c.title} label={c.label} value={c.value} />
            ))}
          </StatStrip>
        )}
      </MotionSection>

      {err ? (
        <Notice tone="danger" title="Could not load the overview numbers">
          <p>{err}</p>
          <div className="mt-2 space-y-2 text-xs">
            {/edge function/i.test(err) ? (
              <>
                <p>
                  Overview loads via the <span className="font-black">admin_users</span> Edge Function. This error usually means
                  the function is not deployed to the <span className="font-black">same</span> project as{' '}
                  <code className={codeCls}>VITE_SUPABASE_URL</code>, or the request was blocked (network / ad blocker).
                </p>
                <p>
                  From <code className={codeCls}>gradeup-mobile/supabase</code>, link the project and deploy:
                </p>
                <pre className="overflow-x-auto rounded-xl border border-rose-200/60 bg-white/60 p-3 text-[11px] leading-relaxed dark:border-rose-800/50 dark:bg-rose-950/40">
                  npx supabase login{'\n'}
                  npx supabase link --project-ref &lt;your-ref&gt;{'\n'}
                  npx supabase functions deploy admin_users{'\n'}
                  npx supabase functions deploy admin_data
                </pre>
                <p>
                  In Supabase Dashboard → <span className="font-black">Edge Functions</span>, confirm{' '}
                  <span className="font-black">admin_users</span> appears. Other pages need <span className="font-black">admin_data</span>{' '}
                  too.
                </p>
              </>
            ) : null}
            <p>
              Also ensure migration <code className={codeCls}>018_admin_dashboard.sql</code> is applied and your user is in{' '}
              <code className={codeCls}>admin_users</code> (for normal login).
            </p>
          </div>
        </Notice>
      ) : null}

      <MotionSection delay={0.03}>
        <Panel
          title="Needs attention"
          description="Read-only checks for issues an administrator may need to look at."
          actions={<Chip tone="neutral">No automatic fixes</Chip>}
        >
          {operationalErr ? <Notice tone="danger">{operationalErr}</Notice> : null}
          {!operationalErr && operationalAlerts.length === 0 ? <SkeletonRows rows={1} height="h-24" /> : null}
          {operationalAlerts.length > 0 ? (
            <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', operationalErr && 'mt-3')}>
              {operationalAlerts.map((alert) => (
                <Link
                  key={alert.key}
                  to={alert.route}
                  className={cn(
                    'group flex flex-col rounded-2xl border p-4 transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
                    alertCardCls(alert.severity),
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-black text-slate-900 dark:text-white">{alert.title}</div>
                    <div className="text-2xl font-black leading-none tabular-nums text-slate-900 dark:text-white">
                      {alert.available ? alert.count ?? 0 : '—'}
                    </div>
                  </div>
                  <div className="mt-2 flex-1 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                    {alert.available ? alert.detail : alert.error || alert.detail}
                  </div>
                  <div className="mt-3 text-xs font-black text-brand-600 group-hover:underline dark:text-brand-300">Review →</div>
                </Link>
              ))}
            </div>
          ) : null}
        </Panel>
      </MotionSection>

      <OpenAiCreditCard />

      <div className="grid gap-6 xl:grid-cols-5">
        <MotionSection delay={0.04} className="xl:col-span-3">
          <Panel title="AI token usage" description="Total OpenAI tokens per day (prompt + completion), last 14 days." className="h-full">
            {aiErr ? <Notice tone="danger" className="mb-3">{aiErr}</Notice> : null}
            {searching && aiSeriesFiltered.length === 0 && !aiErr ? (
              <EmptyState title="No AI usage days match the search" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={aiSeriesFiltered} margin={{ left: 6, right: 6, top: 10, bottom: 0 }}>
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
            )}
          </Panel>
        </MotionSection>

        <MotionSection delay={0.08} className="xl:col-span-2">
          <Panel title="Top courses" description="Programme courses used by the most students." className="h-full" padded={false}>
            {courseUsageErr ? <Notice tone="danger" className="m-5 mb-0">{courseUsageErr}</Notice> : null}
            {courseUsageFiltered.length === 0 ? (
              <div className="p-5">
                <EmptyState title={searching ? 'No courses match the top search.' : 'No course usage yet.'} />
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="px-5 py-2.5">Course</th>
                    <th className="px-5 py-2.5 text-right">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {courseUsageFiltered.map((r) => (
                    <tr key={r.course_id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-5 py-2.5">
                        <div className="font-black text-slate-900 dark:text-slate-100">{r.course_id}</div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{r.course_name ?? '—'}</div>
                      </td>
                      <td className="px-5 py-2.5 text-right font-black tabular-nums text-slate-900 dark:text-slate-100">{r.user_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </MotionSection>
      </div>
    </div>
  );
}

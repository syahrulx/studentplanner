import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  getFeedbackSurveyResults,
  type FeedbackQuestion,
  type FeedbackResponseRow,
  type FeedbackSurveyRow,
  type FeedbackSurveyStats,
} from '../lib/api';
import { QUESTION_TYPE_LABEL, fmtDate } from '../lib/feedbackSurveys';
import { SectionTitle } from './FeedbackSurveyFields';
import { Button } from '../ui/Button';
import { EmptyState, FactGrid, Notice, Panel, SidePanel, SkeletonRows, StatItem, StatStrip } from '../ui/page';

type Answer = FeedbackResponseRow['answers'][string] | undefined;

function optionLabel(q: FeedbackQuestion, id: string) {
  return q.options?.find((o) => o.id === id)?.label_en ?? `(removed choice ${id})`;
}

function answerText(q: FeedbackQuestion, a: Answer): string {
  if (a == null) return '';
  if (q.type === 'rating') return `${a}/5`;
  if (q.type === 'single') return optionLabel(q, String(a));
  if (q.type === 'multi') return (Array.isArray(a) ? a : [a]).map((x) => optionLabel(q, String(x))).join('; ');
  return String(a);
}

/** Quote a CSV cell and neutralise spreadsheet formulas (=, +, -, @) in free text. */
function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(survey: FeedbackSurveyRow, rows: FeedbackResponseRow[]) {
  const header = [
    'submitted_at', 'user_id', 'name', 'university', 'campus', 'plan', 'platform', 'app_version', 'language',
    ...survey.questions.map((q, i) => `Q${i + 1}: ${q.prompt_en}`),
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([
      r.created_at, r.user_id, r.user_name, r.university, r.campus, r.plan, r.platform, r.app_version, r.language,
      ...survey.questions.map((q) => answerText(q, r.answers[q.id])),
    ].map(csvCell).join(','));
  }
  // BOM so Excel opens UTF-8 (BM text, emoji) correctly.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feedback-${survey.title_en.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '—';
}

function QuestionSummary({ q, index, responses }: { q: FeedbackQuestion; index: number; responses: FeedbackResponseRow[] }) {
  const answered = responses.filter((r) => r.answers[q.id] != null);

  let body: ReactNode;
  if (q.type === 'rating') {
    const counts = [1, 2, 3, 4, 5].map((star) => ({
      star: `${star}★`,
      count: answered.filter((r) => Number(r.answers[q.id]) === star).length,
    }));
    const avg = answered.length
      ? answered.reduce((sum, r) => sum + Number(r.answers[q.id]), 0) / answered.length
      : 0;
    body = (
      <div className="grid items-center gap-4 md:grid-cols-[160px_1fr]">
        <div>
          <div className="text-4xl font-black tabular-nums text-slate-900 dark:text-slate-100">{answered.length ? avg.toFixed(2) : '—'}</div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">average of {answered.length}</div>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={counts}>
              <XAxis dataKey="star" tickLine={false} axisLine={false} fontSize={12} tick={{ fill: '#94a3b8' }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={30} tick={{ fill: '#94a3b8' }} />
              <Tooltip cursor={{ fill: 'rgba(148,163,184,0.15)' }} />
              <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  } else if (q.type === 'single' || q.type === 'multi') {
    const counts = new Map<string, number>();
    for (const r of answered) {
      const a = r.answers[q.id];
      for (const id of Array.isArray(a) ? a : [a]) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
    }
    const ids = [...new Set([...(q.options ?? []).map((o) => o.id), ...counts.keys()])];
    const max = Math.max(1, ...counts.values());
    body = (
      <div className="space-y-2">
        {ids.map((id) => {
          const n = counts.get(id) ?? 0;
          return (
            <div key={id}>
              <div className="flex justify-between text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>{optionLabel(q, id)}</span>
                <span className="tabular-nums">{n} · {pct(n, answered.length)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
        {q.type === 'multi' && (
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Percentages are of respondents; one person can pick several.</div>
        )}
      </div>
    );
  } else {
    body = (
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {answered.length === 0 && <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">No answers yet.</div>}
        {answered.map((r) => (
          <div key={r.id} className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
            <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{String(r.answers[q.id])}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {r.user_name ?? 'Unknown'} · {r.university ?? '—'} · {fmtDate(r.created_at)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Panel
      title={
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 rounded-lg bg-slate-900 px-2 py-0.5 text-xs font-black text-white dark:bg-white dark:text-slate-900">Q{index + 1}</span>
          <span>{q.prompt_en}</span>
        </span>
      }
      description={`${QUESTION_TYPE_LABEL[q.type]} · ${answered.length} answered`}
    >
      {body}
    </Panel>
  );
}

export function FeedbackSurveyResults({ surveyId, onBack }: { surveyId: string; onBack: () => void }) {
  const [data, setData] = useState<{ survey: FeedbackSurveyRow; stats: FeedbackSurveyStats; responses: FeedbackResponseRow[] } | null>(null);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // The route remounts this component (key) per survey, so no reset needed here.
  useEffect(() => {
    getFeedbackSurveyResults(surveyId).then(setData).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load results'));
  }, [surveyId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data.responses;
    return data.responses.filter((r) =>
      [r.user_name, r.university, r.campus, r.plan, r.platform, JSON.stringify(r.answers)]
        .some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [data, filter]);

  const backButton = <Button type="button" variant="secondary" size="sm" onClick={onBack}>← All surveys</Button>;

  if (err) {
    return (
      <div className="space-y-4">
        {backButton}
        <Notice tone="danger">{err}</Notice>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        {backButton}
        <SkeletonRows rows={3} height="h-24" />
      </div>
    );
  }

  const { survey, stats, responses } = data;
  const open = openId ? responses.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {backButton}
        <h2 className="min-w-0 text-lg font-black text-slate-900 dark:text-slate-100">{survey.title_en}</h2>
        <Button type="button" variant="secondary" size="sm" className="ml-auto" disabled={responses.length === 0}
          onClick={() => downloadCsv(survey, responses)}>
          Export CSV
        </Button>
      </div>

      <StatStrip>
        <StatItem label="Users reached" value={stats.reached_users} hint="saw the popup at least once" />
        <StatItem label="Times shown" value={stats.times_shown} hint={`${stats.times_dismissed} “Not now”`} />
        <StatItem label="Responses" value={stats.responses} />
        <StatItem label="Response rate" value={pct(stats.responses, stats.reached_users)} hint="responses ÷ users reached" />
      </StatStrip>

      <SectionTitle>Summary by question</SectionTitle>
      {survey.questions.map((q, i) => <QuestionSummary key={q.id} q={q} index={i} responses={responses} />)}

      <Panel
        title="Individual responses"
        description={filter.trim() ? `${filtered.length} of ${responses.length} match` : `${responses.length} total`}
        actions={
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, university, answer…"
            aria-label="Filter responses"
            className="h-9 w-72 max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
        }
        padded={false}
      >
        {filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState title={filter.trim() && responses.length > 0 ? 'No responses match this filter.' : 'No responses yet.'} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-black uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3">Submitted</th>
                  <th className="px-3 py-3">User</th>
                  <th className="px-3 py-3">University / campus</th>
                  <th className="hidden px-3 py-3 md:table-cell">Plan</th>
                  <th className="hidden px-3 py-3 lg:table-cell">Device</th>
                  <th className="px-5 py-3"><span className="sr-only">Answers</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((r) => (
                  <tr key={r.id} className={openId === r.id ? 'bg-slate-50 dark:bg-slate-800/50' : undefined}>
                    <td className="whitespace-nowrap px-5 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                      {r.user_name ?? 'Unknown'}
                      <div className="font-mono text-[10px] text-slate-400">{r.user_id}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{r.university ?? '—'}{r.campus ? ` · ${r.campus}` : ''}</td>
                    <td className="hidden px-3 py-2.5 text-slate-700 dark:text-slate-300 md:table-cell">{r.plan ?? '—'}</td>
                    <td className="hidden px-3 py-2.5 text-slate-700 dark:text-slate-300 lg:table-cell">
                      {r.platform ?? '—'} {r.app_version ? `v${r.app_version}` : ''} · {r.language.toUpperCase()}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                        Answers
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open && (
        <SidePanel
          title={open.user_name ?? 'Unknown'}
          subtitle={`Submitted ${fmtDate(open.created_at)}`}
          onClose={() => setOpenId(null)}
        >
          <FactGrid
            items={[
              ['User id', <span className="font-mono text-xs">{open.user_id}</span>],
              ['University / campus', `${open.university ?? '—'}${open.campus ? ` · ${open.campus}` : ''}`],
              ['Plan', open.plan ?? '—'],
              ['Device', `${open.platform ?? '—'} ${open.app_version ? `v${open.app_version}` : ''} · ${open.language.toUpperCase()}`],
            ]}
          />
          <div className="space-y-4">
            {survey.questions.map((q, i) => (
              <div key={q.id}>
                <div className="text-xs font-black text-slate-500 dark:text-slate-400">Q{i + 1}. {q.prompt_en}</div>
                <div className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">
                  {answerText(q, open.answers[q.id]) || <span className="text-slate-400">Skipped</span>}
                </div>
              </div>
            ))}
          </div>
        </SidePanel>
      )}
    </div>
  );
}

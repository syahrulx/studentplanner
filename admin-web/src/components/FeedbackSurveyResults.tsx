import { Fragment, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  getFeedbackSurveyResults,
  type FeedbackQuestion,
  type FeedbackResponseRow,
  type FeedbackSurveyRow,
  type FeedbackSurveyStats,
} from '../lib/api';
import { QUESTION_TYPE_LABEL, cardCls, fmtDate, secondaryBtnCls } from '../lib/feedbackSurveys';
import { SectionTitle } from './FeedbackSurveyFields';

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

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className={cardCls}>
      <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '—';
}

function QuestionSummary({ q, index, responses }: { q: FeedbackQuestion; index: number; responses: FeedbackResponseRow[] }) {
  const answered = responses.filter((r) => r.answers[q.id] != null);

  let body: React.ReactNode;
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
          <div className="text-4xl font-black text-slate-900 dark:text-slate-100">{answered.length ? avg.toFixed(2) : '—'}</div>
          <div className="text-xs font-semibold text-slate-500">average of {answered.length}</div>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={counts}>
              <XAxis dataKey="star" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={30} />
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
                <span>{n} · {pct(n, answered.length)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
        {q.type === 'multi' && (
          <div className="text-xs font-semibold text-slate-500">Percentages are of respondents; one person can pick several.</div>
        )}
      </div>
    );
  } else {
    body = (
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {answered.length === 0 && <div className="text-sm font-semibold text-slate-500">No answers yet.</div>}
        {answered.map((r) => (
          <div key={r.id} className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950">
            <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{String(r.answers[q.id])}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">
              {r.user_name ?? 'Unknown'} · {r.university ?? '—'} · {fmtDate(r.created_at)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cardCls}>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="rounded-lg bg-slate-900 px-2 py-0.5 text-xs font-black text-white dark:bg-white dark:text-slate-900">Q{index + 1}</span>
        <span className="text-base font-black text-slate-900 dark:text-slate-100">{q.prompt_en}</span>
        <span className="text-xs font-semibold text-slate-500">
          {QUESTION_TYPE_LABEL[q.type]} · {answered.length} answered
        </span>
      </div>
      {body}
    </div>
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

  if (err) {
    return (
      <div className="space-y-4">
        <button className={secondaryBtnCls} onClick={onBack}>← Back</button>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{err}</div>
      </div>
    );
  }
  if (!data) return <div className="p-6 text-sm font-semibold text-slate-500">Loading results…</div>;

  const { survey, stats, responses } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className={secondaryBtnCls} onClick={onBack}>← Back</button>
        <div className="text-lg font-black text-slate-900 dark:text-slate-100">{survey.title_en}</div>
        <button className={`ml-auto ${secondaryBtnCls}`} disabled={responses.length === 0} onClick={() => downloadCsv(survey, responses)}>
          Export CSV
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Users reached" value={stats.reached_users} sub="saw the popup at least once" />
        <Stat label="Times shown" value={stats.times_shown} sub={`${stats.times_dismissed} “Not now”`} />
        <Stat label="Responses" value={stats.responses} />
        <Stat label="Response rate" value={pct(stats.responses, stats.reached_users)} sub="responses ÷ users reached" />
      </div>

      <SectionTitle>Summary</SectionTitle>
      {survey.questions.map((q, i) => <QuestionSummary key={q.id} q={q} index={i} responses={responses} />)}

      <div className={cardCls}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">Individual responses</h3>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, university, answer…"
            className="ml-auto w-72 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">University / campus</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Device</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Fragment key={r.id}>
                  <tr className="bg-slate-50/60 dark:bg-slate-950/40">
                    <td className="px-3 py-2 text-xs font-semibold text-slate-500">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                      {r.user_name ?? 'Unknown'}
                      <div className="font-mono text-[10px] text-slate-400">{r.user_id}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.university ?? '—'}{r.campus ? ` · ${r.campus}` : ''}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{r.plan ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {r.platform ?? '—'} {r.app_version ? `v${r.app_version}` : ''} · {r.language.toUpperCase()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button className={secondaryBtnCls} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                        {openId === r.id ? 'Hide' : 'Answers'}
                      </button>
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr>
                      <td colSpan={6} className="px-3 pb-3">
                        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                          {survey.questions.map((q, i) => (
                            <div key={q.id}>
                              <div className="text-xs font-black text-slate-500">Q{i + 1}. {q.prompt_en}</div>
                              <div className="whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">
                                {answerText(q, r.answers[q.id]) || <span className="text-slate-400">— skipped —</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm font-semibold text-slate-500">No responses yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

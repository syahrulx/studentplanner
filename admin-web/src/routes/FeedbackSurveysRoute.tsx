import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MotionPanel, MotionSection } from '../ui/motion';
import {
  deleteFeedbackSurvey,
  listFeedbackSurveys,
  upsertFeedbackSurvey,
  type FeedbackSurveyInput,
  type FeedbackSurveyRow,
} from '../lib/api';
import { FeedbackSurveyEditor } from '../components/FeedbackSurveyEditor';
import { FeedbackSurveyResults } from '../components/FeedbackSurveyResults';
import { cardCls, dangerBtnCls, fmtDate, primaryBtnCls, randomId, secondaryBtnCls, toInput } from '../lib/feedbackSurveys';

type View =
  | { kind: 'list' }
  | { kind: 'edit'; survey: FeedbackSurveyRow | null; template?: FeedbackSurveyInput }
  | { kind: 'results'; id: string };

function statusOf(s: FeedbackSurveyRow): { label: string; cls: string } {
  const now = Date.now();
  if (!s.is_active) return { label: 'Off', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400' };
  if (s.ends_at && new Date(s.ends_at).getTime() <= now) {
    return { label: 'Ended', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400' };
  }
  if (s.starts_at && new Date(s.starts_at).getTime() > now) {
    return { label: 'Scheduled', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' };
  }
  return { label: 'Live', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' };
}

export function FeedbackSurveysRoute() {
  const [items, setItems] = useState<FeedbackSurveyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(() => {
    const id = params.get('results');
    return id ? { kind: 'results', id } : { kind: 'list' };
  });

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      setItems(await listFeedbackSurveys());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load surveys');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const go = (next: View) => {
    setView(next);
    const p = new URLSearchParams(params);
    if (next.kind === 'results') p.set('results', next.id);
    else p.delete('results');
    setParams(p, { replace: true });
    window.scrollTo({ top: 0 });
  };

  const toggleActive = async (s: FeedbackSurveyRow) => {
    setBusy(true);
    try {
      await upsertFeedbackSurvey({ ...toInput(s), is_active: !s.is_active }, s.id);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update');
      setBusy(false);
    }
  };

  const duplicate = (s: FeedbackSurveyRow) => {
    const copy: FeedbackSurveyInput = {
      ...toInput(s),
      title_en: `${s.title_en} (copy)`.slice(0, 120),
      is_active: false,
      // Fresh ids so answers to the copy never collide with the original's.
      questions: s.questions.map((q) => ({
        ...q,
        id: randomId('q'),
        options: q.options?.map((o) => ({ ...o, id: randomId('o') })),
      })),
    };
    go({ kind: 'edit', survey: null, template: copy });
  };

  const remove = async (s: FeedbackSurveyRow) => {
    const n = s.stats?.responses ?? 0;
    const warn = n > 0 ? ` Its ${n} response${n === 1 ? '' : 's'} will be deleted too.` : '';
    if (!confirm(`Delete “${s.title_en}”?${warn} This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteFeedbackSurvey(s.id);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete');
      setBusy(false);
    }
  };

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Feedback Surveys</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          In-app popups that collect feedback straight to the team. You control the questions, who sees them, when, and how often.
        </div>
      </MotionSection>

      {err && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      )}

      <MotionPanel className="mt-6">
        {view.kind === 'edit' && (
          <FeedbackSurveyEditor
            key={view.survey?.id ?? 'new'}
            existing={view.survey}
            template={view.template}
            onCancel={() => go({ kind: 'list' })}
            onDone={() => { go({ kind: 'list' }); void refresh(); }}
          />
        )}

        {view.kind === 'results' && <FeedbackSurveyResults key={view.id} surveyId={view.id} onBack={() => go({ kind: 'list' })} />}

        {view.kind === 'list' && (
          <div className={cardCls}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">All surveys</h3>
              <button className={primaryBtnCls} onClick={() => go({ kind: 'edit', survey: null })}>+ New survey</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Survey</th>
                    <th className="px-3 py-2">Reached</th>
                    <th className="px-3 py-2">Responses</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => {
                    const st = statusOf(s);
                    const reached = s.stats?.reached_users ?? 0;
                    const responses = s.stats?.responses ?? 0;
                    return (
                      <tr key={s.id} className="bg-slate-50/60 dark:bg-slate-950/40">
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-bold ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-sm font-black text-slate-900 dark:text-slate-100">{s.title_en}</div>
                          <div className="text-xs font-semibold text-slate-500">
                            {s.questions.length} question{s.questions.length === 1 ? '' : 's'} · priority {s.priority}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{reached}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {responses}
                          {reached > 0 && <span className="ml-1 text-xs text-slate-500">({Math.round((responses / reached) * 100)}%)</span>}
                        </td>
                        <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">{fmtDate(s.updated_at)}</td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-2">
                            <button className={secondaryBtnCls} onClick={() => go({ kind: 'results', id: s.id })}>Results</button>
                            <button className={secondaryBtnCls} disabled={busy} onClick={() => void toggleActive(s)}>
                              {s.is_active ? 'Turn off' : 'Turn on'}
                            </button>
                            <button className={secondaryBtnCls} onClick={() => go({ kind: 'edit', survey: s })}>Edit</button>
                            <button className={secondaryBtnCls} onClick={() => duplicate(s)}>Duplicate</button>
                            <button className={dangerBtnCls} disabled={busy} onClick={() => void remove(s)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && !busy && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                        No surveys yet. Create one to start collecting feedback.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </MotionPanel>
    </div>
  );
}

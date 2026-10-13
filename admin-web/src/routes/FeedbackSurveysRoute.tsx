import { useEffect, useState, type ReactNode } from 'react';
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
import { fmtDate, randomId, toInput } from '../lib/feedbackSurveys';
import { Button } from '../ui/Button';
import { Chip, EmptyState, Notice, PageHeader, SkeletonRows } from '../ui/page';
import type { Tone } from '../ui/tones';
import { DANGER_TEXT_BTN } from '../components/config/buttons';

type View =
  | { kind: 'list' }
  | { kind: 'edit'; survey: FeedbackSurveyRow | null; template?: FeedbackSurveyInput }
  | { kind: 'results'; id: string };

function statusOf(s: FeedbackSurveyRow): { label: string; tone: Tone } {
  const now = Date.now();
  if (!s.is_active) return { label: 'Off', tone: 'neutral' };
  if (s.ends_at && new Date(s.ends_at).getTime() <= now) {
    return { label: 'Ended', tone: 'neutral' };
  }
  if (s.starts_at && new Date(s.starts_at).getTime() > now) {
    return { label: 'Scheduled', tone: 'warning' };
  }
  return { label: 'Live', tone: 'success' };
}

/** One number in a survey card. */
function CardStat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-lg font-black leading-none tabular-nums text-slate-900 dark:text-slate-100">
        {value}
        {hint ? <span className="ml-1 text-xs font-bold text-slate-500 dark:text-slate-400">{hint}</span> : null}
      </div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</div>
    </div>
  );
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
    <div className="space-y-5">
      <MotionSection>
        <PageHeader
          title="Feedback surveys"
          description="In-app popups that send feedback straight to the team. You choose the questions, who sees them, when and how often."
          actions={view.kind === 'list' ? (
            <Button type="button" onClick={() => go({ kind: 'edit', survey: null })}>+ New survey</Button>
          ) : undefined}
        />
      </MotionSection>

      {err ? <Notice tone="danger">{err}</Notice> : null}

      <MotionPanel>
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
          busy && items.length === 0 ? (
            <SkeletonRows rows={3} height="h-28" />
          ) : items.length === 0 ? (
            <EmptyState
              title="No surveys yet"
              action={<Button type="button" size="sm" onClick={() => go({ kind: 'edit', survey: null })}>+ New survey</Button>}
            >
              Create one to start collecting feedback.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {items.map((s) => {
                const st = statusOf(s);
                const reached = s.stats?.reached_users ?? 0;
                const responses = s.stats?.responses ?? 0;
                return (
                  <article
                    key={s.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip tone={st.tone}>{st.label}</Chip>
                          <h3 className="min-w-0 text-base font-black text-slate-900 dark:text-slate-100">{s.title_en}</h3>
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {s.questions.length} question{s.questions.length === 1 ? '' : 's'} · priority {s.priority} · updated {fmtDate(s.updated_at)}
                        </div>
                      </div>
                      <div className="grid shrink-0 grid-cols-2 gap-6 lg:w-56">
                        <CardStat label="Reached" value={reached} />
                        <CardStat
                          label="Responses"
                          value={responses}
                          hint={reached > 0 ? `(${Math.round((responses / reached) * 100)}%)` : undefined}
                        />
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5 lg:justify-end">
                        <Button type="button" size="sm" variant="secondary" onClick={() => go({ kind: 'results', id: s.id })}>Results</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => go({ kind: 'edit', survey: s })}>Edit</Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void toggleActive(s)}>
                          {s.is_active ? 'Turn off' : 'Turn on'}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => duplicate(s)}>Duplicate</Button>
                        <button type="button" className={DANGER_TEXT_BTN} disabled={busy} onClick={() => void remove(s)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        )}
      </MotionPanel>
    </div>
  );
}

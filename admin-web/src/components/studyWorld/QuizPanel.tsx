import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeActionDialog } from '../SafeActionDialog';
import {
  deleteQuizQuestion,
  listQuizQuestions,
  listQuizStats,
  saveQuizQuestion,
  setQuizStatus,
  type QuizInput,
  type QuizQuestion,
  type QuizStats,
  type QuizStatus,
} from '../../lib/studyWorldQuiz';
import { BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { ErrorBox, Field, Modal } from './ui';

const EMPTY: QuizInput = { subject: '', question: '', answer: true, explanation: null, status: 'active' };

function OX({ answer, size = 'sm' }: { answer: boolean; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'h-12 w-12 text-2xl' : 'h-7 w-7 text-sm';
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-black text-white ${cls} ${answer ? 'bg-emerald-600' : 'bg-rose-600'}`} title={answer ? 'True (O)' : 'False (X)'}>
      {answer ? 'O' : 'X'}
    </span>
  );
}

/** The quiz question bank used by the quiz deck and classroom rounds. */
export function QuizPanel() {
  const [rows, setRows] = useState<QuizQuestion[]>([]);
  const [stats, setStats] = useState<Record<string, QuizStats> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>('all');
  const [status, setStatus] = useState<QuizStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; input: QuizInput } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, s] = await Promise.all([listQuizQuestions(), listQuizStats()]);
      setRows(q);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load questions.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const subjects = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => counts.set(r.subject, (counts.get(r.subject) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (subject === 'all' || r.subject === subject) &&
      (status === 'all' || r.status === status) &&
      (!q || r.question.toLowerCase().includes(q) || (r.explanation ?? '').toLowerCase().includes(q)),
    );
  }, [rows, subject, status, search]);

  const active = rows.filter((r) => r.status === 'active').length;

  async function toggle(row: QuizQuestion) {
    const next: QuizStatus = row.status === 'active' ? 'hidden' : 'active';
    setBusy(row.id);
    try {
      await setQuizStatus([row.id], next);
      setRows((all) => all.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change status.');
    } finally {
      setBusy(null);
    }
  }

  function remove(row: QuizQuestion) {
    requestSafeAction({
      title: 'Delete this question',
      operation: 'Delete question',
      affectedCount: 1,
      subject: row.question,
      irreversible: true,
      warning: 'This question has never been asked, so no player answers are lost. It cannot be undone.',
      onConfirm: async () => {
        await deleteQuizQuestion(row.id);
        await load();
      },
    });
  }

  return (
    <div className="space-y-4 p-4">
      {safeActionDialog}
      <ErrorBox message={error} />

      <div className={`${CARD} space-y-3 p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-black text-slate-900 dark:text-white">{active} active question{active === 1 ? '' : 's'}</div>
          <span className="text-xs font-semibold text-slate-500">· {rows.length - active} hidden · players get a random active one each round</span>
          <button type="button" className={`${BTN_DARK} ml-auto`} onClick={() => setEditing({ id: null, input: { ...EMPTY, subject: subject === 'all' ? '' : subject } })}>+ New question</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setSubject('all')} className={`rounded-xl px-3 py-1.5 text-xs font-black ${subject === 'all' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>All ({rows.length})</button>
          {subjects.map(([name, n]) => (
            <button key={name} type="button" onClick={() => setSubject(name)} className={`rounded-xl px-3 py-1.5 text-xs font-black ${subject === name ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{name} ({n})</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'active', 'hidden'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs font-bold ${status === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>
              {s === 'all' ? 'Everything' : s === 'active' ? 'Active' : 'Hidden'}
            </button>
          ))}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions" className={`${FIELD} ml-auto h-9 w-56`} />
        </div>
        {stats === null && !loading ? (
          <p className="text-xs font-semibold text-amber-600">Answer numbers need gradeup-mobile migration 20261012000005_study_world_quiz_admin.sql. Until then, Delete is turned off (we can’t check a question was never asked).</p>
        ) : null}
      </div>

      <div className={`${CARD} divide-y divide-slate-100 dark:divide-slate-800`}>
        {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
          : shown.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No questions match.</div>
          : shown.map((r) => {
            const st = stats?.[r.id];
            const asked = st?.times_asked ?? 0;
            const pct = st && st.answers > 0 ? Math.round((st.correct / st.answers) * 100) : null;
            const canDelete = stats !== null && asked === 0;
            return (
              <div key={r.id} className={`flex flex-wrap items-start gap-3 p-4 ${r.status === 'hidden' ? 'opacity-55' : ''}`}>
                <OX answer={r.answer} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{r.question}</div>
                  {r.explanation ? <div className="mt-0.5 text-xs text-slate-500">{r.explanation}</div> : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{r.subject}</span>
                    {stats ? (
                      asked ? <span>Asked {asked}× · {st!.answers} answer{st!.answers === 1 ? '' : 's'}{pct !== null ? ` · ${pct}% got it right` : ''} · last {when(st!.last_asked)}</span> : <span>Not asked yet</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" disabled={busy === r.id} onClick={() => void toggle(r)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${r.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>
                    {r.status === 'active' ? 'Active' : 'Hidden'}
                  </button>
                  <button type="button" className={`${BTN_LIGHT} h-7`} onClick={() => setEditing({ id: r.id, input: { subject: r.subject, question: r.question, answer: r.answer, explanation: r.explanation, status: r.status } })}>Edit</button>
                  <button type="button" className={`${BTN_LIGHT} h-7`} disabled={!canDelete} onClick={() => remove(r)}
                    title={canDelete ? 'Delete' : stats === null ? 'Run the quiz stats SQL first' : 'Already asked: hide it instead, so players’ answer history is kept'}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {editing ? (
        <QuizEditor
          id={editing.id}
          initial={editing.input}
          subjects={subjects.map(([s]) => s)}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      ) : null}
    </div>
  );
}

function QuizEditor({ id, initial, subjects, onClose, onSaved }: {
  id: string | null;
  initial: QuizInput;
  subjects: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [v, setV] = useState<QuizInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = v.question.trim();
  const problem =
    v.subject.trim().length < 2 ? 'Give it a subject (2–40 characters).'
    : q.length < 5 ? 'Write the question (at least 5 characters).'
    : q.length > 200 ? 'Keep the question under 200 characters.'
    : (v.explanation ?? '').length > 300 ? 'Keep the explanation under 300 characters.'
    : null;

  async function save() {
    if (problem) return;
    setBusy(true);
    try {
      await saveQuizQuestion(id, v);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={id ? 'Edit question' : 'New question'} onClose={onClose} footer={<>
      <button type="button" className={BTN_LIGHT} onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className={BTN_DARK} onClick={() => void save()} disabled={busy || !!problem}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/50">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">How players see it</div>
        <div className="mt-1 text-xs font-semibold text-slate-500">{v.subject || 'Subject'}</div>
        <div className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{q || 'Your question…'}</div>
        <div className="mt-2 text-[11px] font-semibold text-slate-400">Stand on O for true, X for false. The answer is shown only after time runs out.</div>
      </div>
      <Field label="Subject" hint="Pick one that exists or type a new one.">
        <input value={v.subject} maxLength={40} list="quiz-subjects" onChange={(e) => setV({ ...v, subject: e.target.value })} className={FIELD} />
        <datalist id="quiz-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      <Field label={`Question (${q.length}/200)`} hint="Write it as a statement that is either true or false.">
        <textarea value={v.question} maxLength={200} rows={3} onChange={(e) => setV({ ...v, question: e.target.value })} className={`${FIELD} h-auto py-2`} />
      </Field>
      <div>
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Correct answer</div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {([true, false] as const).map((a) => (
            <button key={String(a)} type="button" onClick={() => setV({ ...v, answer: a })}
              className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left text-sm font-black ${v.answer === a ? (a ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'border-rose-600 bg-rose-50 dark:bg-rose-950/30') : 'border-slate-200 dark:border-slate-700'}`}>
              <OX answer={a} size="lg" /> {a ? 'True' : 'False'}
            </button>
          ))}
        </div>
      </div>
      <Field label={`Explanation (optional, ${(v.explanation ?? '').length}/300)`} hint="Shown after the round, so players learn why.">
        <textarea value={v.explanation ?? ''} maxLength={300} rows={2} onChange={(e) => setV({ ...v, explanation: e.target.value })} className={`${FIELD} h-auto py-2`} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={v.status === 'active'} onChange={(e) => setV({ ...v, status: e.target.checked ? 'active' : 'hidden' })} className="h-4 w-4 accent-slate-900" />
        Active (can be picked for rounds)
      </label>
      {problem ? <div className="text-xs font-bold text-rose-600">{problem}</div> : null}
      <ErrorBox message={error} />
    </Modal>
  );
}

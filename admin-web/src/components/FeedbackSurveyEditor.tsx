import { useEffect, useMemo, useState } from 'react';
import {
  FEEDBACK_EVENTS,
  listCampuses,
  listUniversities,
  upsertFeedbackSurvey,
  type AdminCampusRow,
  type FeedbackQuestion,
  type FeedbackQuestionType,
  type FeedbackSurveyInput,
  type FeedbackSurveyRow,
  type UniversityRow,
} from '../lib/api';
import {
  EMPTY_SURVEY,
  QUESTION_TYPE_LABEL,
  cardCls,
  dangerBtnCls,
  describeAudience,
  inputCls,
  primaryBtnCls,
  randomId,
  secondaryBtnCls,
  toInput,
} from '../lib/feedbackSurveys';
import { Field, SectionTitle } from './FeedbackSurveyFields';


/** ISO → value for <input type="datetime-local"> in the admin's local time. */
function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function newQuestion(type: FeedbackQuestionType): FeedbackQuestion {
  const q: FeedbackQuestion = { id: randomId('q'), type, prompt_en: '', prompt_ms: null, required: type !== 'text' };
  if (type === 'single' || type === 'multi') {
    q.options = [
      { id: randomId('o'), label_en: '', label_ms: null },
      { id: randomId('o'), label_en: '', label_ms: null },
    ];
  }
  return q;
}

function toggleIn(list: string[] | null, value: string): string[] | null {
  const cur = list ?? [];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  return next.length ? next : null;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600 dark:border-slate-700 dark:bg-slate-950"
      />
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
    </label>
  );
}

function NumberField({ label, hint, value, min, max, onChange }: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Math.trunc(Number(e.target.value) || 0))))}
        className={inputCls}
      />
    </Field>
  );
}

function QuestionEditor({ q, index, total, onChange, onMove, onRemove }: {
  q: FeedbackQuestion;
  index: number;
  total: number;
  onChange: (q: FeedbackQuestion) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const isChoice = q.type === 'single' || q.type === 'multi';
  const setType = (type: FeedbackQuestionType) => {
    const next: FeedbackQuestion = { ...q, type };
    if ((type === 'single' || type === 'multi') && !(q.options && q.options.length)) {
      next.options = newQuestion(type).options;
    }
    if (type !== 'single' && type !== 'multi') delete next.options;
    onChange(next);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-slate-900 px-2 py-0.5 text-xs font-black text-white dark:bg-white dark:text-slate-900">
          Q{index + 1}
        </span>
        <select
          value={q.type}
          onChange={(e) => setType(e.target.value as FeedbackQuestionType)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
        >
          {(Object.keys(QUESTION_TYPE_LABEL) as FeedbackQuestionType[]).map((t) => (
            <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
          ))}
        </select>
        <Toggle checked={q.required} onChange={(v) => onChange({ ...q, required: v })} label="Required" />
        <div className="ml-auto flex gap-2">
          <button type="button" className={secondaryBtnCls} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" className={secondaryBtnCls} disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
          <button type="button" className={dangerBtnCls} onClick={onRemove}>Remove</button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Question (EN)">
          <input className={inputCls} value={q.prompt_en} maxLength={300}
            onChange={(e) => onChange({ ...q, prompt_en: e.target.value })}
            placeholder="How happy are you with Rencana?" />
        </Field>
        <Field label="Question (BM)" hint="Optional — users can switch to BM in the popup.">
          <input className={inputCls} value={q.prompt_ms ?? ''} maxLength={300}
            onChange={(e) => onChange({ ...q, prompt_ms: e.target.value || null })}
            placeholder="Sejauh mana anda berpuas hati dengan Rencana?" />
        </Field>
      </div>

      {q.type === 'text' && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Placeholder (EN)">
            <input className={inputCls} value={q.placeholder_en ?? ''} maxLength={120}
              onChange={(e) => onChange({ ...q, placeholder_en: e.target.value || null })}
              placeholder="Tell us more…" />
          </Field>
          <Field label="Placeholder (BM)">
            <input className={inputCls} value={q.placeholder_ms ?? ''} maxLength={120}
              onChange={(e) => onChange({ ...q, placeholder_ms: e.target.value || null })}
              placeholder="Ceritakan lagi…" />
          </Field>
        </div>
      )}

      {isChoice && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Choices {q.type === 'multi' ? '(user can pick several)' : '(user picks one)'}
          </div>
          {(q.options ?? []).map((o, oi) => (
            <div key={o.id} className="flex gap-2">
              <input className={inputCls} value={o.label_en} maxLength={120} placeholder={`Choice ${oi + 1} (EN)`}
                onChange={(e) => onChange({
                  ...q,
                  options: (q.options ?? []).map((x) => (x.id === o.id ? { ...x, label_en: e.target.value } : x)),
                })} />
              <input className={inputCls} value={o.label_ms ?? ''} maxLength={120} placeholder={`Choice ${oi + 1} (BM)`}
                onChange={(e) => onChange({
                  ...q,
                  options: (q.options ?? []).map((x) => (x.id === o.id ? { ...x, label_ms: e.target.value || null } : x)),
                })} />
              <button type="button" className={dangerBtnCls} disabled={(q.options ?? []).length <= 2}
                onClick={() => onChange({ ...q, options: (q.options ?? []).filter((x) => x.id !== o.id) })}>
                ✕
              </button>
            </div>
          ))}
          {(q.options ?? []).length < 12 && (
            <button type="button" className={secondaryBtnCls}
              onClick={() => onChange({
                ...q,
                options: [...(q.options ?? []), { id: randomId('o'), label_en: '', label_ms: null }],
              })}>
              + Add choice
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CheckList({ items, selected, onToggle, search, emptyText }: {
  items: { value: string; label: string }[];
  selected: string[] | null;
  onToggle: (value: string) => void;
  search: string;
  emptyText: string;
}) {
  const q = search.trim().toLowerCase();
  const sel = new Set(selected ?? []);
  const visible = items
    .filter((i) => !q || i.label.toLowerCase().includes(q) || sel.has(i.value))
    .sort((a, b) => Number(sel.has(b.value)) - Number(sel.has(a.value)));
  return (
    <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
      {visible.length === 0 && (
        <div className="p-2 text-xs font-semibold text-slate-500">{emptyText}</div>
      )}
      {visible.slice(0, 200).map((i) => (
        <label key={i.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-white dark:hover:bg-slate-900">
          <input type="checkbox" checked={sel.has(i.value)} onChange={() => onToggle(i.value)} className="h-4 w-4" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{i.label}</span>
        </label>
      ))}
    </div>
  );
}

export function FeedbackSurveyEditor({ existing, template, onDone, onCancel }: {
  /** Survey being edited; null when creating. */
  existing: FeedbackSurveyRow | null;
  /** Starting values for a new survey (e.g. a duplicate). */
  template?: FeedbackSurveyInput;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [s, setS] = useState<FeedbackSurveyInput>(() =>
    existing ? toInput(existing) : template ?? { ...EMPTY_SURVEY, questions: [newQuestion('rating')] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [universities, setUniversities] = useState<UniversityRow[]>([]);
  const [campuses, setCampuses] = useState<AdminCampusRow[]>([]);
  const [uniSearch, setUniSearch] = useState('');
  const [campusSearch, setCampusSearch] = useState('');

  useEffect(() => {
    void listUniversities().then(setUniversities).catch(() => {});
    void listCampuses().then(setCampuses).catch(() => {});
  }, []);

  const set = <K extends keyof FeedbackSurveyInput>(k: K, v: FeedbackSurveyInput[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const setQuestion = (i: number, q: FeedbackQuestion) =>
    setS((prev) => ({ ...prev, questions: prev.questions.map((x, xi) => (xi === i ? q : x)) }));
  const moveQuestion = (i: number, dir: -1 | 1) =>
    setS((prev) => {
      const qs = [...prev.questions];
      const j = i + dir;
      if (j < 0 || j >= qs.length) return prev;
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...prev, questions: qs };
    });

  const uniNames = useMemo(() => Object.fromEntries(universities.map((u) => [u.id, u.name])), [universities]);
  const campusItems = useMemo(() => {
    const unis = s.target_university_ids;
    const names = new Map<string, string>();
    for (const c of campuses) {
      if (unis?.length && !unis.includes(c.university_id)) continue;
      const label = unis?.length === 1 ? c.name : `${c.name} · ${uniNames[c.university_id] ?? c.university_id}`;
      if (!names.has(c.name)) names.set(c.name, label);
    }
    // Keep already-selected campuses visible even if their university was unticked.
    for (const name of s.target_campuses ?? []) if (!names.has(name)) names.set(name, name);
    return [...names.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [campuses, s.target_university_ids, s.target_campuses, uniNames]);

  const responses = existing?.stats?.responses ?? 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await upsertFeedbackSurvey(s, existing?.id);
      onDone();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      {err && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      )}
      {responses > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          This survey already has {responses} response{responses === 1 ? '' : 's'}. Answers are stored by question and choice,
          so rewording is safe — but changing a question’s type or removing a choice will make older answers harder to read.
          Prefer adding new questions, or duplicate the survey.
        </div>
      )}

      <div className={cardCls}>
        <SectionTitle sub="What the user sees at the top of the popup.">Basics</SectionTitle>
        <div className="mb-4 flex flex-wrap gap-6">
          <Toggle checked={s.is_active} onChange={(v) => set('is_active', v)} label="Active (eligible users will see it)" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Title (EN)">
            <input className={inputCls} value={s.title_en} maxLength={120} onChange={(e) => set('title_en', e.target.value)}
              placeholder="Help us improve Rencana" />
          </Field>
          <Field label="Title (BM)">
            <input className={inputCls} value={s.title_ms ?? ''} maxLength={120} onChange={(e) => set('title_ms', e.target.value || null)}
              placeholder="Bantu kami tambah baik Rencana" />
          </Field>
          <Field label="Intro (EN)" hint="Optional short line under the title.">
            <textarea className={inputCls} rows={2} value={s.intro_en ?? ''} maxLength={500}
              onChange={(e) => set('intro_en', e.target.value || null)} placeholder="Takes 30 seconds. Goes straight to the team." />
          </Field>
          <Field label="Intro (BM)">
            <textarea className={inputCls} rows={2} value={s.intro_ms ?? ''} maxLength={500}
              onChange={(e) => set('intro_ms', e.target.value || null)} placeholder="Ambil masa 30 saat. Terus sampai ke team kami." />
          </Field>
        </div>
      </div>

      <div className={cardCls}>
        <SectionTitle sub="Shown one per page. Up to 20 questions.">Questions</SectionTitle>
        <div className="space-y-3">
          {s.questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              q={q}
              index={i}
              total={s.questions.length}
              onChange={(nq) => setQuestion(i, nq)}
              onMove={(dir) => moveQuestion(i, dir)}
              onRemove={() => set('questions', s.questions.filter((_, xi) => xi !== i))}
            />
          ))}
        </div>
        {s.questions.length < 20 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(QUESTION_TYPE_LABEL) as FeedbackQuestionType[]).map((t) => (
              <button key={t} type="button" className={secondaryBtnCls}
                onClick={() => set('questions', [...s.questions, newQuestion(t)])}>
                + {QUESTION_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={cardCls}>
        <SectionTitle sub="Every condition you set must be met (AND). Counts start when the user first qualifies for this survey, so existing users are not asked instantly.">
          Triggers
        </SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Start" hint="Empty = starts as soon as it is active.">
            <input type="datetime-local" className={inputCls} value={isoToLocal(s.starts_at)}
              onChange={(e) => set('starts_at', localToIso(e.target.value))} />
          </Field>
          <Field label="End" hint="Empty = runs until you turn it off.">
            <input type="datetime-local" className={inputCls} value={isoToLocal(s.ends_at)}
              onChange={(e) => set('ends_at', localToIso(e.target.value))} />
          </Field>
          <NumberField label="After N app opens" hint="0 = next time they open the app." value={s.min_app_opens} min={0} max={1000}
            onChange={(n) => set('min_app_opens', n)} />
          <NumberField label="Account at least N days old" value={s.min_account_age_days} min={0} max={3650}
            onChange={(n) => set('min_account_age_days', n)} />
          <Field label="After an action" hint="The popup appears right after the action that reaches the count.">
            <select className={inputCls} value={s.trigger_event ?? ''}
              onChange={(e) => set('trigger_event', e.target.value || null)}>
              <option value="">No action required</option>
              {FEEDBACK_EVENTS.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
            </select>
          </Field>
          {s.trigger_event && (
            <NumberField label="…this many times" value={s.trigger_event_count} min={1} max={1000}
              onChange={(n) => set('trigger_event_count', n)} />
          )}
        </div>
      </div>

      <div className={cardCls}>
        <SectionTitle sub="Leave a group empty to include everyone.">Audience</SectionTitle>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Plan</div>
            <div className="flex flex-wrap gap-4">
              {['free', 'plus', 'pro'].map((p) => (
                <Toggle key={p} checked={!!s.target_plans?.includes(p)} label={p[0].toUpperCase() + p.slice(1)}
                  onChange={() => set('target_plans', toggleIn(s.target_plans, p))} />
              ))}
            </div>
            <div className="pt-3 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Platform</div>
            <div className="flex flex-wrap gap-4">
              {[['ios', 'iOS'], ['android', 'Android']].map(([v, l]) => (
                <Toggle key={v} checked={!!s.target_platforms?.includes(v)} label={l}
                  onChange={() => set('target_platforms', toggleIn(s.target_platforms, v))} />
              ))}
            </div>
            <div className="pt-3">
              <Field label="Minimum app version" hint="e.g. 1.7.5 — empty = any version.">
                <input className={inputCls} value={s.min_app_version ?? ''} maxLength={20} placeholder="1.7.5"
                  onChange={(e) => set('min_app_version', e.target.value.trim() || null)} />
              </Field>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Universities {s.target_university_ids?.length ? `(${s.target_university_ids.length})` : '(all)'}
            </div>
            <input className={inputCls} value={uniSearch} onChange={(e) => setUniSearch(e.target.value)} placeholder="Search universities…" />
            <CheckList
              items={universities.map((u) => ({ value: u.id, label: u.name }))}
              selected={s.target_university_ids}
              onToggle={(v) => set('target_university_ids', toggleIn(s.target_university_ids, v))}
              search={uniSearch}
              emptyText="No universities match."
            />
            <div className="pt-2 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
              Campuses {s.target_campuses?.length ? `(${s.target_campuses.length})` : '(all)'}
            </div>
            <input className={inputCls} value={campusSearch} onChange={(e) => setCampusSearch(e.target.value)} placeholder="Search campuses…" />
            <CheckList
              items={campusItems}
              selected={s.target_campuses}
              onToggle={(v) => set('target_campuses', toggleIn(s.target_campuses, v))}
              search={campusSearch}
              emptyText="No campuses match."
            />
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <SectionTitle sub="What happens when the user taps “Not now” or closes the popup.">Frequency</SectionTitle>
        <div className="grid gap-3 md:grid-cols-3">
          <NumberField label="Max times shown per user" value={s.max_prompts} min={1} max={20}
            onChange={(n) => set('max_prompts', n)} />
          <NumberField label="Days before asking again" value={s.reprompt_after_days} min={0} max={365}
            onChange={(n) => set('reprompt_after_days', n)} />
          <NumberField label="Priority" hint="Higher wins when several surveys qualify. Users see at most one per app session."
            value={s.priority} min={-1000} max={1000} onChange={(n) => set('priority', n)} />
        </div>
        <div className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {describeAudience(s, uniNames).map((line) => <div key={line}>{line}</div>)}
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel}
          className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900">
          Cancel
        </button>
        <button type="submit" disabled={busy} className={`flex-1 py-3 ${primaryBtnCls}`}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Create survey'}
        </button>
      </div>
    </form>
  );
}

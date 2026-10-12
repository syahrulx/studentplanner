import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeActionDialog } from '../SafeActionDialog';
import {
  EVENT_MAPS,
  EVENT_MAP_LABEL,
  deleteEvent,
  deleteLibraryItem,
  listEvents,
  listLibrary,
  listReminderCounts,
  saveEvent,
  saveLibraryItem,
  setContentStatus,
  type EventInput,
  type EventMap,
  type LibraryInput,
  type LibraryItem,
  type WorldEvent,
} from '../../lib/studyWorldContent';
import { BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { ErrorBox, Field, Modal } from './ui';

function StatusToggle({ active, busy, onToggle }: { active: boolean; busy?: boolean; onToggle: () => void }) {
  return (
    <button type="button" disabled={busy} onClick={onToggle}
      className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${active ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>
      {active ? 'Shown' : 'Hidden'}
    </button>
  );
}

// ─── Library ────────────────────────────────────────────────────────────────

const EMPTY_ITEM: LibraryInput = { subject: '', title: '', body: '', source: 'Rencana team', status: 'active', sort_order: 100 };

/** Reading material on the Library shelves. Players also see their own notes there (not managed here). */
export function LibraryPanel() {
  const [rows, setRows] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; input: LibraryInput } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listLibrary());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the library.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const subjects = useMemo(() => [...new Set(rows.map((r) => r.subject))].sort(), [rows]);
  const shown = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    return (subject === 'all' || r.subject === subject) && (!q || r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q));
  });

  async function toggle(r: LibraryItem) {
    setBusy(r.id);
    try {
      const next = r.status === 'active' ? 'hidden' : 'active';
      await setContentStatus('study_world_library', r.id, next);
      setRows((all) => all.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change it.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 p-4">
      {safeActionDialog}
      <ErrorBox message={error} />
      <div className={`${CARD} space-y-3 p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-slate-500">Shelves and the returns desk open the Library. Players see shown items here, plus their own app notes (read-only, not listed here).</p>
          <button type="button" className={`${BTN_DARK} ml-auto`} onClick={() => setEditing({ id: null, input: { ...EMPTY_ITEM, subject: subject === 'all' ? '' : subject } })}>+ New reading</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {['all', ...subjects].map((s) => (
            <button key={s} type="button" onClick={() => setSubject(s)} className={`rounded-xl px-3 py-1.5 text-xs font-black ${subject === s ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              {s === 'all' ? `All (${rows.length})` : s}
            </button>
          ))}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className={`${FIELD} ml-auto h-9 w-48`} />
        </div>
      </div>

      {loading ? <div className={`${CARD} p-8 text-center text-sm text-slate-400`}>Loading…</div>
        : shown.length === 0 ? <div className={`${CARD} p-8 text-center text-sm text-slate-400`}>Nothing here yet.</div>
        : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((r) => (
              <div key={r.id} className={`${CARD} flex flex-col gap-2 p-4 ${r.status === 'hidden' ? 'opacity-55' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{r.subject}</span>
                  <span className="ml-auto"><StatusToggle active={r.status === 'active'} busy={busy === r.id} onToggle={() => void toggle(r)} /></span>
                </div>
                <div className="text-base font-black text-slate-900 dark:text-white">📖 {r.title}</div>
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{r.body}</p>
                <div className="mt-auto flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                  {r.source ? `By ${r.source} · ` : ''}{r.body.length.toLocaleString()} characters
                  <button type="button" className={`${BTN_LIGHT} ml-auto h-7`} onClick={() => setEditing({ id: r.id, input: { subject: r.subject, title: r.title, body: r.body, source: r.source, status: r.status, sort_order: r.sort_order } })}>Edit</button>
                  <button type="button" className={`${BTN_LIGHT} h-7`} onClick={() => requestSafeAction({
                    title: `Delete “${r.title}”`, operation: 'Delete reading', affectedCount: 1, irreversible: true,
                    warning: 'It disappears from every Library shelf. To take it down for a while, hide it instead.',
                    onConfirm: async () => { await deleteLibraryItem(r.id); await load(); },
                  })}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {editing ? <LibraryEditor id={editing.id} initial={editing.input} subjects={subjects} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} /> : null}
    </div>
  );
}

function LibraryEditor({ id, initial, subjects, onClose, onSaved }: { id: string | null; initial: LibraryInput; subjects: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [v, setV] = useState<LibraryInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem =
    v.subject.trim().length < 2 ? 'Give it a subject (2–40 characters).'
    : v.title.trim().length < 3 ? 'Give it a title (3–120 characters).'
    : v.body.length < 10 ? 'Write at least 10 characters.'
    : v.body.length > 8000 ? 'Keep it under 8,000 characters.'
    : null;

  async function save() {
    if (problem) return;
    setBusy(true);
    try {
      await saveLibraryItem(id, v);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={id ? 'Edit reading' : 'New reading'} onClose={onClose} footer={<>
      <button type="button" className={BTN_LIGHT} onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className={BTN_DARK} onClick={() => void save()} disabled={busy || !!problem}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Subject">
          <input value={v.subject} maxLength={40} list="library-subjects" onChange={(e) => setV({ ...v, subject: e.target.value })} className={FIELD} />
          <datalist id="library-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="By (optional)"><input value={v.source ?? ''} maxLength={80} onChange={(e) => setV({ ...v, source: e.target.value })} className={FIELD} /></Field>
      </div>
      <Field label="Title"><input value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} className={FIELD} /></Field>
      <Field label={`Text (${v.body.length.toLocaleString()}/8,000)`} hint="Plain text. Line breaks are kept. Links and formatting are shown as typed, not clickable.">
        <textarea value={v.body} maxLength={8000} rows={10} onChange={(e) => setV({ ...v, body: e.target.value })} className={`${FIELD} h-auto py-2 font-normal`} />
      </Field>
      <div className="rounded-2xl bg-amber-50/60 p-4 dark:bg-slate-950/50">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">How players see it</div>
        <div className="mt-1 text-lg font-black text-slate-900 dark:text-white">{v.title || 'Title'}</div>
        <div className="text-xs font-semibold text-slate-500">{v.subject || 'Subject'}{v.source ? ` · ${v.source}` : ''}</div>
        <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{v.body || 'Your text…'}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Order on shelf" hint="Smaller comes first."><input type="number" value={v.sort_order} onChange={(e) => setV({ ...v, sort_order: Math.floor(Number(e.target.value) || 0) })} className={FIELD} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={v.status === 'active'} onChange={(e) => setV({ ...v, status: e.target.checked ? 'active' : 'hidden' })} className="h-4 w-4 accent-slate-900" /> Show to players
        </label>
      </div>
      {problem ? <div className="text-xs font-bold text-rose-600">{problem}</div> : null}
      <ErrorBox message={error} />
    </Modal>
  );
}

// ─── Events ─────────────────────────────────────────────────────────────────

/** ISO time ⇄ the admin's local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

function eventPhase(e: WorldEvent): 'now' | 'upcoming' | 'past' {
  const now = Date.now();
  const start = Date.parse(e.starts_at);
  const end = e.ends_at ? Date.parse(e.ends_at) : start;
  if (end < now) return 'past';
  if (start <= now) return 'now';
  return 'upcoming';
}

const EMPTY_EVENT = (): EventInput => {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(20, 0, 0, 0);
  return { title: '', description: null, starts_at: start.toISOString(), ends_at: null, map_key: 'all', place: null, status: 'active' };
};

/** Events on the notice boards in each map. */
export function EventsPanel() {
  const [rows, setRows] = useState<WorldEvent[]>([]);
  const [reminders, setReminders] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; input: EventInput } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, r] = await Promise.all([listEvents(), listReminderCounts()]);
      setRows(e);
      setReminders(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load events.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const live = rows.filter((e) => eventPhase(e) !== 'past').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = rows.filter((e) => eventPhase(e) === 'past');

  async function toggle(e: WorldEvent) {
    setBusy(e.id);
    try {
      const next = e.status === 'active' ? 'hidden' : 'active';
      await setContentStatus('study_world_events', e.id, next);
      setRows((all) => all.map((x) => (x.id === e.id ? { ...x, status: next } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change it.');
    } finally {
      setBusy(null);
    }
  }

  const row = (e: WorldEvent) => {
    const phase = eventPhase(e);
    const n = reminders?.[e.id] ?? 0;
    return (
      <div key={e.id} className={`flex flex-wrap items-start gap-3 p-4 ${e.status === 'hidden' || phase === 'past' ? 'opacity-60' : ''}`}>
        <div className="w-28 shrink-0 text-xs font-bold text-slate-500">
          <div className="text-slate-900 dark:text-white">{new Date(e.starts_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          <div>{new Date(e.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}{e.ends_at ? ` – ${new Date(e.ends_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}</div>
          {phase === 'now' ? <span className="mt-1 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">On now</span> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-slate-900 dark:text-white">📌 {e.title}</div>
          {e.description ? <div className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500">{e.description}</div> : null}
          <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-400">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">Board: {EVENT_MAP_LABEL[e.map_key]}</span>
            {e.place ? <span>{e.place}</span> : null}
            {reminders ? <span>🔔 {n} reminder{n === 1 ? '' : 's'}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusToggle active={e.status === 'active'} busy={busy === e.id} onToggle={() => void toggle(e)} />
          <button type="button" className={`${BTN_LIGHT} h-7`} onClick={() => setEditing({ id: e.id, input: { title: e.title, description: e.description, starts_at: e.starts_at, ends_at: e.ends_at, map_key: e.map_key, place: e.place, status: e.status } })}>Edit</button>
          <button type="button" className={`${BTN_LIGHT} h-7`} onClick={() => requestSafeAction({
            title: `Delete “${e.title}”`, operation: 'Delete event', affectedCount: 1, irreversible: true,
            warning: reminders === null
              ? 'Players who set a reminder for it lose that reminder. To take it down for a while, hide it instead.'
              : `${n} player${n === 1 ? '' : 's'} set a reminder for this; they lose it. To take it down for a while, hide it instead.`,
            onConfirm: async () => { await deleteEvent(e.id); await load(); },
          })}>Delete</button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4">
      {safeActionDialog}
      <ErrorBox message={error} />
      <div className={`${CARD} flex flex-wrap items-center gap-2 p-4`}>
        <p className="text-xs font-semibold text-slate-500">Notice boards show events for their map, plus events set to “Every map”. Players see an event until a day after it ends.</p>
        <button type="button" className={`${BTN_DARK} ml-auto`} onClick={() => setEditing({ id: null, input: EMPTY_EVENT() })}>+ New event</button>
      </div>
      {reminders === null && !loading ? <p className="px-1 text-xs font-semibold text-amber-600">Reminder counts need gradeup-mobile migration 20261012000006_study_world_events_admin.sql.</p> : null}
      <div className={`${CARD} divide-y divide-slate-100 dark:divide-slate-800`}>
        <div className="px-4 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400">On now and coming up ({live.length})</div>
        {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
          : live.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No upcoming events. Add one so the boards aren’t empty.</div>
          : live.map(row)}
      </div>
      {past.length ? (
        <div className={`${CARD} divide-y divide-slate-100 dark:divide-slate-800`}>
          <button type="button" onClick={() => setShowPast((s) => !s)} className="w-full px-4 py-2 text-left text-[11px] font-black uppercase tracking-wider text-slate-400">
            Past ({past.length}) {showPast ? '▴' : '▾'}
          </button>
          {showPast ? past.map(row) : null}
        </div>
      ) : null}
      {editing ? <EventEditor id={editing.id} initial={editing.input} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} /> : null}
    </div>
  );
}

function EventEditor({ id, initial, onClose, onSaved }: { id: string | null; initial: EventInput; onClose: () => void; onSaved: () => Promise<void> }) {
  const [v, setV] = useState<EventInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem =
    v.title.trim().length < 3 ? 'Give it a title (3–80 characters).'
    : !v.starts_at ? 'Pick when it starts.'
    : v.ends_at && Date.parse(v.ends_at) < Date.parse(v.starts_at) ? 'It can’t end before it starts.'
    : (v.description ?? '').length > 600 ? 'Keep the description under 600 characters.'
    : null;

  async function save() {
    if (problem) return;
    setBusy(true);
    try {
      await saveEvent(id, v);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={id ? 'Edit event' : 'New event'} onClose={onClose} footer={<>
      <button type="button" className={BTN_LIGHT} onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className={BTN_DARK} onClick={() => void save()} disabled={busy || !!problem}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <Field label="Title"><input value={v.title} maxLength={80} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Quiz night: general knowledge" className={FIELD} /></Field>
      <Field label={`Description (optional, ${(v.description ?? '').length}/600)`}>
        <textarea value={v.description ?? ''} maxLength={600} rows={3} onChange={(e) => setV({ ...v, description: e.target.value })} className={`${FIELD} h-auto py-2 font-normal`} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" hint="Your local time.">
          <input type="datetime-local" value={toLocalInput(v.starts_at)} onChange={(e) => setV({ ...v, starts_at: fromLocalInput(e.target.value) ?? v.starts_at })} className={FIELD} />
        </Field>
        <Field label="Ends (optional)">
          <input type="datetime-local" value={toLocalInput(v.ends_at)} onChange={(e) => setV({ ...v, ends_at: fromLocalInput(e.target.value) })} className={FIELD} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Which notice board">
          <select value={v.map_key} onChange={(e) => setV({ ...v, map_key: e.target.value as EventMap })} className={FIELD}>
            {EVENT_MAPS.map((m) => <option key={m} value={m}>{EVENT_MAP_LABEL[m]}</option>)}
          </select>
        </Field>
        <Field label="Place (optional)" hint="Shown to players.">
          <input value={v.place ?? ''} maxLength={80} onChange={(e) => setV({ ...v, place: e.target.value })} placeholder="Campus 1 · quiz deck" className={FIELD} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={v.status === 'active'} onChange={(e) => setV({ ...v, status: e.target.checked ? 'active' : 'hidden' })} className="h-4 w-4 accent-slate-900" /> Show on the board
      </label>
      <div className="rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-500 dark:bg-slate-950/50">
        On the board: <b className="text-slate-800 dark:text-slate-100">{v.title || 'Title'}</b> · {when(v.starts_at)}{v.place ? ` · ${v.place}` : ''}
      </div>
      {problem ? <div className="text-xs font-bold text-rose-600">{problem}</div> : null}
      <ErrorBox message={error} />
    </Modal>
  );
}

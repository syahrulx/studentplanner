import { useEffect, useState } from 'react';
import { listUniversities, type UniversityRow } from '../lib/api';
import { createAdminPost, listCampusNames, type AdminPostInput } from '../lib/adminPosts';
import { BTN_DARK, BTN_LIGHT, FIELD } from './studyWorld/format';
import { ErrorBox, Field, Modal } from './studyWorld/ui';

const EMPTY: AdminPostInput = {
  type: 'event',
  title: '',
  body: '',
  universityId: null,
  campus: null,
  eventDate: null,
  eventTime: null,
  location: null,
  expiresAt: null,
  pinned: false,
};

/** Post an Event or Memo to the app's Community as "Admin Rencana". */
export function AdminPostComposer({ onClose, onPosted }: { onClose: () => void; onPosted: () => Promise<void> | void }) {
  const [v, setV] = useState<AdminPostInput>(EMPTY);
  const [universities, setUniversities] = useState<UniversityRow[]>([]);
  const [campuses, setCampuses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    listUniversities().then(setUniversities).catch(() => setUniversities([]));
  }, []);
  useEffect(() => {
    if (!v.universityId) {
      setCampuses([]);
      return;
    }
    listCampusNames(v.universityId).then(setCampuses).catch(() => setCampuses([]));
  }, [v.universityId]);

  const set = <K extends keyof AdminPostInput>(k: K, value: AdminPostInput[K]) => {
    setConfirming(false);
    setV((old) => ({ ...old, [k]: value }));
  };
  const uniName = universities.find((u) => u.id === v.universityId)?.name;
  const audience = !v.universityId ? 'Everyone in the app' : v.campus ? `${uniName ?? v.universityId} · ${v.campus}` : `Everyone at ${uniName ?? v.universityId}`;
  const problem =
    v.title.trim().length < 3 ? 'Give it a title (at least 3 characters).'
    : v.type === 'event' && !v.eventDate ? 'Pick the event date.'
    : null;

  async function post() {
    if (problem) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await createAdminPost({
        ...v,
        title: v.title.trim(),
        body: v.body.trim(),
        campus: v.campus?.trim() || null,
        eventTime: v.eventTime?.trim() || null,
        location: v.location?.trim() || null,
      });
      await onPosted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New post as Admin Rencana"
      onClose={onClose}
      footer={<>
        <button type="button" className={BTN_LIGHT} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={confirming ? `${BTN_DARK} bg-rose-600 hover:bg-rose-700` : BTN_DARK} onClick={() => void post()} disabled={busy || !!problem}>
          {busy ? 'Posting…' : confirming ? `Yes, post to ${!v.universityId ? 'everyone' : 'them'}` : 'Post'}
        </button>
      </>}
    >
      <div className="grid grid-cols-2 gap-2">
        {(['event', 'memo'] as const).map((t) => (
          <button key={t} type="button" onClick={() => set('type', t)}
            className={`rounded-2xl border-2 p-3 text-left text-sm font-black ${v.type === t ? 'border-brand-600 bg-brand-50 text-slate-900 dark:bg-brand-900/40 dark:text-white' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>
            {t === 'event' ? '📅 Event' : '📌 Memo'}
            <div className="mt-0.5 text-[11px] font-semibold text-slate-500">{t === 'event' ? 'Something on a date' : 'A notice or announcement'}</div>
          </button>
        ))}
      </div>

      <Field label="Title"><input value={v.title} maxLength={120} onChange={(e) => set('title', e.target.value)} className={FIELD} /></Field>
      <Field label="Details (optional)">
        <textarea value={v.body} rows={4} maxLength={2000} onChange={(e) => set('body', e.target.value)} className={`${FIELD} h-auto py-2 font-normal`} />
      </Field>

      {v.type === 'event' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" value={v.eventDate ?? ''} onChange={(e) => set('eventDate', e.target.value || null)} className={FIELD} /></Field>
          <Field label="Time (optional)"><input value={v.eventTime ?? ''} maxLength={40} placeholder="8:00 PM" onChange={(e) => set('eventTime', e.target.value)} className={FIELD} /></Field>
          <div className="col-span-2"><Field label="Place (optional)"><input value={v.location ?? ''} maxLength={120} placeholder="Dewan Besar" onChange={(e) => set('location', e.target.value)} className={FIELD} /></Field></div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Who sees it">
          <select value={v.universityId ?? ''} onChange={(e) => { set('universityId', e.target.value || null); set('campus', null); }} className={FIELD}>
            <option value="">Everyone (all universities)</option>
            {universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Campus (optional)" hint={v.universityId ? 'Leave empty for the whole university.' : 'Pick a university first.'}>
          <input value={v.campus ?? ''} disabled={!v.universityId} list="admin-post-campuses" onChange={(e) => set('campus', e.target.value)} className={FIELD} />
          <datalist id="admin-post-campuses">{campuses.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Hide after (optional)" hint="Taken down automatically then.">
          <input type="date" value={v.expiresAt ? v.expiresAt.slice(0, 10) : ''} onChange={(e) => set('expiresAt', e.target.value ? new Date(`${e.target.value}T23:59:00`).toISOString() : null)} className={FIELD} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={v.pinned} onChange={(e) => set('pinned', e.target.checked)} className="h-4 w-4 accent-slate-900" /> Pin to the top
        </label>
      </div>

      <div className="rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">In the app</div>
        <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{v.title || 'Title'}</div>
        <div>by <b>Admin Rencana</b> · {v.type === 'event' ? 'Event' : 'Memo'}{v.eventDate ? ` · ${v.eventDate}` : ''}{v.eventTime ? ` ${v.eventTime}` : ''}{v.location ? ` · ${v.location}` : ''}</div>
        <div className="mt-1">Shown to: {audience}. No notification is sent; students see it in Community.</div>
      </div>
      {confirming ? <div className="text-xs font-bold text-rose-600">Press again to post. It goes live straight away.</div> : null}
      {problem ? <div className="text-xs font-bold text-rose-600">{problem}</div> : null}
      <ErrorBox message={error} />
    </Modal>
  );
}

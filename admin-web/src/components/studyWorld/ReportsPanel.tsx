import { useCallback, useEffect, useState } from 'react';
import {
  REPORT_REASON_LABEL,
  banWorldPlayer,
  listWorldReports,
  updateWorldReport,
  type ReportStatus,
  type WorldReport,
} from '../../lib/studyWorld';
import { PlayerDrawer } from './PlayersPanel';
import { BTN_DANGER, BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { ErrorBox, Field, Modal } from './ui';

const STATUS_STYLE: Record<ReportStatus, string> = {
  open: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  reviewing: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  actioned: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  dismissed: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

/** Reports players send from Study World, and what was done about them. */
export function ReportsPanel() {
  const [filter, setFilter] = useState<ReportStatus | 'open' | 'all'>('open');
  const [rows, setRows] = useState<WorldReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<WorldReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listWorldReports(filter));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4 p-4">
      <ErrorBox message={error} />
      <div className={`${CARD} flex flex-wrap items-center gap-2 p-3`}>
        {(['open', 'actioned', 'dismissed', 'all'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`rounded-xl px-3 py-1.5 text-xs font-black ${filter === f ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            {f === 'open' ? 'To do' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-xs font-bold text-slate-400">{rows.length} report(s)</span>
      </div>

      <div className="space-y-3">
        {loading ? <div className={`${CARD} p-8 text-center text-sm font-semibold text-slate-400`}>Loading…</div>
          : rows.length === 0 ? <div className={`${CARD} p-8 text-center text-sm font-semibold text-slate-400`}>No reports here.</div>
          : rows.map((r) => (
            <button key={r.id} type="button" onClick={() => setOpen(r)} className={`${CARD} block w-full p-4 text-left transition hover:border-slate-300`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                <span className="text-sm font-black text-slate-900 dark:text-white">{REPORT_REASON_LABEL[r.reason] ?? r.reason}</span>
                <span className="text-sm font-semibold text-slate-500">against <b>{r.reported_nickname || 'unknown'}</b></span>
                <span className="ml-auto text-xs font-semibold text-slate-400">{when(r.created_at)}</span>
              </div>
              {r.details ? <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{r.details}</p> : null}
              <div className="mt-2 text-[11px] font-semibold text-slate-400">
                From {r.reporter_nickname || r.reporter_email || 'deleted account'}{r.map_key ? ` · ${r.map_key}` : ''}{r.room ? ` · ${r.room}` : ''}
                {' · '}{r.nickname_matches.length} matching account(s)
              </div>
            </button>
          ))}
      </div>

      {open ? <ReportDialog report={open} onClose={() => setOpen(null)} onDone={async () => { setOpen(null); await load(); }} /> : null}
    </div>
  );
}

function ReportDialog({ report, onClose, onDone }: { report: WorldReport; onClose: () => void; onDone: () => Promise<void> }) {
  const [note, setNote] = useState(report.admin_note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banUser, setBanUser] = useState<string>(report.nickname_matches.length === 1 ? report.nickname_matches[0].user_id : '');
  const [banDays, setBanDays] = useState('7');
  const [typed, setTyped] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);

  async function setStatus(status: ReportStatus) {
    setBusy(true);
    try {
      await updateWorldReport(report.id, status, note.trim());
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update report.');
    } finally {
      setBusy(false);
    }
  }

  async function banAndClose() {
    if (!banUser || typed.trim() !== 'BAN') return;
    setBusy(true);
    try {
      const reason = note.trim() || `RenTaman report: ${REPORT_REASON_LABEL[report.reason] ?? report.reason}`;
      await banWorldPlayer(banUser, reason, banDays === 'forever' ? null : Number(banDays));
      await updateWorldReport(report.id, 'actioned', note.trim() || 'Banned');
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not ban.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${REPORT_REASON_LABEL[report.reason] ?? report.reason} — ${report.reported_nickname || 'unknown player'}`}
      onClose={onClose}
      footer={<>
        <button type="button" className={BTN_LIGHT} disabled={busy} onClick={() => void setStatus('dismissed')}>Dismiss</button>
        <button type="button" className={BTN_LIGHT} disabled={busy} onClick={() => void setStatus('reviewing')}>Mark reviewing</button>
        <button type="button" className={BTN_DARK} disabled={busy} onClick={() => void setStatus('actioned')}>Mark handled</button>
      </>}
    >
      <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/50">
        <div><dt className="text-[10px] font-black uppercase text-slate-500">Sent</dt><dd className="font-semibold">{when(report.created_at)}</dd></div>
        <div><dt className="text-[10px] font-black uppercase text-slate-500">Where</dt><dd className="font-semibold">{[report.map_key, report.room].filter(Boolean).join(' · ') || '—'}</dd></div>
        <div className="col-span-2"><dt className="text-[10px] font-black uppercase text-slate-500">From</dt><dd className="font-semibold">{report.reporter_nickname || '—'} <span className="text-slate-400">{report.reporter_email}</span></dd></div>
        <div className="col-span-2"><dt className="text-[10px] font-black uppercase text-slate-500">What they said</dt><dd className="whitespace-pre-wrap font-semibold">{report.details || '—'}</dd></div>
      </dl>

      <div>
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Accounts using the nickname “{report.reported_nickname}”</div>
        <p className="mt-1 text-xs font-semibold text-slate-500">Nicknames are not unique and can change, so check before you ban.</p>
        <div className="mt-2 space-y-1">
          {report.nickname_matches.length === 0 ? <div className="text-sm font-semibold text-slate-400">No current match. They may have changed their nickname.</div>
            : report.nickname_matches.map((m) => (
              <label key={m.user_id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2 text-sm dark:border-slate-800">
                <input type="radio" name="ban-target" checked={banUser === m.user_id} onChange={() => setBanUser(m.user_id)} />
                <b>{m.nickname}</b><span className="text-slate-500">{m.name || ''}</span><span className="text-xs text-slate-400">{m.email || m.user_id}</span>
                <button type="button" className={`${BTN_LIGHT} ml-auto h-7`} onClick={(e) => { e.preventDefault(); setViewing(m.user_id); }}>View</button>
              </label>
            ))}
        </div>
      </div>

      <Field label="Admin note (saved with the report)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className={`${FIELD} h-auto py-2`} />
      </Field>

      {report.nickname_matches.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-rose-200 p-3 dark:border-rose-900/50">
          <div className="text-xs font-black uppercase text-rose-700 dark:text-rose-300">Ban the selected account and close this report</div>
          <div className="flex flex-wrap items-end gap-2">
            <select value={banDays} onChange={(e) => setBanDays(e.target.value)} className={`${FIELD} w-36`}>
              <option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="forever">Until lifted</option>
            </select>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type BAN" className={`${FIELD} w-28 font-mono`} />
            <button type="button" className={BTN_DANGER} disabled={busy || !banUser || typed.trim() !== 'BAN'} onClick={() => void banAndClose()}>Ban</button>
          </div>
          <p className="text-[11px] font-semibold text-slate-500">The note above is used as the ban reason the player sees. Leave it empty to use the report reason.</p>
        </div>
      ) : null}
      <ErrorBox message={error} />
      {viewing ? <PlayerDrawer userId={viewing} onClose={() => setViewing(null)} /> : null}
    </Modal>
  );
}

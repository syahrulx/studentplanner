/* eslint-disable react-refresh/only-export-components -- the exported hook owns its private portal component */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SafeActionResult {
  affected?: number;
  failed?: number;
  auditId?: string;
  message?: string;
}

export interface SafeActionRequest {
  title: string;
  operation: string;
  affectedCount: number;
  subject?: string;
  warning?: string;
  confirmationText?: string;
  requireReason?: boolean;
  irreversible?: boolean;
  onConfirm: (reason: string) => Promise<SafeActionResult | void>;
}

// Hook and its private dialog intentionally live together so each route needs
// only one import and cannot forget to render the safety surface.
export function useSafeActionDialog() {
  const [request, setRequest] = useState<SafeActionRequest | null>(null);
  return {
    requestSafeAction: setRequest,
    safeActionDialog: request ? <SafeActionDialog request={request} onClose={() => setRequest(null)} /> : null,
  };
}

function SafeActionDialog({ request, onClose }: { request: SafeActionRequest; onClose: () => void }) {
  const expected = request.confirmationText ?? (request.affectedCount > 1 ? `CONFIRM ${request.affectedCount}` : 'CONFIRM');
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SafeActionResult | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [busy, onClose]);

  const canConfirm = typed.trim() === expected && (!request.requireReason || reason.trim().length >= 5);
  const run = async () => {
    if (!canConfirm || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await request.onConfirm(reason.trim());
      setResult(response ?? { affected: request.affectedCount, failed: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The operation failed. No success was assumed.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <div className="text-lg font-black text-slate-950 dark:text-white">{request.title}</div>
          <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Review the exact scope before continuing.</div>
        </div>
        <div className="space-y-4 p-6">
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/50">
            <div><dt className="text-[10px] font-black uppercase text-slate-500">Operation</dt><dd className="mt-1 font-black text-slate-900 dark:text-white">{request.operation}</dd></div>
            <div><dt className="text-[10px] font-black uppercase text-slate-500">Affected records</dt><dd className="mt-1 font-black text-slate-900 dark:text-white">{request.affectedCount.toLocaleString()}</dd></div>
            {request.subject ? <div className="col-span-2"><dt className="text-[10px] font-black uppercase text-slate-500">Target</dt><dd className="mt-1 break-all font-semibold text-slate-900 dark:text-white">{request.subject}</dd></div> : null}
          </dl>

          <div className={`rounded-2xl border p-4 text-sm font-semibold ${request.irreversible ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100'}`}>
            {request.warning ?? (request.irreversible ? 'This operation cannot be undone.' : 'Review the target carefully before continuing.')}
            <div className="mt-1 text-xs opacity-80">Audit logging: this server-side action will record the acting admin and result.</div>
          </div>

          {request.requireReason ? (
            <label className="block"><span className="text-xs font-black uppercase text-slate-600 dark:text-slate-300">Reason (required)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} placeholder="Explain why this action is necessary…" className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
          ) : null}

          <label className="block"><span className="text-xs font-black uppercase text-slate-600 dark:text-slate-300">Type {expected} to confirm</span><input value={typed} onChange={(event) => setTyped(event.target.value)} autoCapitalize="characters" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 font-mono text-sm font-black text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>

          {busy ? <div className="rounded-2xl border border-brand-200 bg-brand-50 p-3 text-sm font-bold text-brand-800 dark:border-brand-900/50 dark:bg-brand-950/40 dark:text-brand-100">Operation in progress… Do not close this window.</div> : null}
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">{error}</div> : null}
          {result ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">Completed: {result.affected ?? request.affectedCount} succeeded{result.failed ? `, ${result.failed} failed` : ''}.{result.message ? ` ${result.message}` : ''}{result.auditId ? ` Audit: ${result.auditId}` : ''}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/50">
          <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white">{result ? 'Close' : 'Cancel'}</button>
          {!result ? <button type="button" disabled={!canConfirm || busy} onClick={() => void run()} className="h-10 rounded-xl bg-rose-600 px-4 text-xs font-black text-white disabled:opacity-40">{busy ? 'Working…' : request.operation}</button> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

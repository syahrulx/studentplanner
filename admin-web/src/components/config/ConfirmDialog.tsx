import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../ui/Button';

/**
 * A plain "are you sure?" window, drawn into document.body so it is never
 * trapped by the admin layout's CSS transforms. It only asks; the caller
 * decides what happens on confirm (no typed confirmation, on purpose: it
 * replaces simple confirm windows one for one).
 */
export function ConfirmDialog({ title, children, confirmLabel, busyLabel, busy, onConfirm, onCancel }: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [busy, onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-black text-slate-900 dark:text-white">{title}</h2>
        {children ? <div className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">{children}</div> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel ?? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

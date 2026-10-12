import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ItemStatus } from '../../lib/studyWorld';
import { CARD, FIELD, STATUS_LABEL } from './format';


export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
      {message}
    </div>
  );
}

export function DemoNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
      <span className="mr-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-950">Demo</span>
      {children}
    </div>
  );
}

const STATUS_STYLE: Record<ItemStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  coming_soon: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  hidden: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusSelect({ value, onChange, disabled }: { value: ItemStatus; onChange: (s: ItemStatus) => void; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as ItemStatus)} className={`${FIELD} h-8 w-auto text-xs`}>
      <option value="available">Available</option>
      <option value="coming_soon">Coming soon</option>
      <option value="hidden">Hidden</option>
    </select>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'amber' | 'rose' }) {
  const colour =
    tone === 'rose' && Number(value) > 0
      ? 'text-rose-600 dark:text-rose-400'
      : tone === 'amber' && Number(value) > 0
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-900 dark:text-white';
  return (
    <div className={`${CARD} p-5`}>
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-2 text-3xl font-black leading-none ${colour}`}>{value}</div>
      {hint ? <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <span>
        <span className="block text-sm font-black text-slate-900 dark:text-white">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">{hint}</span> : null}
      </span>
      <input type="checkbox" className="mt-1 h-5 w-5 accent-slate-900" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/**
 * A modal shell for edit forms (not for risky actions — those use SafeActionDialog).
 * Drawn into document.body: the admin layout animates its content with
 * transforms, which would otherwise trap a fixed overlay inside the page.
 */
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-sw-modal=""
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="text-base font-black text-slate-950 dark:text-white">{title}</div>
          <button type="button" onClick={onClose} className="text-sm font-black text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
        </div>
        <div className="space-y-4 overflow-y-auto p-6">{children}</div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/50">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

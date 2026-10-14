import type { ReactNode } from 'react';
import { Notice } from '../../ui/page';
import { cn } from '../../ui/cn';

/**
 * Small layout pieces shared by the Academic calendars pages (official
 * calendars, existing offers, community submissions). Display only: no data
 * logic lives here.
 */

/** A labelled form field (label text above the control). */
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

/** Strip a leading tick emoji from success text (the green box already says it worked). */
function plain(text: string): string {
  return text.replace(/^✅\s*/u, '');
}

/** One auto-fill source (web page, PDF or image) inside the auto-fill panel. */
export function SourceCard({ title, help, err, ok, children }: {
  title: string;
  help: ReactNode;
  err?: string;
  ok?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/40">
      <div>
        <div className="text-sm font-black text-slate-900 dark:text-slate-100">{title}</div>
        <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{help}</p>
      </div>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {ok ? <Notice tone="success">{plain(ok)}</Notice> : null}
      <div className="mt-auto flex flex-col gap-2">{children}</div>
    </div>
  );
}

/** Small spinner used inside busy buttons. */
export function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />;
}

/** A coloured clean-up strip (old calendars, duplicate copies). */
export function CleanupBox({ tone, title, children, action }: {
  tone: 'warning' | 'danger';
  title: ReactNode;
  children?: ReactNode;
  action: ReactNode;
}) {
  const box = tone === 'warning'
    ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100'
    : 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100';
  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between', box)}>
      <div className="min-w-0 text-sm font-bold">
        <div>{title}</div>
        {children ? <div className="mt-1 text-xs font-semibold opacity-90">{children}</div> : null}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

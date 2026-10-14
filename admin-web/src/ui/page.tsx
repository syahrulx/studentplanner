import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { CHIP_TONE, NOTICE_TONE, STAT_VALUE_TONE, type Tone } from './tones';

/**
 * Admin design kit. Every page builds from these so the whole admin looks and
 * behaves the same, and nothing is said twice:
 *
 *   PageHeader   one title + one-line description + actions (once per page)
 *   Panel        a white section card, with an optional small heading
 *   StatStrip    one row of numbers; a StatItem with onClick acts as a filter
 *   PillGroup    filter buttons (with optional counts)
 *   Chip         small coloured label
 *   Notice       info / warning / error box
 *   EmptyState   friendly "nothing here" with an optional action
 *   SkeletonRows grey placeholders while loading
 *   SidePanel    right-side detail panel (portal, scroll lock, Esc)
 *
 * Inside AdminSectionTabs, PageHeader drops its title and description (the
 * tab shell already shows them) and keeps only its actions.
 */

const EmbeddedContext = createContext(false);
/** Wrap a page shown inside a tab shell: its PageHeader then skips the title. */
export function EmbeddedPage({ children }: { children: ReactNode }) {
  return <EmbeddedContext.Provider value>{children}</EmbeddedContext.Provider>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  const embedded = useContext(EmbeddedContext);
  if (embedded) {
    return actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null;
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({ title, description, actions, children, className, padded = true }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn('rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900', className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-black text-slate-900 dark:text-white">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? 'p-5' : undefined}>{children}</div>
    </section>
  );
}

export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">{children}</div>;
}

export function StatItem({ label, value, hint, tone = 'neutral', active, onClick }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className={cn('text-2xl font-black leading-none tabular-nums', STAT_VALUE_TONE[tone])}>{value}</div>
      <div className="mt-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      {hint ? <div className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-500">{hint}</div> : null}
    </>
  );
  const base = 'rounded-2xl border bg-white px-4 py-3 text-left dark:bg-slate-900';
  const ring = active ? 'border-slate-900 ring-1 ring-slate-900 dark:border-white dark:ring-white' : 'border-slate-200 dark:border-slate-800';
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(base, ring, 'transition hover:border-slate-300 dark:hover:border-slate-600')}>{body}</button>
  ) : (
    <div className={cn(base, ring)}>{body}</div>
  );
}

export function PillGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label ? <span className="mr-1 text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</span> : null}
      {children}
    </div>
  );
}

export function Pill({ active, count, alert, onClick, children, title }: {
  active?: boolean;
  count?: number | null;
  /** Show the count in red (things waiting). */
  alert?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-black transition',
        active
          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
      )}
    >
      {children}
      {count != null ? (
        <span className={cn(
          'rounded-full px-1.5 text-[10px] leading-4',
          alert && count > 0 ? 'bg-rose-600 text-white' : active ? 'bg-white/20 dark:bg-slate-900/10' : 'bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400',
        )}>
          {count > 999 ? '999+' : count}
        </span>
      ) : null}
    </button>
  );
}

export function Chip({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold', CHIP_TONE[tone])}>{children}</span>;
}

export function Notice({ tone = 'info', title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border px-4 py-3 text-sm font-semibold', NOTICE_TONE[tone], className)} role={tone === 'danger' ? 'alert' : undefined}>
      {title ? <div className="font-black">{title}</div> : null}
      {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
      <div className="text-sm font-black text-slate-700 dark:text-slate-200">{title}</div>
      {children ? <div className="mx-auto mt-1 max-w-md text-xs font-semibold text-slate-500 dark:text-slate-400">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 3, height = 'h-20' }: { rows?: number; height?: string }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn('animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60', height)} />
      ))}
    </div>
  );
}

/**
 * Right-side detail panel. Drawn into document.body: the admin layout animates
 * pages with CSS transforms, which would trap a position: fixed overlay inside
 * the page (it would open further down and need scrolling).
 */
export function SidePanel({ title, subtitle, chips, onClose, children, footer, width = 'max-w-2xl' }: {
  title: ReactNode;
  subtitle?: ReactNode;
  chips?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      // A confirm window on top handles its own Esc.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[140] flex justify-end bg-slate-950/50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={cn('flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900', width)} role="dialog" aria-label={typeof title === 'string' ? title : 'Details'}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="min-w-0">
            {chips ? <div className="mb-1.5 flex flex-wrap gap-1.5">{chips}</div> : null}
            <div className="text-lg font-black text-slate-950 dark:text-white">{title}</div>
            {subtitle ? <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-black text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Close">✕</button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3 dark:border-slate-800 dark:bg-slate-950/50">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}

/** Key/value grid used inside detail panels. */
export function FactGrid({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-2xl border border-slate-200 p-4 text-sm sm:grid-cols-2 dark:border-slate-800">
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{k}</dt>
          <dd className="mt-0.5 break-words font-semibold text-slate-800 dark:text-slate-100">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

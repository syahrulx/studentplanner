import type { ReactNode } from 'react';
import { TextInput } from '../../ui/Input';
import { cn } from '../../ui/cn';

/**
 * Small layout pieces shared by the Institutions tabs (universities, campuses,
 * organisations). Layout only: no data loading or saving lives here.
 */

/** Search box + filter pills + "N shown" line at the top of a list. */
export function ListToolbar({
  query,
  onQuery,
  placeholder,
  searchLabel,
  shown,
  busy,
  topSearchActive,
  children,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  searchLabel: string;
  shown: number;
  busy: boolean;
  topSearchActive: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center dark:border-slate-800">
      <div className="w-full md:max-w-sm">
        <TextInput
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={searchLabel}
          className="h-10"
        />
      </div>
      {children}
      <div className="text-xs font-bold text-slate-500 md:ml-auto dark:text-slate-400">
        {busy ? 'Loading…' : `${shown} shown`}
        {topSearchActive ? <span className="ml-2 text-brand-600 dark:text-brand-400">Filtered by the top search bar</span> : null}
      </div>
    </div>
  );
}

/** One record in a list: click the row (or Edit) to open it; actions on the right. */
export function RecordRow({
  onOpen,
  title,
  meta,
  chips,
  actions,
  className,
}: {
  onOpen: () => void;
  title: ReactNode;
  meta?: ReactNode;
  chips?: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={cn(
        'flex cursor-pointer flex-col gap-2 px-5 py-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-slate-800/40',
        className,
      )}
      onClick={onOpen}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{title}</span>
          {chips}
        </div>
        {meta ? <div className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{meta}</div> : null}
      </div>
      <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
        {actions}
      </div>
    </li>
  );
}

/** A labelled form field (label wraps the control so clicks focus it). */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

/** A titled block inside a side panel (no extra box, just a divider). */
export function PanelSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-slate-200 pt-5 first:border-t-0 first:pt-0 dark:border-slate-800">
      <div>
        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">{title}</h3>
        {description ? <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

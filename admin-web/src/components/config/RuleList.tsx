import type { ReactNode } from 'react';
import { cn } from '../../ui/cn';

/**
 * Compact label/value list for fixed rules and settings (not live numbers,
 * which use StatStrip). Same text styles as the kit's FactGrid, without its
 * border, so it can sit inside a Panel without a box inside a box.
 */
export function RuleList({ items, columns = 4 }: { items: [ReactNode, ReactNode][]; columns?: 2 | 3 | 4 | 5 }) {
  const cols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-3 lg:grid-cols-5',
  }[columns];
  return (
    <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-3 text-sm', cols)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words font-bold text-slate-900 dark:text-slate-100">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Small grey footnote under a section. */
export function Footnote({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">{children}</p>;
}


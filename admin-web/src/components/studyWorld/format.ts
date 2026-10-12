import type { ItemStatus } from '../../lib/studyWorld';

export const CARD = 'rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900';
export const FIELD =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white';
export const BTN =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-black transition disabled:opacity-40';
export const BTN_DARK = `${BTN} bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950`;
export const BTN_LIGHT = `${BTN} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100`;
export const BTN_DANGER = `${BTN} bg-rose-600 text-white hover:bg-rose-700`;

export function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  available: 'Available',
  coming_soon: 'Coming soon',
  hidden: 'Hidden',
};


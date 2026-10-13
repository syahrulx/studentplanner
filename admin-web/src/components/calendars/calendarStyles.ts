import { cn } from '../../ui/cn';

/** Small text buttons. `cn` only joins classes, so colours live here, not as overrides. */
export const BTN_SM = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40';
export const BTN_DANGER = cn(BTN_SM, 'bg-rose-600 text-white hover:bg-rose-700');
export const BTN_DANGER_SOFT = cn(BTN_SM, 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/40');
export const BTN_APPROVE = cn(BTN_SM, 'bg-emerald-600 text-white hover:bg-emerald-700');
export const BTN_SECONDARY = cn(BTN_SM, 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800');
export const LINK_SM = 'text-xs font-black text-brand-700 underline-offset-2 hover:underline dark:text-brand-300';
export const CHECKBOX = 'h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-600 disabled:cursor-not-allowed dark:border-slate-600';

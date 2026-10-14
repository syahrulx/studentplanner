/**
 * Shared colour sets for the admin design kit (ui/page.tsx). Every class has a
 * dark-mode twin. The brand palette only defines brand-50..900 (no 950).
 */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

export const CHIP_TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  brand: 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  danger: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
};

export const NOTICE_TONE: Record<Tone, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200',
  brand: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100',
  warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100',
  danger: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100',
  info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100',
  violet: 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-100',
};

export const STAT_VALUE_TONE: Record<Tone, string> = {
  neutral: 'text-slate-900 dark:text-white',
  brand: 'text-brand-700 dark:text-brand-300',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-rose-700 dark:text-rose-300',
  info: 'text-sky-700 dark:text-sky-300',
  violet: 'text-violet-700 dark:text-violet-300',
};

import type { AdminServiceRow } from '../../lib/api';

export const STATUS_COLORS: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  claimed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  completed: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export const KIND_COLORS: Record<string, string> = {
  request: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  offer: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
};

export const CATEGORIES = ['all', 'tutoring', 'printing', 'transport', 'food', 'errands', 'tech', 'design', 'other'];

/** Neutral chip used for meta info (price, people, place, date). */
export const META_CHIP =
  'inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300';

export function fmt(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtPrice(s: AdminServiceRow) {
  if (s.price_type === 'free') return 'Free';
  const amt = s.accepted_amount ?? s.price_amount;
  if (amt == null) return 'Negotiable';
  return `${s.currency || 'MYR'} ${Number(amt).toLocaleString()}`;
}

export function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** True while the job can still be stepped in on (force cancel / complete / reopen). */
export function isActive(s: AdminServiceRow) {
  return s.service_status !== 'completed' && s.service_status !== 'cancelled';
}

export type ServiceAction = 'cancel' | 'complete' | 'reopen' | 'delete' | 'clearReports';

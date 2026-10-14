import type { AdminServiceRow } from '../../lib/api';
import type { Tone } from '../../ui/tones';

/** Chip tone (kit Chip) for each service status and kind. */
export const STATUS_TONE: Record<string, Tone> = {
  open: 'success',
  claimed: 'warning',
  submitted: 'brand',
  completed: 'info',
  cancelled: 'neutral',
};

export const KIND_TONE: Record<string, Tone> = {
  request: 'violet',
  offer: 'info',
};

export const CATEGORIES = ['all', 'tutoring', 'printing', 'transport', 'food', 'errands', 'tech', 'design', 'other'];

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

import type { AdminUserRow } from '../../lib/api';
import type { Tone } from '../../ui/tones';

/** Shared text formatting for the Users, Subscriptions and Share rewards pages. */

export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function formatJoinDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCountry(code: string | null | undefined): string {
  const normalized = code?.trim().toUpperCase();
  if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized) || normalized;
  } catch {
    return normalized === 'MY' ? 'Malaysia' : normalized;
  }
}

export function formatBillingStatus(status: AdminUserRow['subscription_status']): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function billingTone(status: AdminUserRow['subscription_status']): Tone {
  if (status === 'active' || status === 'prepaid') return 'success';
  if (status === 'trial' || status === 'introductory' || status === 'promotional' || status === 'temporary') return 'warning';
  if (status === 'expired' || status === 'refunded' || status === 'billing_issue') return 'danger';
  return 'neutral';
}

export function accountStatusTone(status: AdminUserRow['status']): Tone {
  return status === 'active' ? 'success' : status === 'disabled' ? 'warning' : 'danger';
}

export function planTone(plan: AdminUserRow['subscription_plan']): Tone {
  return plan === 'free' ? 'neutral' : plan === 'plus' ? 'info' : 'violet';
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

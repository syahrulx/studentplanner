import type { AdminUserReportRow, SupportWorkflowState, UserReportKind, UserReportStatus } from '../../lib/api';
import type { Tone } from '../../ui/tones';

export const KIND_LABEL: Record<UserReportKind, string> = {
  bug: 'Bug / crash',
  issue: 'Something broken',
  faq: 'Question / FAQ',
  app_complaint: 'App complaint',
  user_complaint: 'User complaint',
  semester_calendar: 'Semester / calendar',
  campus_request: 'Campus request',
  grading: 'Grading',
  widget: 'Home-screen widget',
  other: 'Other',
};

export const KIND_TONE: Record<UserReportKind, Tone> = {
  bug: 'danger',
  issue: 'warning',
  faq: 'info',
  app_complaint: 'violet',
  user_complaint: 'brand',
  semester_calendar: 'info',
  campus_request: 'info',
  grading: 'violet',
  widget: 'neutral',
  other: 'neutral',
};

export const STATUS_LABEL: Record<UserReportStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export const STATUS_TONE: Record<UserReportStatus, Tone> = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  dismissed: 'neutral',
};

export const WORKFLOW_LABEL: Record<SupportWorkflowState, string> = {
  new: 'New', assigned: 'Assigned', in_progress: 'In progress', waiting_user: 'Waiting for user',
  waiting_engineering: 'Waiting for engineering', resolved: 'Resolved', closed: 'Closed',
};

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

export function shortId(id: string | null | undefined): string {
  if (!id) return '-';
  return id.slice(0, 8);
}

export function responseDuration(createdAt: string, respondedAt: string | null | undefined): string {
  if (!respondedAt) return 'Waiting for first response';
  const minutes = Math.max(0, Math.round((new Date(respondedAt).getTime() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hr`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

/** The user wrote after the last admin reply (or no admin has replied yet). */
export function hasNewUserReply(row: AdminUserReportRow): boolean {
  return !!row.last_user_reply_at && (!row.last_admin_reply_at || row.last_user_reply_at > row.last_admin_reply_at);
}

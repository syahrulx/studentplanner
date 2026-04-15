import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from './lib/supabase';

export type AttendanceStatus = 'present' | 'absent' | 'cancelled';

export const ATTENDANCE_CATEGORY_ID = 'attendance_checkin';
export const ATTENDANCE_ACTION_PRESENT = 'attendance_present';
export const ATTENDANCE_ACTION_ABSENT = 'attendance_absent';
export const ATTENDANCE_ACTION_CANCELLED = 'attendance_cancelled';

const KEY_PENDING_ATTENDANCE = 'pendingAttendanceEventsV1';

type PendingAttendanceEvent = {
  timetableEntryId: string;
  scheduledStartAt: string; // ISO
  status: AttendanceStatus;
  subjectCode: string;
  subjectName: string;
  recordedAt: string; // ISO
  source: 'notification' | 'in_app';
};

function normalizeStatusFromAction(actionId: string | undefined): AttendanceStatus | null {
  if (actionId === ATTENDANCE_ACTION_PRESENT) return 'present';
  if (actionId === ATTENDANCE_ACTION_ABSENT) return 'absent';
  if (actionId === ATTENDANCE_ACTION_CANCELLED) return 'cancelled';
  return null;
}

export async function ensureAttendanceCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(ATTENDANCE_CATEGORY_ID, [
    {
      identifier: ATTENDANCE_ACTION_PRESENT,
      buttonTitle: 'Present',
      options: { opensAppToForeground: false },
    },
    {
      identifier: ATTENDANCE_ACTION_ABSENT,
      buttonTitle: 'Absent',
      options: { opensAppToForeground: false },
    },
    {
      identifier: ATTENDANCE_ACTION_CANCELLED,
      buttonTitle: 'Class cancelled',
      options: { opensAppToForeground: false },
    },
  ]);
}

async function loadPending(): Promise<PendingAttendanceEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PENDING_ATTENDANCE);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as PendingAttendanceEvent[];
  } catch {
    return [];
  }
}

async function savePending(items: PendingAttendanceEvent[]): Promise<void> {
  try {
    if (items.length === 0) {
      await AsyncStorage.removeItem(KEY_PENDING_ATTENDANCE);
      return;
    }
    await AsyncStorage.setItem(KEY_PENDING_ATTENDANCE, JSON.stringify(items.slice(0, 200)));
  } catch {}
}

async function enqueuePending(ev: PendingAttendanceEvent): Promise<void> {
  const prev = await loadPending();
  const key = `${ev.timetableEntryId}|${ev.scheduledStartAt}`;
  const deduped = prev.filter((x) => `${x.timetableEntryId}|${x.scheduledStartAt}` !== key);
  deduped.unshift(ev);
  await savePending(deduped);
}

export async function recordAttendanceEvent(ev: Omit<PendingAttendanceEvent, 'recordedAt'> & { recordedAt?: string }): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  const recordedAt = (ev.recordedAt ?? new Date().toISOString()).trim();

  const row = {
    user_id: uid ?? '00000000-0000-0000-0000-000000000000',
    timetable_entry_id: String(ev.timetableEntryId || '').trim(),
    scheduled_start_at: String(ev.scheduledStartAt || '').trim(),
    status: ev.status,
    recorded_at: recordedAt,
    source: ev.source,
    subject_code: String(ev.subjectCode ?? '').trim(),
    subject_name: String(ev.subjectName ?? '').trim(),
  };

  // If not signed in (or any insert failure), persist locally and retry later.
  if (!uid) {
    await enqueuePending({ ...(ev as PendingAttendanceEvent), recordedAt });
    return;
  }

  const { error } = await supabase
    .from('class_attendance_events')
    .upsert(row, { onConflict: 'user_id,timetable_entry_id,scheduled_start_at' });

  if (error) {
    await enqueuePending({ ...(ev as PendingAttendanceEvent), recordedAt });
  }
}

export async function flushPendingAttendanceEvents(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return;

  const pending = await loadPending();
  if (pending.length === 0) return;

  // Try sequentially to avoid hammering on flaky mobile networks.
  const keep: PendingAttendanceEvent[] = [];
  for (const ev of pending) {
    try {
      await recordAttendanceEvent(ev);
    } catch {
      keep.push(ev);
    }
  }
  await savePending(keep);
}

export async function handleAttendanceNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<{ handled: boolean; defaultTapData?: Record<string, any> }> {
  const data = response.notification.request.content.data as Record<string, any> | undefined;
  if (!data || data.type !== 'attendance_checkin') return { handled: false };

  const status = normalizeStatusFromAction(response.actionIdentifier);
  if (!status) {
    // User tapped the notification body (default action) -> let the app navigate to an in-app picker.
    return { handled: true, defaultTapData: data };
  }

  await recordAttendanceEvent({
    timetableEntryId: String(data.timetableEntryId || '').trim(),
    scheduledStartAt: String(data.scheduledStartAt || '').trim(),
    status,
    subjectCode: String(data.subjectCode || '').trim(),
    subjectName: String(data.subjectName || '').trim(),
    source: 'notification',
  });

  return { handled: true };
}


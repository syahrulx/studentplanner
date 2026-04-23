import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { useTranslations } from '@/src/i18n';
import * as communityApi from '@/src/lib/communityApi';
import type { CircleInvitation, QuickReaction } from '@/src/lib/communityApi';
import { attendanceOccurrenceKey, getAnsweredOccurrenceSet, recordAttendanceEvent, type AttendanceStatus } from '@/src/attendanceRecording';
import AsyncStorage from '@react-native-async-storage/async-storage';

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, avatarUrl, size = 40 }: { name?: string; avatarUrl?: string; size?: number }) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const i = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[i], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{getInitials(name)}</Text>
    </View>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Title-case long ALL-CAPS names so the header row stays readable. */
function formatDisplayName(name?: string | null) {
  if (!name?.trim()) return 'Someone';
  const s = name.trim();
  if (s !== s.toUpperCase() || s.length < 8) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

type ReactionPreview = { lead: string; text: string };

function reactionPreviewLines(reaction: QuickReaction, isBump: boolean): ReactionPreview {
  if (isBump) return { lead: '💥', text: 'Bumped you!' };
  if (reaction.reaction_type === '📋') {
    return { lead: '📋', text: reaction.message || 'Shared a task with you!' };
  }
  if (reaction.reaction_type === '🎮') {
    return { lead: '🎮', text: reaction.message || 'Invited you to a quiz!' };
  }
  if (reaction.message) {
    const lead = reaction.reaction_type?.trim() || '';
    return { lead, text: reaction.message };
  }
  const emoji = reaction.reaction_type?.trim() || '✨';
  return { lead: emoji, text: 'Sent you' };
}

type AttendanceNotifItem = {
  id: string; // expo notification identifier
  timetableEntryId: string;
  scheduledStartAt: string; // ISO
  subjectCode: string;
  subjectName: string;
  subjectKey?: string;
  displaySubject?: string;
  bodyText?: string;
  fireAtMs?: number; // exact ms from scheduler payload (preferred for de-dupe)
  fireAtISO?: string; // when the notification will fire, if known
  kind: 'scheduled' | 'presented';
};

function parseMs(iso: string): number | null {
  const s = String(iso || '').trim();
  const t = Date.parse(s);
  if (Number.isFinite(t)) return t;
  // Legacy payloads sometimes stored local wall-time strings that Date.parse cannot reliably read.
  // Accept ISO-ish / slash variants and interpret them as local time.
  const m =
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/.exec(s) ||
    /^(\d{4})\/(\d{2})\/(\d{2})[T\s](\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const dt = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  return Number.isFinite(dt) ? dt : null;
}

function triggerFireMs(trigger: any): number | null {
  if (trigger == null) return null;
  // Expo can surface DATE triggers with different shapes across versions/platforms.
  if (trigger instanceof Date) {
    const t = trigger.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof trigger === 'number' && Number.isFinite(trigger)) return trigger;
  if (typeof trigger === 'string') {
    const n = Number(trigger);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(trigger);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof trigger === 'object') {
    const cand = (trigger as any).date ?? (trigger as any).value ?? (trigger as any).timestamp;
    if (cand instanceof Date) {
      const t = cand.getTime();
      return Number.isFinite(t) ? t : null;
    }
    if (typeof cand === 'number' && Number.isFinite(cand)) return cand;
    if (typeof cand === 'string') {
      const n = Number(cand);
      if (Number.isFinite(n)) return n;
      const t = Date.parse(cand);
      return Number.isFinite(t) ? t : null;
    }
  }
  return null;
}

function parseSubjectFromAttendanceBody(body: string): string {
  const s = String(body || '').trim();
  const m = /^Did you attend class\s+(.+?)\s+in\s+5\s+more\s+minutes/i.exec(s);
  if (!m?.[1]) return '';
  return m[1]
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonicalAttendanceSubject(
  it: Pick<AttendanceNotifItem, 'subjectCode' | 'subjectName' | 'bodyText' | 'displaySubject' | 'subjectKey'>,
): string {
  const fromBody = parseSubjectFromAttendanceBody(it.bodyText || '');
  if (fromBody) return fromBody;
  const disp = String(it.displaySubject || '').trim();
  if (disp) {
    const fromSynthetic = parseSubjectFromAttendanceBody(
      `Did you attend class "${disp}" in 5 more minutes?`,
    );
    if (fromSynthetic) return fromSynthetic;
  }
  const display = disp.toLowerCase();
  if (display) return display;
  const stored = String(it.subjectKey || '').trim().toLowerCase();
  if (stored) return stored;
  const name = String(it.subjectName || '').trim().toLowerCase();
  const code = String(it.subjectCode || '').trim().toLowerCase();
  return (name || code || 'class').trim();
}

/** Same 5-minute wall-clock slot as `attendanceNotifications` canon (duplicate rows share this). */
function classStartCanonSlotMs(iso: string): number | null {
  const t = parseMs(iso);
  if (t === null) return null;
  const w = 5 * 60_000;
  return Math.round(t / w) * w;
}

/**
 * Timezone-insensitive wall-time key extracted from the stored string when possible.
 * This collapses legacy duplicates where one payload saved `scheduledStartAt` as UTC and another as local.
 */
function classLooseWallMinuteKey(iso: string): string | null {
  const s = String(iso || '').trim();
  // Common ISO-ish forms: 2026-04-19T12:25:00.000Z / 2026-04-19T12:25:00+08:00
  const m =
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/.exec(s) ||
    /^(\d{4})\/(\d{2})\/(\d{2})[T\s](\d{2}):(\d{2})/.exec(s);
  if (m) return `${m[1]}-${Number(m[2])}-${Number(m[3])}_${Number(m[4])}_${Number(m[5])}`;
  return null;
}

/** Local calendar date + hour + minute — stable across duplicate rows / ISO quirks for the same class time. */
function classLocalWallMinuteKey(iso: string): string | null {
  const loose = classLooseWallMinuteKey(iso);
  if (loose !== null) return loose;
  const t = parseMs(iso);
  if (t === null) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}_${d.getHours()}_${d.getMinutes()}`;
}

function normalizedAttendanceBodyText(it: Pick<AttendanceNotifItem, 'bodyText' | 'displaySubject'>): string {
  const raw = String(it.bodyText || '')
    .trim()
    .toLowerCase()
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ');
  if (raw) return raw;
  const disp = String(it.displaySubject || '').trim();
  if (disp) {
    return `did you attend class "${disp.toLowerCase()}" in 5 more minutes?`.replace(/\s+/g, ' ');
  }
  return '';
}

function classStartMinuteKey(iso: string): string {
  const t = parseMs(iso);
  if (t === null) return String(iso || '').trim();
  const floored = Math.floor(t / 60_000) * 60_000;
  return new Date(floored).toISOString();
}

function attendanceUiDedupeKeyFromFields(
  scheduledStartAt: string,
  subjectCode: string,
  subjectName: string,
  bodyText?: string,
  subjectKey?: string,
  displaySubject?: string,
): string {
  const t = parseMs(scheduledStartAt);
  const isoNorm = t !== null ? new Date(t).toISOString() : String(scheduledStartAt || '').trim();
  return `${canonicalAttendanceSubject({ subjectCode, subjectName, bodyText, subjectKey, displaySubject })}|${classStartMinuteKey(isoNorm)}`;
}

/** Fire time from trigger, or class start − 5 min (same as schedule math) when trigger missing. */
function effectiveFireMs(it: AttendanceNotifItem): number | null {
  if (typeof it.fireAtMs === 'number' && Number.isFinite(it.fireAtMs)) return it.fireAtMs;
  const fromTrigger = parseMs(it.fireAtISO || '');
  if (fromTrigger !== null) return fromTrigger;
  const start = parseMs(it.scheduledStartAt);
  if (start !== null) return start - 5 * 60_000;
  return null;
}

/** 5-minute bucket so duplicate schedules / tray copies with slightly different timestamps still merge. */
function effectiveFireDedupeBucketMs(it: AttendanceNotifItem): number | null {
  const fm = effectiveFireMs(it);
  if (fm === null) return null;
  const w = 5 * 60_000;
  return Math.round(fm / w) * w;
}

/**
 * One UI row per reminder: same canonical label + same local class start (date + hour + minute).
 * Duplicate timetable rows / tray copies for the same session share this even if ISO strings differ slightly.
 */
function attendanceUiDedupeKey(it: AttendanceNotifItem): string {
  const subj = canonicalAttendanceSubject(it);
  const wall = classLocalWallMinuteKey(it.scheduledStartAt);
  if (wall !== null) return `${subj}|wall:${wall}`;
  const nb = normalizedAttendanceBodyText(it);
  const fm = effectiveFireMs(it);
  if (nb && fm !== null) {
    const w = 15 * 60_000;
    return `b:${nb}|f:${Math.round(fm / w) * w}`;
  }
  const slot = classStartCanonSlotMs(it.scheduledStartAt);
  if (slot !== null) return `${subj}|slot:${slot}`;
  const fireB = effectiveFireDedupeBucketMs(it);
  if (fireB !== null) return `${subj}|fire:${fireB}`;
  return attendanceUiDedupeKeyFromFields(
    it.scheduledStartAt,
    it.subjectCode,
    it.subjectName,
    it.bodyText,
    it.subjectKey,
    it.displaySubject,
  );
}

/** Same key as `attendanceUiDedupeKey` for a row built from Expo payload + optional trigger fire ISO. */
function attendanceUiDedupeKeyLoose(parts: {
  scheduledStartAt: string;
  subjectCode: string;
  subjectName: string;
  bodyText?: string;
  subjectKey?: string;
  displaySubject?: string;
  fireAtISO?: string;
}): string {
  const t = parseMs(parts.scheduledStartAt);
  const scheduledStartAt = t !== null ? new Date(t).toISOString() : String(parts.scheduledStartAt || '').trim();
  return attendanceUiDedupeKey({
    id: '',
    timetableEntryId: '',
    scheduledStartAt,
    subjectCode: parts.subjectCode,
    subjectName: parts.subjectName,
    bodyText: parts.bodyText,
    subjectKey: parts.subjectKey,
    displaySubject: parts.displaySubject,
    fireAtISO: parts.fireAtISO,
    kind: 'scheduled',
  });
}

function betterAttendanceNotif(a: AttendanceNotifItem, b: AttendanceNotifItem): AttendanceNotifItem {
  const now = Date.now();
  const fireMs = (x: AttendanceNotifItem) => effectiveFireMs(x) ?? 0;
  const aFutureSched = a.kind === 'scheduled' && fireMs(a) > now;
  const bFutureSched = b.kind === 'scheduled' && fireMs(b) > now;
  // Keep a future *scheduled* row so the OS still fires at T−5; presented is only a tray copy.
  if (aFutureSched !== bFutureSched) return aFutureSched ? a : b;
  if (a.kind !== b.kind) {
    if (a.kind === 'scheduled') return a;
    if (b.kind === 'scheduled') return b;
  }
  const at = fireMs(a) || Date.parse(a.scheduledStartAt) || 0;
  const bt = fireMs(b) || Date.parse(b.scheduledStartAt) || 0;
  if (at !== bt) return at <= bt ? a : b;
  return a.id <= b.id ? a : b;
}

/**
 * Never cancel a future scheduled notification unless the winner is also a future scheduled one.
 * Otherwise we can drop the only OS alarm while "cleaning" tray duplicates (no banner at T−5).
 */
function cancelDuplicateAttendanceCopy(winner: AttendanceNotifItem, x: AttendanceNotifItem) {
  if (!x.id || x.id === winner.id) return;
  const now = Date.now();
  const wf = effectiveFireMs(winner);
  const xf = effectiveFireMs(x);
  const winnerFutureSched = winner.kind === 'scheduled' && wf !== null && wf > now;
  if (x.kind === 'presented') {
    void Notifications.dismissNotificationAsync(x.id).catch(() => {});
    return;
  }
  if (xf === null || xf <= now) {
    void Notifications.cancelScheduledNotificationAsync(x.id).catch(() => {});
    return;
  }
  if (winnerFutureSched && winner.kind === 'scheduled') {
    void Notifications.cancelScheduledNotificationAsync(x.id).catch(() => {});
  }
}

/** Same class reminder: canonical subject + notification fire minute (UTC ms floor). Catches ISO/wall splits from pass 1. */
function attendanceSessionMergeKey(it: AttendanceNotifItem): string {
  const fm = effectiveFireMs(it);
  if (fm !== null && Number.isFinite(fm)) {
    const m = Math.floor(fm / 60_000) * 60_000;
    return `${canonicalAttendanceSubject(it)}|t:${m}`;
  }
  const wall = classLocalWallMinuteKey(it.scheduledStartAt);
  if (wall !== null) return `${canonicalAttendanceSubject(it)}|wall:${wall}`;
  return attendanceUiDedupeKey(it);
}

function collapseDuplicateAttendanceCopies(items: AttendanceNotifItem[]): AttendanceNotifItem[] {
  const sub = new Map<string, AttendanceNotifItem[]>();
  for (const it of items) {
    const k = attendanceSessionMergeKey(it);
    const arr = sub.get(k) ?? [];
    arr.push(it);
    sub.set(k, arr);
  }
  const out: AttendanceNotifItem[] = [];
  for (const arr of sub.values()) {
    const winner = arr.reduce((a, b) => betterAttendanceNotif(a, b));
    out.push(winner);
    for (const x of arr) {
      cancelDuplicateAttendanceCopy(winner, x);
    }
  }
  return out.sort((a, b) => (effectiveFireMs(a) ?? 0) - (effectiveFireMs(b) ?? 0));
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const { language } = useApp();
  const T = useTranslations(language);
  const { userId, refreshUnreadCount, incomingSharedTasks, respondToShare, refreshSharedTasks, refreshCircles, incomingRequests, refreshRequests, refreshFriends } = useCommunity();
  const params = useLocalSearchParams<Record<string, string | string[]>>();

  const [reactions, setReactions] = useState<QuickReaction[]>([]);
  const [circleInvites, setCircleInvites] = useState<CircleInvitation[]>([]);
  const [attendanceNotifs, setAttendanceNotifs] = useState<AttendanceNotifItem[]>([]);
  const [tapAttendance, setTapAttendance] = useState<AttendanceNotifItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());
  const [respondingInviteIds, setRespondingInviteIds] = useState<Set<string>>(new Set());
  const [respondingFriendIds, setRespondingFriendIds] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [attendanceBusyIds, setAttendanceBusyIds] = useState<Set<string>>(new Set());

  // Selection mode: user picks individual reactions to clear, or "Select all".
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allReactionIds = useMemo(() => reactions.map((r) => r.id), [reactions]);
  const allSelected = selectionMode && reactions.length > 0 && selectedIds.size === reactions.length;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === allReactionIds.length) return new Set();
      return new Set(allReactionIds);
    });
  }, [allReactionIds]);

  const clearSelected = useCallback(async () => {
    if (!userId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setClearing(true);
    try {
      await communityApi.deleteMyReceivedReactions(userId, ids);
      setReactions((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      await refreshUnreadCount();
      exitSelectionMode();
    } catch (e) {
      console.warn(e);
      Alert.alert(T('commNotifClearFailTitle'), T('commTryAgainShort'));
    } finally {
      setClearing(false);
    }
  }, [userId, selectedIds, refreshUnreadCount, exitSelectionMode, T]);

  const handleShareResponse = async (sharedTaskId: string, accept: boolean) => {
    setRespondingIds(prev => new Set(prev).add(sharedTaskId));
    await respondToShare(sharedTaskId, accept);
    setRespondingIds(prev => {
      const next = new Set(prev);
      next.delete(sharedTaskId);
      return next;
    });
  };

  const handleFriendResponse = async (friendshipId: string, accept: boolean) => {
    setRespondingFriendIds(prev => new Set(prev).add(friendshipId));
    try {
      if (accept) {
        await communityApi.acceptFriendRequest(friendshipId);
      } else {
        await communityApi.removeFriend(friendshipId);
      }
      await refreshRequests();
      await refreshFriends();
    } catch (e) {
      console.warn('Failed to respond to friend request:', e);
    }
    setRespondingFriendIds(prev => {
      const next = new Set(prev);
      next.delete(friendshipId);
      return next;
    });
  };

  const loadReactions = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await communityApi.getMyReactions(userId);
      setReactions(data);
      const invites = await communityApi.getMyCircleInvitations(userId).catch(() => [] as CircleInvitation[]);
      setCircleInvites(invites.filter((i) => i.status === 'pending'));
      // Mark all as read and sync local state so read styling applies
      await communityApi.markReactionsRead(userId);
      setReactions((prev) => prev.map((r) => ({ ...r, read: true })));
      await refreshUnreadCount();
    } catch (e) {
      console.warn(e);
    }
    setLoading(false);
  }, [userId, refreshUnreadCount]);

  const loadAttendanceNotifs = useCallback(async () => {
    try {
      const answered = await getAnsweredOccurrenceSet().catch(() => new Set<string>());
      const [scheduled, presented] = await Promise.all([
        Notifications.getAllScheduledNotificationsAsync().catch(() => []),
        Notifications.getPresentedNotificationsAsync().catch(() => []),
      ]);

      const pick = (
        n: Notifications.Notification | Notifications.ScheduledNotification,
        sourceKind: 'scheduled' | 'presented',
      ): AttendanceNotifItem | null => {
        const hasRequest = n && typeof n === 'object' && 'request' in (n as any);
        const req: any = hasRequest ? (n as any).request : null;
        const id = String((hasRequest ? req?.identifier : (n as any).identifier) || '');

        const content: any = hasRequest ? req?.content : (n as any).content;
        const data = (content?.data ?? {}) as Record<string, any>;
        if (data?.type !== 'attendance_checkin') return null;
        const timetableEntryId = String(data.timetableEntryId || '').trim();
        const rawScheduledStartAt = String(data.scheduledStartAt || '').trim();
        const trigger: any = (hasRequest ? req?.trigger : (n as any).trigger) ?? null;
        const triggerMs = triggerFireMs(trigger);
        const fireAtISO = triggerMs !== null ? new Date(triggerMs).toISOString() : undefined;

        let scheduledStartAt = (() => {
          const t = Date.parse(rawScheduledStartAt);
          if (!Number.isFinite(t)) return rawScheduledStartAt;
          return new Date(t).toISOString();
        })();

        if (!scheduledStartAt) {
          const ft = Date.parse(String(fireAtISO || '').trim());
          if (!Number.isFinite(ft)) return null;
          // Notification fires 5 minutes before class start.
          scheduledStartAt = new Date(ft + 5 * 60_000).toISOString();
        }

        if (!id || !timetableEntryId || !scheduledStartAt) return null;
        const subjectCode = String(data.subjectCode || '').trim();
        const subjectName = String(data.subjectName || '').trim();
        const subjectKey = String(data.subjectKey || '').trim();
        const displaySubject = String(data.displaySubject || '').trim();
        const fireAtMsRaw = (data as any)?.fireAtMs;
        const fireAtMs =
          typeof fireAtMsRaw === 'number' && Number.isFinite(fireAtMsRaw)
            ? fireAtMsRaw
            : typeof fireAtMsRaw === 'string' && fireAtMsRaw.trim() && Number.isFinite(Number(fireAtMsRaw))
              ? Number(fireAtMsRaw)
              : triggerMs ?? undefined;
        const bodyText = String(content?.body || '').trim();

        return {
          id,
          timetableEntryId,
          scheduledStartAt,
          subjectCode,
          subjectName,
          subjectKey: subjectKey || undefined,
          displaySubject: displaySubject || undefined,
          bodyText: bodyText || undefined,
          fireAtMs,
          fireAtISO,
          kind: sourceKind,
        };
      };

      const itemsRaw = [
        ...(scheduled ?? []).map((n) => pick(n, 'scheduled')).filter(Boolean) as AttendanceNotifItem[],
        ...(presented ?? []).map((n) => pick(n, 'presented')).filter(Boolean) as AttendanceNotifItem[],
      ];

      // De-dupe by class slot + subject (duplicate timetable rows keep different entry IDs).
      const groups = new Map<string, AttendanceNotifItem[]>();
      for (const it of itemsRaw) {
        const k = attendanceUiDedupeKey(it);
        const arr = groups.get(k) ?? [];
        arr.push(it);
        groups.set(k, arr);
      }

      const items: AttendanceNotifItem[] = [];
      for (const arr of groups.values()) {
        const winner = arr.reduce((a, b) => betterAttendanceNotif(a, b));
        items.push(winner);
        for (const x of arr) {
          cancelDuplicateAttendanceCopy(winner, x);
        }
      }

      const byUiKey = new Map<string, AttendanceNotifItem>();
      for (const it of items) {
        const k = attendanceUiDedupeKey(it);
        const prev = byUiKey.get(k);
        if (!prev) {
          byUiKey.set(k, it);
          continue;
        }
        const w = betterAttendanceNotif(prev, it);
        const loser = w.id === prev.id ? it : prev;
        cancelDuplicateAttendanceCopy(w, loser);
        byUiKey.set(k, w);
      }
      const mergedOnce = Array.from(byUiKey.values()).sort((a, b) => {
        const at = effectiveFireMs(a) ?? (Date.parse(a.scheduledStartAt) || 0);
        const bt = effectiveFireMs(b) ?? (Date.parse(b.scheduledStartAt) || 0);
        return at - bt;
      });
      const finalItems = collapseDuplicateAttendanceCopies(mergedOnce);
      // Only show items once the OS has actually fired (presented) or the fire time has passed.
      // This avoids showing a "preview" card before the popup/banner appears.
      const now = Date.now();
      const visible = finalItems.filter((it) => {
        const occ = attendanceOccurrenceKey(it.timetableEntryId, it.scheduledStartAt);
        if (answered.has(occ)) return false;
        if (it.kind === 'presented') return true;
        const fm = effectiveFireMs(it);
        if (fm === null) return false;
        return fm <= now;
      });
      // Only merge the tap-injected card when its occurrence hasn't been answered yet.
      // Otherwise the user would see the card re-appear on refresh right after tapping Present/Absent.
      const tapKey = tapAttendance
        ? attendanceOccurrenceKey(tapAttendance.timetableEntryId, tapAttendance.scheduledStartAt)
        : null;
      const tapIsAnswered = tapKey ? answered.has(tapKey) : false;
      if (tapAttendance && tapIsAnswered) {
        setTapAttendance(null);
        void AsyncStorage.removeItem('lastAttendanceTapV1').catch(() => {});
      }
      setAttendanceNotifs(() => {
        const merged =
          tapAttendance && !tapIsAnswered
            ? collapseDuplicateAttendanceCopies([...visible, tapAttendance])
            : visible;
        return merged;
      });
    } catch {
      setAttendanceNotifs([]);
    }
  }, [tapAttendance]);

  useEffect(() => {
    loadReactions();
    void loadAttendanceNotifs();
  }, [loadReactions]);

  // If user arrived by tapping the OS popup, show that card immediately even if iOS hasn't populated
  // the presented notifications list yet. Skip injection when the occurrence was already answered
  // or when the class time is not within a reasonable window around "now" (stale taps from previous
  // sessions must not surface a card before T−5).
  useEffect(() => {
    const get1 = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    if (!get1(params?.fromAttendanceTap)) return;
    const timetableEntryId = String(get1(params.timetableEntryId) || '').trim();
    const scheduledStartAt = String(get1(params.scheduledStartAt) || '').trim();
    if (!timetableEntryId || !scheduledStartAt) return;
    const startMs = Date.parse(scheduledStartAt);
    const nowMs = Date.now();
    const isFresh =
      Number.isFinite(startMs) &&
      startMs - 30 * 60_000 <= nowMs &&
      nowMs <= startMs + 90 * 60_000;
    if (!isFresh) return;

    let cancelled = false;
    void (async () => {
      const answered = await getAnsweredOccurrenceSet().catch(() => new Set<string>());
      if (cancelled) return;
      if (answered.has(attendanceOccurrenceKey(timetableEntryId, scheduledStartAt))) return;

      const fireAtMsNum = Number(String(get1(params.fireAtMs) || '').trim());
      const fireAtMs = Number.isFinite(fireAtMsNum) ? fireAtMsNum : undefined;
      const injected: AttendanceNotifItem = {
        id: `tap-${timetableEntryId}-${scheduledStartAt}`,
        timetableEntryId,
        scheduledStartAt,
        subjectCode: String(get1(params.subjectCode) || '').trim(),
        subjectName: String(get1(params.subjectName) || '').trim(),
        subjectKey: String(get1(params.subjectKey) || '').trim() || undefined,
        displaySubject: String(get1(params.displaySubject) || '').trim() || undefined,
        bodyText: undefined,
        fireAtMs,
        fireAtISO: fireAtMs != null ? new Date(fireAtMs).toISOString() : undefined,
        kind: 'presented',
      };

      setTapAttendance(injected);
      setAttendanceNotifs((prev) => collapseDuplicateAttendanceCopies([...prev, injected]));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    params?.fromAttendanceTap,
    params?.timetableEntryId,
    params?.scheduledStartAt,
    params?.subjectCode,
    params?.subjectName,
    params?.subjectKey,
    params?.displaySubject,
    params?.fireAtMs,
  ]);

  // Fallback: on iOS, router params may not arrive consistently right after tapping a banner.
  // Pull the last notification response directly and inject the attendance card.
  // `getLastNotificationResponseAsync()` returns the last tap *ever* until explicitly cleared,
  // so guard against both already-answered occurrences and stale classes from previous sessions.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resp = await Notifications.getLastNotificationResponseAsync();
        if (cancelled || !resp) return;
        const data = resp.notification?.request?.content?.data as Record<string, any> | undefined;
        if (!data || data.type !== 'attendance_checkin') return;
        const timetableEntryId = String(data.timetableEntryId || '').trim();
        const scheduledStartAt = String(data.scheduledStartAt || '').trim();
        if (!timetableEntryId || !scheduledStartAt) return;
        const startMs = Date.parse(scheduledStartAt);
        const nowMs = Date.now();
        const isFresh =
          Number.isFinite(startMs) &&
          startMs - 30 * 60_000 <= nowMs &&
          nowMs <= startMs + 90 * 60_000;
        if (!isFresh) return;

        const answered = await getAnsweredOccurrenceSet().catch(() => new Set<string>());
        if (cancelled) return;
        if (answered.has(attendanceOccurrenceKey(timetableEntryId, scheduledStartAt))) return;
        const fireAtMsNum = Number(String(data.fireAtMs || '').trim());
        const fireAtMs = Number.isFinite(fireAtMsNum) ? fireAtMsNum : undefined;
        const injected: AttendanceNotifItem = {
          id: `tap-last-${timetableEntryId}-${scheduledStartAt}`,
          timetableEntryId,
          scheduledStartAt,
          subjectCode: String(data.subjectCode || '').trim(),
          subjectName: String(data.subjectName || '').trim(),
          subjectKey: String(data.subjectKey || '').trim() || undefined,
          displaySubject: String(data.displaySubject || '').trim() || undefined,
          bodyText: undefined,
          fireAtMs,
          fireAtISO: fireAtMs != null ? new Date(fireAtMs).toISOString() : undefined,
          kind: 'presented',
        };
        setTapAttendance(injected);
        setAttendanceNotifs((prev) => collapseDuplicateAttendanceCopies([...prev, injected]));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Strong fallback: restore the tapped attendance payload from storage (written at tap-time in root layout).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const answered = await getAnsweredOccurrenceSet().catch(() => new Set<string>());
        const raw = await AsyncStorage.getItem('lastAttendanceTapV1');
        if (cancelled || !raw) return;
        const data = JSON.parse(raw) as Record<string, any>;
        if (!data || data.type !== 'attendance_checkin') return;
        const timetableEntryId = String(data.timetableEntryId || '').trim();
        const scheduledStartAt = String(data.scheduledStartAt || '').trim();
        if (!timetableEntryId || !scheduledStartAt) return;
        if (answered.has(attendanceOccurrenceKey(timetableEntryId, scheduledStartAt))) {
          // Answered already — drop the stored copy so we never re-inject it.
          void AsyncStorage.removeItem('lastAttendanceTapV1').catch(() => {});
          return;
        }
        const startMs = Date.parse(scheduledStartAt);
        const nowMs = Date.now();
        const isFresh =
          Number.isFinite(startMs) &&
          startMs - 30 * 60_000 <= nowMs &&
          nowMs <= startMs + 90 * 60_000;
        if (!isFresh) {
          // Stored tap is from a previous session / different class — don't inject it now.
          void AsyncStorage.removeItem('lastAttendanceTapV1').catch(() => {});
          return;
        }
        const fireAtMsNum = Number(String(data.fireAtMs || '').trim());
        const fireAtMs = Number.isFinite(fireAtMsNum) ? fireAtMsNum : undefined;
        const injected: AttendanceNotifItem = {
          id: `tap-store-${timetableEntryId}-${scheduledStartAt}`,
          timetableEntryId,
          scheduledStartAt,
          subjectCode: String(data.subjectCode || '').trim(),
          subjectName: String(data.subjectName || '').trim(),
          subjectKey: String(data.subjectKey || '').trim() || undefined,
          displaySubject: String(data.displaySubject || '').trim() || undefined,
          bodyText: undefined,
          fireAtMs,
          fireAtISO: fireAtMs != null ? new Date(fireAtMs).toISOString() : undefined,
          kind: 'presented',
        };
        setTapAttendance(injected);
        setAttendanceNotifs((prev) => collapseDuplicateAttendanceCopies([...prev, injected]));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAttendanceNotifs();
    }, [loadAttendanceNotifs]),
  );

  const isFriendRequestReaction = useCallback((r: QuickReaction) => {
    return r.reaction_type === '👋' && Boolean(r.message?.toLowerCase().includes('friend request'));
  }, []);

  const handleReply = useCallback(
    async (reaction: QuickReaction) => {
      if (!userId) return;
      if (isFriendRequestReaction(reaction)) {
        router.push({ pathname: '/community/add-friend', params: { tab: 'incoming' } } as any);
        return;
      }
      router.push({
        pathname: '/community/friend-profile',
        params: { friendId: reaction.sender_id },
      } as any);
    },
    [userId, isFriendRequestReaction]
  );

  const handleAttendanceAction = useCallback(
    async (item: AttendanceNotifItem, status: AttendanceStatus) => {
      setAttendanceBusyIds((prev) => new Set(prev).add(item.id));
      try {
        const occKey = attendanceOccurrenceKey(item.timetableEntryId, item.scheduledStartAt);
        const uiKey = attendanceUiDedupeKey(item);
        const sessionKey = attendanceSessionMergeKey(item);
        await recordAttendanceEvent({
          timetableEntryId: item.timetableEntryId,
          scheduledStartAt: item.scheduledStartAt,
          status,
          subjectCode: item.subjectCode,
          subjectName: item.subjectName,
          source: 'in_app',
        });

        // Remove the system notification(s) as well (there can be duplicates with different identifiers).
        try {
          const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => [] as any[]);
          for (const n of scheduled ?? []) {
            const hasRequest = n && typeof n === 'object' && 'request' in (n as any);
            const req: any = hasRequest ? (n as any).request : null;
            const content: any = hasRequest ? req?.content : (n as any).content;
            const data = (content?.data ?? {}) as Record<string, any>;
            if (!data || data.type !== 'attendance_checkin') continue;
            const tid = String(data.timetableEntryId || '').trim();
            const iso = String(data.scheduledStartAt || '').trim();
            const body = String((hasRequest ? req?.content : (n as any).content)?.body || '').trim();
            if (!tid || !iso) continue;
            const trigger: any = (hasRequest ? req?.trigger : (n as any).trigger) ?? null;
            let fireAtISO =
              trigger && typeof trigger === 'object' && trigger.date != null
                ? new Date(trigger.date as string | number | Date).toISOString()
                : undefined;
            if (!fireAtISO) {
              const st = parseMs(iso);
              if (st !== null) fireAtISO = new Date(st - 5 * 60_000).toISOString();
            }
            const k = attendanceUiDedupeKeyLoose({
              scheduledStartAt: iso,
              subjectCode: String(data.subjectCode || '').trim(),
              subjectName: String(data.subjectName || '').trim(),
              bodyText: body || undefined,
              subjectKey: String(data.subjectKey || '').trim() || undefined,
              displaySubject: String(data.displaySubject || '').trim() || undefined,
              fireAtISO,
            });
            if (k === uiKey || attendanceOccurrenceKey(tid, iso) === occKey) {
              const nid = String((hasRequest ? req?.identifier : (n as any).identifier) || '');
              if (nid) await Notifications.cancelScheduledNotificationAsync(nid).catch(() => {});
            }
          }
        } catch {}

        try {
          const presented = await Notifications.getPresentedNotificationsAsync().catch(() => [] as any[]);
          for (const n of presented ?? []) {
            const req = (n as any)?.request;
            const data = req?.content?.data as Record<string, any> | undefined;
            if (!data || data.type !== 'attendance_checkin') continue;
            const tid = String(data.timetableEntryId || '').trim();
            const iso = String(data.scheduledStartAt || '').trim();
            const body = String(req?.content?.body || '').trim();
            if (!tid || !iso) continue;
            const trigger: any = req?.trigger ?? null;
            let fireAtISO =
              trigger && typeof trigger === 'object' && trigger.date != null
                ? new Date(trigger.date as string | number | Date).toISOString()
                : undefined;
            if (!fireAtISO) {
              const st = parseMs(iso);
              if (st !== null) fireAtISO = new Date(st - 5 * 60_000).toISOString();
            }
            const k = attendanceUiDedupeKeyLoose({
              scheduledStartAt: iso,
              subjectCode: String(data.subjectCode || '').trim(),
              subjectName: String(data.subjectName || '').trim(),
              bodyText: body || undefined,
              subjectKey: String(data.subjectKey || '').trim() || undefined,
              displaySubject: String(data.displaySubject || '').trim() || undefined,
              fireAtISO,
            });
            if (k === uiKey || attendanceOccurrenceKey(tid, iso) === occKey) {
              const nid = String((n as any)?.request?.identifier || '');
              if (nid) await Notifications.dismissNotificationAsync(nid).catch(() => {});
            }
          }
        } catch {}

        // Remove all visible duplicates for the same class session.
        setAttendanceNotifs((prev) =>
          prev.filter((x) => {
            if (attendanceSessionMergeKey(x) === sessionKey) return false;
            if (attendanceUiDedupeKey(x) === uiKey) return false;
            const ok = attendanceOccurrenceKey(x.timetableEntryId, x.scheduledStartAt);
            return ok !== occKey;
          }),
        );

        // Prevent the same tapped card from reappearing on refresh.
        setTapAttendance(null);
        void AsyncStorage.removeItem('lastAttendanceTapV1').catch(() => {});
      } finally {
        setAttendanceBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    },
    [],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => (selectionMode ? exitSelectionMode() : router.back())}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name={selectionMode ? 'x' : 'chevron-left'} size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {selectionMode
            ? T('commNotifSelectedCount').replace('{count}', String(selectedIds.size))
            : 'Notifications'}
        </Text>

        {selectionMode ? (
          <View style={styles.headerActionsRow}>
            <Pressable
              disabled={reactions.length === 0}
              onPress={toggleSelectAll}
              style={({ pressed }) => [
                styles.clearHeaderBtn,
                {
                  borderColor: theme.border,
                  opacity: reactions.length === 0 ? 0.35 : pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text style={[styles.clearHeaderBtnText, { color: theme.textSecondary }]}>
                {allSelected ? T('commNotifDeselectAll') : T('commNotifSelectAll')}
              </Text>
            </Pressable>
            <Pressable
              disabled={clearing || selectedIds.size === 0}
              onPress={() => {
                const count = selectedIds.size;
                if (count === 0) return;
                Alert.alert(
                  T('commNotifClearSelectedTitle'),
                  T('commNotifClearSelectedBody').replace('{count}', String(count)),
                  [
                    { text: T('cancel'), style: 'cancel' },
                    {
                      text: T('commNotifClearAction'),
                      style: 'destructive',
                      onPress: () => void clearSelected(),
                    },
                  ],
                );
              }}
              style={({ pressed }) => [
                styles.clearHeaderBtn,
                styles.destructiveHeaderBtn,
                {
                  borderColor: '#ef4444',
                  opacity: selectedIds.size === 0 ? 0.35 : pressed ? 0.75 : 1,
                },
              ]}
            >
              {clearing ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <Text style={[styles.clearHeaderBtnText, { color: '#ef4444' }]}>
                  {T('commNotifClearAction')}
                  {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            disabled={reactions.length === 0 || clearing}
            onPress={() => setSelectionMode(true)}
            style={({ pressed }) => [
              styles.clearHeaderBtn,
              {
                borderColor: theme.border,
                opacity: reactions.length === 0 ? 0.35 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text style={[styles.clearHeaderBtnText, { color: theme.textSecondary }]}>
              {T('commNotifSelect')}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Class check-ins (attendance) */}
        {attendanceNotifs.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Class check-ins</Text>
            {attendanceNotifs.map((n) => {
              const raw = canonicalAttendanceSubject(n);
              const subject =
                (n.displaySubject || '').trim() ||
                (raw && raw !== 'class' ? raw.charAt(0).toUpperCase() + raw.slice(1) : '') ||
                (n.subjectName || n.subjectCode || 'Class').trim() ||
                'Class';
              const when = (() => {
                const d = n.fireAtISO ? new Date(n.fireAtISO) : null;
                if (!d || Number.isNaN(d.getTime())) return '';
                return ` · ${d.toLocaleString()}`;
              })();
              const busy = attendanceBusyIds.has(n.id);
              return (
                <View
                  key={attendanceUiDedupeKey(n)}
                  style={[styles.shareRequestCard, { backgroundColor: theme.primary + '08', borderColor: theme.primary + '25' }]}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: `${theme.primary}20`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="check-circle" size={20} color={theme.primary} />
                  </View>
                  <View style={styles.notifBody}>
                    <Text style={[styles.notifName, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
                      Class check-in
                    </Text>
                    <Text style={[styles.notifMessage, { color: theme.textSecondary }]} numberOfLines={3}>
                      Did you attend class "{subject}" in 5 more minutes?{when}
                    </Text>
                    <View style={styles.attendanceActions}>
                      <Pressable
                        style={[styles.attendanceBtn, styles.attendanceBtnPrimary, { opacity: busy ? 0.6 : 1 }]}
                        disabled={busy}
                        onPress={() => void handleAttendanceAction(n, 'present')}
                      >
                        <Feather name="check" size={14} color="#fff" />
                        <Text style={styles.shareActionText}>Present</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.attendanceBtn,
                          styles.attendanceBtnOutline,
                          { borderColor: theme.border, opacity: busy ? 0.6 : 1 },
                        ]}
                        disabled={busy}
                        onPress={() => void handleAttendanceAction(n, 'absent')}
                      >
                        <Text style={[styles.shareDeclineText, { color: theme.textSecondary }]}>Absent</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.attendanceBtn,
                          styles.attendanceBtnOutline,
                          { borderColor: theme.border, opacity: busy ? 0.6 : 1 },
                        ]}
                        disabled={busy}
                        onPress={() => void handleAttendanceAction(n, 'cancelled')}
                      >
                        <Text style={[styles.shareDeclineText, { color: theme.textSecondary }]}>Class cancelled</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Friend Requests */}
        {incomingRequests.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Friend Requests</Text>
            {incomingRequests.map((req) => (
              <View
                key={req.id}
                style={[styles.shareRequestCard, { backgroundColor: theme.primary + '08', borderColor: theme.primary + '25' }]}
              >
                <Avatar name={req.profile?.name} avatarUrl={req.profile?.avatar_url} size={44} />
                <View style={styles.notifBody}>
                  <Text style={[styles.notifName, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
                    {formatDisplayName(req.profile?.name)}
                  </Text>
                  <Text style={[styles.notifMessage, { color: theme.textSecondary }]} numberOfLines={2}>
                    Wants to be your friend
                    {req.profile?.university ? ` · ${req.profile.university}` : ''}
                  </Text>
                  <View style={styles.shareActions}>
                    <Pressable
                      style={[styles.shareAcceptBtn, { backgroundColor: '#10b981' }]}
                      disabled={respondingFriendIds.has(req.id)}
                      onPress={() => handleFriendResponse(req.id, true)}
                    >
                      <Feather name="check" size={14} color="#fff" />
                      <Text style={styles.shareActionText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.shareDeclineBtn, { borderColor: theme.border }]}
                      disabled={respondingFriendIds.has(req.id)}
                      onPress={() => handleFriendResponse(req.id, false)}
                    >
                      <Text style={[styles.shareDeclineText, { color: theme.textSecondary }]}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Circle Invites */}
        {circleInvites.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Circle Invites</Text>
            {circleInvites.map((inv) => (
              <View
                key={inv.id}
                style={[styles.shareRequestCard, { backgroundColor: theme.primary + '08', borderColor: theme.primary + '25' }]}
              >
                <Avatar name={inv.inviter_profile?.name} avatarUrl={inv.inviter_profile?.avatar_url} size={44} />
                <View style={styles.notifBody}>
                  <Text style={[styles.notifName, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
                    {formatDisplayName(inv.inviter_profile?.name)}
                  </Text>
                  <Text style={[styles.notifMessage, { color: theme.textSecondary }]} numberOfLines={2}>
                    Invited you to join {inv.circle ? `${inv.circle.emoji} ${inv.circle.name}` : 'a circle'}
                  </Text>
                  <View style={styles.shareActions}>
                    <Pressable
                      style={[styles.shareAcceptBtn, { backgroundColor: '#10b981' }]}
                      disabled={respondingInviteIds.has(inv.id)}
                      onPress={async () => {
                        setRespondingInviteIds((prev) => new Set(prev).add(inv.id));
                        try {
                          await communityApi.respondToCircleInvitation(inv.id, true);
                          await refreshCircles();
                          await loadReactions();
                        } finally {
                          setRespondingInviteIds((prev) => {
                            const next = new Set(prev);
                            next.delete(inv.id);
                            return next;
                          });
                        }
                      }}
                    >
                      <Feather name="check" size={14} color="#fff" />
                      <Text style={styles.shareActionText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.shareDeclineBtn, { borderColor: theme.border }]}
                      disabled={respondingInviteIds.has(inv.id)}
                      onPress={async () => {
                        setRespondingInviteIds((prev) => new Set(prev).add(inv.id));
                        try {
                          await communityApi.respondToCircleInvitation(inv.id, false);
                          await loadReactions();
                        } finally {
                          setRespondingInviteIds((prev) => {
                            const next = new Set(prev);
                            next.delete(inv.id);
                            return next;
                          });
                        }
                      }}
                    >
                      <Text style={[styles.shareDeclineText, { color: theme.textSecondary }]}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
        {/* Incoming Shared Task Requests */}
        {incomingSharedTasks.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Task Share Requests</Text>
            {incomingSharedTasks.map(st => (
              <Pressable
                key={st.id}
                style={[styles.shareRequestCard, { backgroundColor: theme.primary + '08', borderColor: theme.primary + '25' }]}
                onPress={() => {
                  router.push({ pathname: '/community/shared-task-preview', params: { id: st.id } } as any);
                }}
              >
                <Avatar
                  name={st.owner_profile?.name}
                  avatarUrl={st.owner_profile?.avatar_url}
                  size={44}
                />
                <View style={styles.notifBody}>
                  <Text style={[styles.notifName, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
                    {formatDisplayName(st.owner_profile?.name)}
                  </Text>
                  <Text style={[styles.notifMessage, { color: theme.textSecondary }]} numberOfLines={2}>
                    Shared a task: {st.task?.title || 'Task'}
                    {st.message ? `\n"${st.message}"` : ''}
                  </Text>
                  <View style={styles.shareActions}>
                    <Pressable
                      style={[styles.shareAcceptBtn, { backgroundColor: '#10b981' }]}
                      disabled={respondingIds.has(st.id)}
                      onPress={() => {
                        router.push({ pathname: '/community/shared-task-preview', params: { id: st.id } } as any);
                      }}
                    >
                      <Feather name="check" size={14} color="#fff" />
                      <Text style={styles.shareActionText}>View</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.shareDeclineBtn, { borderColor: theme.border }]}
                      disabled={respondingIds.has(st.id)}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleShareResponse(st.id, false);
                      }}
                    >
                      <Text style={[styles.shareDeclineText, { color: theme.textSecondary }]}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={theme.primary} />
        ) : reactions.length === 0 && incomingSharedTasks.length === 0 && circleInvites.length === 0 && incomingRequests.length === 0 && attendanceNotifs.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="bell-off" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No notifications yet</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
              When friends send you reactions or bumps, they'll show up here
            </Text>
          </View>
        ) : (
          reactions.map((reaction) => {
            const isBump = reaction.reaction_type === 'bump';
            const { lead, text } = reactionPreviewLines(reaction, isBump);
            const isRead = reaction.read;
            const nameColor = isRead ? theme.textSecondary : theme.text;
            const subColor = isRead ? theme.tabIconDefault : theme.textSecondary;
            const timeColor = isRead ? theme.tabIconDefault : theme.textSecondary;
            const isSelected = selectedIds.has(reaction.id);
            return (
              <Pressable
                key={reaction.id}
                style={({ pressed }) => [
                  styles.notifCard,
                  {
                    backgroundColor: isSelected
                      ? theme.primary + '16'
                      : isRead
                        ? theme.card
                        : theme.primary + '08',
                    borderColor: isSelected
                      ? theme.primary
                      : isRead
                        ? theme.border
                        : theme.primary + '30',
                  },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => {
                  if (selectionMode) toggleSelected(reaction.id);
                  else handleReply(reaction);
                }}
                onLongPress={() => {
                  if (!selectionMode) setSelectionMode(true);
                  toggleSelected(reaction.id);
                }}
              >
                {selectionMode ? (
                  <View
                    style={[
                      styles.selectCheckbox,
                      {
                        borderColor: isSelected ? theme.primary : theme.border,
                        backgroundColor: isSelected ? theme.primary : 'transparent',
                      },
                    ]}
                  >
                    {isSelected ? <Feather name="check" size={14} color="#fff" /> : null}
                  </View>
                ) : null}
                <View style={isRead ? styles.avatarDim : undefined}>
                  <Avatar
                    name={reaction.sender_profile?.name}
                    avatarUrl={reaction.sender_profile?.avatar_url}
                    size={44}
                  />
                </View>
                <View style={styles.notifBody}>
                  <View style={styles.notifTopRow}>
                    <Text
                      style={[styles.notifName, { color: nameColor }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {formatDisplayName(reaction.sender_profile?.name)}
                    </Text>
                    <Text style={[styles.notifTime, { color: timeColor }]}>
                      {timeAgo(reaction.created_at)}
                    </Text>
                  </View>
                  <View style={styles.notifMessageRow}>
                    <View style={styles.notifLeadSlot}>
                      {lead ? (
                        <Text style={[styles.notifLeadEmoji, isRead && styles.readMutedEmoji]}>{lead}</Text>
                      ) : null}
                    </View>
                    <Text
                      style={[styles.notifMessage, { color: subColor }]}
                      numberOfLines={3}
                    >
                      {text}
                    </Text>
                  </View>
                  {reaction.reaction_type === '🎮' && reaction.message && (
                    <Pressable
                      style={[
                        styles.joinQuizBtn,
                        { backgroundColor: theme.primary },
                        isRead && { opacity: 0.55 },
                      ]}
                      onPress={() => {
                        const sessionId = reaction.message?.match(/session:(\S+)/)?.[1];
                        if (sessionId) {
                          router.push({ pathname: '/match-lobby', params: { sessionId } } as any);
                        }
                      }}
                    >
                      <Feather name="play" size={12} color="#fff" />
                      <Text style={styles.joinQuizBtnText}>Join Quiz</Text>
                    </Pressable>
                  )}
                </View>
                {!reaction.read && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
              </Pressable>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 12,
  },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  clearHeaderBtn: {
    minWidth: 56,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearHeaderBtnText: { fontSize: 14, fontWeight: '700' },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  destructiveHeaderBtn: {
    borderWidth: 1.5,
  },
  selectCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 8 },

  notifCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    position: 'relative',
  },
  notifBody: { flex: 1, minWidth: 0 },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  notifName: { fontSize: 15, fontWeight: '700', flex: 1, minWidth: 0 },
  notifTime: { fontSize: 12, fontWeight: '600', flexShrink: 0, marginTop: 2 },
  notifMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    gap: 4,
  },
  notifLeadSlot: {
    width: 28,
    minHeight: 22,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 1,
  },
  notifLeadEmoji: { fontSize: 17, lineHeight: 22 },
  readMutedEmoji: { opacity: 0.55 },
  avatarDim: { opacity: 0.65 },
  notifMessage: { fontSize: 14, lineHeight: 21, flex: 1, minWidth: 0, fontWeight: '500' },
  unreadDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 240 },

  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  shareRequestCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  shareActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  attendanceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  attendanceBtn: {
    minWidth: 110,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  attendanceBtnPrimary: { backgroundColor: '#10b981' },
  attendanceBtnOutline: { borderWidth: 1 },
  shareAcceptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
  },
  shareActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  shareDeclineBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1,
  },
  shareDeclineText: { fontSize: 13, fontWeight: '600' },
  joinQuizBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginTop: 8, alignSelf: 'flex-start',
  },
  joinQuizBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

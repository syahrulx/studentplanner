import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';

import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/src/lib/supabase';
import { captureError } from '@/src/lib/monitoring';
import { getNotificationPrefs } from '@/src/storage';
import { getPendingAttendanceEvents } from '@/src/attendanceRecording';
import { isLectureDate, normalizeWeekday, parseHHMM } from '@/src/attendanceNotifications';
import {
  computeAttendanceStats,
  subjectWarning,
  type AttendanceEventLike,
  type AttendanceRule,
  type AttendanceStats,
} from '@/src/lib/attendanceStats';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The student's own warning limit. Kept on this phone; it is a personal preference. */
const KEY_RULE = 'attendanceWarningLimitV1';
const DEFAULT_LIMITS = { absences: 3, percent: 80 };
type Limits = typeof DEFAULT_LIMITS;

async function loadLimits(): Promise<Limits> {
  try {
    const raw = await AsyncStorage.getItem(KEY_RULE);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      absences: Number.isInteger(parsed?.absences) ? parsed.absences : DEFAULT_LIMITS.absences,
      percent: Number.isInteger(parsed?.percent) ? parsed.percent : DEFAULT_LIMITS.percent,
    };
  } catch {
    return DEFAULT_LIMITS;
  }
}

/**
 * The profile's Attendance section. Reads only the signed-in student's own
 * check-ins: the query filters on their id, and row-level security on
 * class_attendance_events refuses anyone else's. Nothing here is shared.
 */
export function AttendanceStatsSection({ sectionTitleStyle, cardStyle }: {
  sectionTitleStyle: object;
  cardStyle: object;
}) {
  const { user, timetable, academicCalendar } = useApp();
  const theme = useTheme();
  const isUitm =
    user.universityId === 'uitm' || /\buitm\b|universiti teknologi mara/i.test(user.university ?? '');
  const semesterStartISO = (academicCalendar?.startDate ?? user.startDate ?? '').trim().slice(0, 10);

  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [checkinsOn, setCheckinsOn] = useState(true);
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  /** Folded by default: the per-subject list is long, and most visits only need the %. */
  const [open, setOpen] = useState(false);

  const rule: AttendanceRule = isUitm
    ? { kind: 'absences', limit: limits.absences }
    : { kind: 'percent', limit: limits.percent };

  const load = useCallback(async () => {
    const uid = user.id?.trim();
    if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(semesterStartISO)) {
      setStats(null);
      setLoading(false);
      return;
    }
    setFailed(false);
    try {
      const [{ data, error }, first, pending, prefs, savedLimits] = await Promise.all([
        supabase
          .from('class_attendance_events')
          .select('timetable_entry_id, scheduled_start_at, status, subject_code, subject_name')
          .eq('user_id', uid)
          .gte('scheduled_start_at', new Date(`${semesterStartISO}T00:00:00`).toISOString())
          .order('scheduled_start_at', { ascending: true })
          .limit(3000),
        // The very first check-in, from any semester: "not answered" starts there.
        supabase
          .from('class_attendance_events')
          .select('scheduled_start_at')
          .eq('user_id', uid)
          .order('scheduled_start_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        getPendingAttendanceEvents(),
        getNotificationPrefs().catch(() => null),
        loadLimits(),
      ]);
      if (error) throw error;
      if (first.error) throw first.error;
      const firstTimes = [
        String((first.data as { scheduled_start_at?: string } | null)?.scheduled_start_at ?? ''),
        ...pending.map((p) => p.scheduledStartAt),
      ].filter((t) => Number.isFinite(Date.parse(t)));
      const firstCheckinAt = firstTimes.length
        ? firstTimes.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b))
        : null;
      const events: AttendanceEventLike[] = [
        ...(data ?? []).map((r: any) => ({
          timetableEntryId: String(r.timetable_entry_id ?? ''),
          scheduledStartAt: String(r.scheduled_start_at ?? ''),
          status: r.status,
          subjectCode: String(r.subject_code ?? ''),
          subjectName: String(r.subject_name ?? ''),
        })),
        // Answered offline and not synced yet: still the student's answer.
        ...pending,
      ];
      setStats(
        computeAttendanceStats({
          events,
          timetable,
          semesterStartISO,
          firstCheckinAt,
          now: new Date(),
          helpers: {
            weekdayIndex: (day) => {
              const label = normalizeWeekday(day);
              return label ? WEEKDAYS.indexOf(label) : null;
            },
            parseTime: parseHHMM,
            isClassDay: (date) => isLectureDate(date, academicCalendar),
          },
        }),
      );
      setCheckinsOn(prefs?.attendanceCheckinPopup ?? true);
      setLimits(savedLimits);
    } catch (e) {
      captureError(e, { where: 'AttendanceStatsSection.load' });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user.id, semesterStartISO, timetable, academicCalendar]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const changeLimit = (delta: number) => {
    const next: Limits = isUitm
      ? { ...limits, absences: Math.max(1, Math.min(10, limits.absences + delta)) }
      : { ...limits, percent: Math.max(50, Math.min(100, limits.percent + delta * 5)) };
    setLimits(next);
    AsyncStorage.setItem(KEY_RULE, JSON.stringify(next)).catch(() => {});
  };

  const overall = stats?.overall;
  const subjects = stats?.subjects ?? [];
  const hasAny = !!overall && overall.present + overall.absent + overall.cancelled + overall.notAnswered > 0;

  const statusColor = (level: 'over' | 'near' | null) =>
    level === 'over' ? theme.danger : level === 'near' ? theme.warning : theme.success;

  // A subject at risk must not hide behind the fold: the closed row says so.
  const warnings = subjects.map((s) => subjectWarning(s, rule)).filter(Boolean);
  const overCount = warnings.filter((w) => w!.level === 'over').length;
  const nearCount = warnings.length - overCount;
  const foldHint = overCount
    ? { color: theme.danger, text: `${overCount} subject${overCount === 1 ? '' : 's'} over your limit` }
    : nearCount
      ? { color: theme.warning, text: `${nearCount} subject${nearCount === 1 ? '' : 's'} close to your limit` }
      : null;

  return (
    <>
      <View style={styles.titleRow}>
        <Text style={[sectionTitleStyle, { color: theme.textSecondary }]}>ATTENDANCE</Text>
        <View style={styles.onlyYou}>
          <Feather name="lock" size={11} color={theme.textSecondary} />
          <Text style={[styles.onlyYouText, { color: theme.textSecondary }]}>Only you</Text>
        </View>
      </View>
      <View style={[cardStyle, { backgroundColor: theme.card }]}>
        <View style={styles.body}>
          {loading ? (
            <ActivityIndicator color={theme.primary} style={{ paddingVertical: 12 }} />
          ) : !/^\d{4}-\d{2}-\d{2}$/.test(semesterStartISO) ? (
            <Text style={[styles.note, { color: theme.textSecondary }]}>
              Set up your semester dates to see your attendance.
            </Text>
          ) : failed ? (
            <Pressable onPress={() => { setLoading(true); void load(); }}>
              <Text style={[styles.note, { color: theme.textSecondary }]}>
                Couldn't load your attendance. Tap to try again.
              </Text>
            </Pressable>
          ) : !hasAny ? (
            <Text style={[styles.note, { color: theme.textSecondary }]}>
              Answer your class check-ins and your attendance shows up here.
            </Text>
          ) : (
            <>
              <Pressable
                style={({ pressed }) => [styles.summaryRow, pressed && { opacity: 0.7 }]}
                onPress={() => setOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={open ? 'Hide attendance details' : 'Show attendance details'}
              >
                <Text style={[styles.bigPercent, { color: theme.text }]}>
                  {overall!.percent == null ? '–' : `${overall!.percent}%`}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.summaryMain, { color: theme.text }]}>
                    {overall!.present} of {overall!.present + overall!.absent} classes
                  </Text>
                  {foldHint ? (
                    <View style={styles.warningRow}>
                      <Feather name="alert-triangle" size={12} color={foldHint.color} />
                      <Text style={[styles.warningText, { color: foldHint.color }]}>{foldHint.text}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.summarySub, { color: theme.textSecondary }]}>This semester</Text>
                  )}
                </View>
                <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textSecondary} />
              </Pressable>

              {open ? (
              <>

              <View style={styles.countsRow}>
                {[
                  { label: 'Present', value: overall!.present, color: theme.success },
                  { label: 'Absent', value: overall!.absent, color: theme.danger },
                  { label: 'Cancelled', value: overall!.cancelled, color: theme.text },
                  { label: 'Not answered', value: overall!.notAnswered, color: theme.textSecondary },
                ].map((c) => (
                  <View key={c.label} style={[styles.countBox, { backgroundColor: theme.backgroundSecondary }]}>
                    <Text style={[styles.countValue, { color: c.color }]}>{c.value}</Text>
                    <Text style={[styles.countLabel, { color: theme.textSecondary }]} numberOfLines={1}>
                      {c.label}
                    </Text>
                  </View>
                ))}
              </View>

              {subjects.map((s) => {
                const warning = subjectWarning(s, rule);
                const counted = s.present + s.absent;
                const color = statusColor(warning?.level ?? null);
                return (
                  <View key={s.key} style={[styles.subjectRow, { borderTopColor: theme.border }]}>
                    <View style={styles.subjectHead}>
                      <Text style={[styles.subjectName, { color: theme.text }]} numberOfLines={1}>
                        <Text style={{ fontWeight: '700' }}>{s.code || s.name}</Text>
                        {s.code && s.name ? (
                          <Text style={{ color: theme.textSecondary }}>{` · ${s.name}`}</Text>
                        ) : null}
                      </Text>
                      <Text style={[styles.subjectCount, { color: warning ? color : theme.text }]}>
                        {isUitm ? `${s.absent} absent` : `${s.present}/${counted}`}
                      </Text>
                    </View>
                    <View style={[styles.bar, { backgroundColor: theme.backgroundSecondary }]}>
                      <View
                        style={[
                          styles.barFill,
                          { backgroundColor: color, width: `${counted > 0 ? Math.round((s.present / counted) * 100) : 0}%` },
                        ]}
                      />
                    </View>
                    {warning ? (
                      <View style={styles.warningRow}>
                        <Feather name="alert-triangle" size={12} color={color} />
                        <Text style={[styles.warningText, { color }]}>{warning.text}</Text>
                      </View>
                    ) : s.notAnswered > 0 ? (
                      <Text style={[styles.notAnswered, { color: theme.textSecondary }]}>
                        {s.notAnswered} not answered
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              </>
              ) : null}
            </>
          )}

          {open && hasAny && !loading && !failed ? (
          <>
          <View style={[styles.limitRow, { borderTopColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.limitLabel, { color: theme.text }]}>Warn me at</Text>
              <Text style={[styles.limitHint, { color: theme.textSecondary }]}>
                {isUitm
                  ? 'UiTM: 3 absences in one subject can bring a warning letter.'
                  : 'The lowest attendance your university allows.'}
              </Text>
            </View>
            <Pressable
              onPress={() => changeLimit(-1)}
              hitSlop={8}
              style={[styles.stepBtn, { borderColor: theme.border }]}
              accessibilityLabel="Lower the warning limit"
            >
              <Feather name="minus" size={16} color={theme.text} />
            </Pressable>
            <Text style={[styles.limitValue, { color: theme.text }]}>
              {isUitm ? `${limits.absences} absences` : `${limits.percent}%`}
            </Text>
            <Pressable
              onPress={() => changeLimit(1)}
              hitSlop={8}
              style={[styles.stepBtn, { borderColor: theme.border }]}
              accessibilityLabel="Raise the warning limit"
            >
              <Feather name="plus" size={16} color={theme.text} />
            </Pressable>
          </View>

          <Text style={[styles.footnote, { color: theme.textSecondary }]}>
            {checkinsOn
              ? "From your class check-ins. Cancelled classes don't count."
              : 'Class check-ins are off, so new classes are not recorded. Turn them on in Settings → Notifications.'}
          </Text>
          </>
          ) : null}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  onlyYou: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 20, marginBottom: 8 },
  onlyYouText: { fontSize: 12 },
  body: { paddingVertical: 14, paddingHorizontal: 16 },
  note: { fontSize: 14, lineHeight: 20 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bigPercent: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  summaryMain: { fontSize: 16, fontWeight: '600' },
  summarySub: { fontSize: 13, marginTop: 2 },
  countsRow: { flexDirection: 'row', gap: 6, marginTop: 14, marginBottom: 6 },
  countBox: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  countValue: { fontSize: 17, fontWeight: '700' },
  countLabel: { fontSize: 10, marginTop: 1 },
  subjectRow: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  subjectHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  subjectName: { fontSize: 14, flexShrink: 1 },
  subjectCount: { fontSize: 14, fontWeight: '600' },
  bar: { height: 6, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  warningText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  notAnswered: { fontSize: 12, marginTop: 5 },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  limitLabel: { fontSize: 15 },
  limitHint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  limitValue: { fontSize: 14, fontWeight: '600', minWidth: 74, textAlign: 'center' },
  footnote: { fontSize: 11, marginTop: 12, lineHeight: 15 },
});

import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import {
  peakWeekFromTaskCounts,
  taskTeachingWeekForWorkload,
  workloadVelocityPointsByWeek,
} from '@/src/lib/academicWeek';
import { displayPortalSemester, PROFILE_PLACEHOLDER } from '@/src/lib/profileDisplay';

/** Pull portal / teaching-week copy left to match card edges (same as content `paddingHorizontal`). */
const HEADER_META_LEFT_OUTDENT = 44 + 6;

export default function StressMap() {
  const { user, tasks, courses, academicCalendar, language } = useApp();
  const T = useTranslations(language);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const totalWeeks = academicCalendar?.totalWeeks ?? 14;
  const weeks = useMemo(() => Array.from({ length: totalWeeks }, (_, i) => i + 1), [totalWeeks]);

  /** Task count per week: calendar due-week, but if SOW suggestedWeek is earlier than that week, use suggestedWeek. */
  const weeklyTotals = useMemo(
    () => workloadVelocityPointsByWeek(tasks, academicCalendar, 'all', user.startDate),
    [tasks, academicCalendar, user.startDate],
  );

  const { week: highestWeek, max: maxLoadInAnyWeek } = useMemo(
    () => peakWeekFromTaskCounts(weeklyTotals),
    [weeklyTotals],
  );

  const maxTotal = Math.max(0, ...weeklyTotals);
  /** Max bar height inside the chart row (labels sit below). */
  const VELOCITY_BAR_MAX_PX = 96;

  const tasksOutsideTeachingWindow = useMemo(() => {
    let n = 0;
    for (const t of tasks) {
      if (taskTeachingWeekForWorkload(t, academicCalendar, user.startDate) == null) n += 1;
    }
    return n;
  }, [tasks, academicCalendar, user.startDate]);

  const avgStress = useMemo(() => {
    const sum = weeklyTotals.reduce((a, b) => a + b, 0);
    return (sum / totalWeeks).toFixed(1);
  }, [weeklyTotals, totalWeeks]);

  const isPeakWave =
    maxLoadInAnyWeek >= 3 &&
    highestWeek > 0 &&
    user.currentWeek === highestWeek &&
    (user.semesterPhase ?? 'teaching') === 'teaching' &&
    !user.isBreak;

  const programLine = useMemo(() => {
    const prog = (user.program || '').trim() || '—';
    const short = prog.length > 48 ? `${prog.slice(0, 45)}…` : prog;
    const sem = displayPortalSemester(user.currentSemester);
    if (sem !== PROFILE_PLACEHOLDER) {
      return `${T('portalSemester')} ${sem} • ${short}`;
    }
    return short;
  }, [user.currentSemester, user.program, language, T]);

  const subjectLevels = useMemo(() => {
    const cw = user.currentWeek;
    const byCourse: Record<string, number> = {};
    for (const t of tasks) {
      if (t.isDone) continue;
      const w = taskTeachingWeekForWorkload(t, academicCalendar, user.startDate);
      if (w !== cw) continue;
      byCourse[t.courseId] = (byCourse[t.courseId] || 0) + 1;
    }
    const maxC = Math.max(...Object.values(byCourse), 0);
    return courses.map((c) => {
      const n = byCourse[c.id] ?? 0;
      const level = maxC > 0 ? Math.min(10, (n / maxC) * 10) : 0;
      return { id: c.id, level, count: n };
    });
  }, [tasks, courses, academicCalendar, user.currentWeek, user.startDate]);

  const levels = useMemo(
    () =>
      subjectLevels.reduce(
        (acc, { id, level }) => ({ ...acc, [id]: level }),
        {} as Record<string, number>,
      ),
    [subjectLevels],
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.headerTextCol}>
          <Text style={[styles.title, { color: theme.text }]}>SOW Intelligence</Text>
          <View style={[styles.headerMetaFlush, { marginLeft: -HEADER_META_LEFT_OUTDENT }]}>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{programLine}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.velocityCard, { backgroundColor: theme.primary }]}>
        <View style={styles.velocityHeader}>
          <View>
            <Text style={styles.velocityLabel}>WORKLOAD VELOCITY</Text>
            <View style={styles.criticalRow}>
              <View
                style={[
                  styles.criticalDot,
                  { backgroundColor: isPeakWave ? '#ef4444' : '#22c55e' },
                ]}
              />
              <Text style={styles.criticalText}>
                {isPeakWave ? T('workloadPeakWave') : T('workloadSteady')}
              </Text>
            </View>
            <Text style={styles.velocityScopeText}>{T('workloadVelocityAllTypes')}</Text>
          </View>
          <View style={styles.scaleRange}>
            <Text style={styles.scaleW14}>W{totalWeeks}</Text>
            <Text style={styles.scaleLabel}>SCALE RANGE</Text>
          </View>
        </View>
        <View style={styles.barChart}>
          {weeks.map((w) => {
            const total = weeklyTotals[w - 1] ?? 0;
            const isCurrent = w === user.currentWeek;
            // No "ghost" height for empty weeks — only weeks with due tasks show a bar.
            // Proportional to max week so e.g. 1 task vs 2 tasks reads as half height.
            const barH =
              maxTotal === 0 || total === 0
                ? 0
                : Math.max(1, Math.round((total / maxTotal) * VELOCITY_BAR_MAX_PX));
            return (
              <View key={w} style={styles.barCol}>
                <View
                  style={[
                    styles.barBg,
                    barH > 0 ? { height: barH } : styles.barBgEmpty,
                    isCurrent && barH > 0 && styles.barCurrentRing,
                  ]}
                />
                <Text
                  style={[styles.barWeekLabel, isCurrent && styles.barWeekLabelCurrent]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  W{w}
                </Text>
              </View>
            );
          })}
        </View>
        {maxLoadInAnyWeek === 0 ? (
          <Text style={styles.emptyHint}>{T('tasksPulseNoTasks')}</Text>
        ) : null}
        {tasksOutsideTeachingWindow > 0 ? (
          <Text style={[styles.emptyHint, { marginTop: 8 }]}>
            {T('stressMapTasksOutsideRange')
              .replace('{count}', String(tasksOutsideTeachingWindow))
              .replace('{total}', String(totalWeeks))}
          </Text>
        ) : null}
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>AVG. LOAD / WK</Text>
          <Text style={[styles.summaryValue, { color: theme.text }]}>{avgStress}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>HIGHEST WEEK</Text>
          <Text
            style={[
              styles.summaryValue,
              maxLoadInAnyWeek > 0 ? styles.summaryValueRed : { color: theme.text },
            ]}
          >
            {maxLoadInAnyWeek > 0
              ? `W${highestWeek} (${Number.isInteger(maxLoadInAnyWeek) ? maxLoadInAnyWeek : maxLoadInAnyWeek.toFixed(1)})`
              : '—'}
          </Text>
        </View>
      </View>

      <View style={styles.breakdownSection}>
        <View style={styles.breakdownHeader}>
          <Text style={[styles.breakdownTitle, { color: theme.text }]}>SUBJECT LOAD (THIS WEEK)</Text>
          <Text style={[styles.breakdownAi, { color: theme.textSecondary }]}>TASK SYNC</Text>
        </View>
        {courses.length === 0 ? (
          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>No subjects yet. Add courses or connect your timetable.</Text>
        ) : (
          courses.map((course) => {
            const level = levels[course.id] ?? 0;
            const count = subjectLevels.find((s) => s.id === course.id)?.count ?? 0;
            const segmentCount = 10;
            const activeIndex =
              count === 0 ? -1 : Math.min(segmentCount - 1, Math.max(0, Math.floor(level)));
            return (
              <View key={course.id} style={styles.subjectRow}>
                <View style={styles.subjectTopRow}>
                  <Text style={[styles.subjectCode, { color: theme.text }]}>{course.id}</Text>
                  <Text style={[styles.levelText, { color: theme.textSecondary }]}>
                    LEVEL {level.toFixed(1)}
                  </Text>
                </View>
                <View style={styles.segmentBar}>
                  {Array.from({ length: segmentCount }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.segment,
                        { backgroundColor: theme.border },
                        activeIndex >= 0 && i === activeIndex && { backgroundColor: theme.primary },
                      ]}
                    />
                  ))}
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    /** Keep in sync with HEADER_META_LEFT_OUTDENT (back width + this gap). */
    gap: 6,
  },
  /** Title: vertical nudge vs 44px back control. */
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: 7,
  },
  /** Subcopy only: outdent so left edge lines up with WORKLOAD card (scroll content inset). */
  headerMetaFlush: {
    alignSelf: 'stretch',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.5,
    lineHeight: 15,
  },

  velocityCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  velocityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  velocityLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.2,
  },
  criticalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  criticalDot: { width: 8, height: 8, borderRadius: 4 },
  criticalText: { fontSize: 12, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  velocityScopeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.72)',
    marginTop: 8,
    maxWidth: 220,
    lineHeight: 14,
  },
  scaleRange: { alignItems: 'flex-end' },
  scaleW14: { fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: -0.5 },
  scaleLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
  },
  barCol: {
    flex: 1,
    minWidth: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 1,
  },
  barBg: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 999,
    minHeight: 0,
  },
  /** Placeholder slot when count is 0 — no fill so empty weeks are not mistaken for workload. */
  barBgEmpty: {
    height: 0,
    backgroundColor: 'transparent',
  },
  /** Highlight current teaching week without a solid fill (that read as “full load”). */
  barCurrentRing: {
    backgroundColor: 'rgba(255,255,255,0.38)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  barWeekLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
    minWidth: 22,
    textAlign: 'center',
  },
  barWeekLabelCurrent: {
    color: '#ffffff',
    fontWeight: '800',
  },
  emptyHint: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },

  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  summaryValueRed: {
    color: '#dc2626',
  },

  breakdownSection: {},
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  breakdownTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  breakdownAi: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subjectRow: {
    marginBottom: 18,
  },
  subjectTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectCode: {
    fontSize: 14,
    fontWeight: '800',
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  segmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },
});

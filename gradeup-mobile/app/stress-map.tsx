import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';
import { useTheme, useThemePack } from '@/hooks/useTheme';
import {
  peakWeekFromTaskCounts,
  resolveDisplayTeachingWeeks,
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
  const themePack = useThemePack();
  const isMonoTheme = themePack === 'mono';
  const insets = useSafeAreaInsets();

  const totalWeeks = useMemo(
    () => resolveDisplayTeachingWeeks(academicCalendar, user.startDate, tasks),
    [academicCalendar, user.startDate, tasks],
  );
  const chartCalendar = useMemo(
    () => (academicCalendar ? { ...academicCalendar, totalWeeks } : null),
    [academicCalendar, totalWeeks],
  );
  const weeks = useMemo(() => Array.from({ length: totalWeeks }, (_, i) => i + 1), [totalWeeks]);

  /** Task count per week: calendar due-week, but if SOW suggestedWeek is earlier than that week, use suggestedWeek. */
  const weeklyTotals = useMemo(
    () => workloadVelocityPointsByWeek(tasks, chartCalendar, 'all', user.startDate),
    [tasks, chartCalendar, user.startDate],
  );

  const { week: highestWeek, max: maxLoadInAnyWeek } = useMemo(
    () => peakWeekFromTaskCounts(weeklyTotals),
    [weeklyTotals],
  );

  const maxTotal = Math.max(0, ...weeklyTotals);
  /** Whether any week draws a bar at all — the chart collapses when none does. */
  const hasAnyBar = maxTotal > 0;
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
    return courses.map((c) => {
      const n = byCourse[c.id] ?? 0;
      const level = Math.min(10, n * 2);
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

      <View
        style={[
          styles.velocityCard,
          { backgroundColor: isMonoTheme ? '#0f0f0f' : theme.primary, borderColor: isMonoTheme ? '#2a2a2a' : 'transparent' },
        ]}
      >
        <View style={styles.velocityHeader}>
          <View>
            <Text style={[styles.velocityLabel, isMonoTheme && { color: '#f5f5f5' }]}>WORKLOAD VELOCITY</Text>
            <View style={styles.criticalRow}>
              <View
                style={[
                  styles.criticalDot,
                  { backgroundColor: isPeakWave ? '#ef4444' : '#22c55e' },
                ]}
              />
              <Text style={[styles.criticalText, isMonoTheme && { color: '#e5e5e5' }]}>
                {isPeakWave ? T('workloadPeakWave') : T('workloadSteady')}
              </Text>
            </View>
          </View>
        </View>
        {/* Bars, baseline and week labels are three stacked rows rather than a
            label tucked under each bar, so the axis can be drawn as one
            unbroken rule. Without it the labels floated in mid-card and, with
            no scheme of work loaded, the chart read as a blank blue panel. */}
        <View style={[styles.barChart, !hasAnyBar && styles.barChartEmpty]}>
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
              </View>
            );
          })}
        </View>
        <View style={[styles.chartBaseline, isMonoTheme && { backgroundColor: 'rgba(255,255,255,0.18)' }]} />
        <View style={styles.axisRow}>
          {weeks.map((w) => (
            <View key={w} style={styles.barCol}>
              <Text
                style={[
                  styles.barWeekLabel,
                  w === user.currentWeek && styles.barWeekLabelCurrent,
                  isMonoTheme && { color: '#d4d4d4' },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                W{w}
              </Text>
            </View>
          ))}
        </View>
        {maxLoadInAnyWeek === 0 ? (
          /* Was a plain Text reading "Add sow". It looked tappable, did
             nothing, and borrowed tasksPulseNoTasks — a string the Home screen
             uses to mean "no tasks", so it could not be reworded without
             changing Home too. Now a real button to the same place as
             Settings > Scheme of work. */
          <Pressable
            onPress={() => router.push('/upload-sow' as any)}
            accessibilityRole="button"
            accessibilityLabel={T('stressMapAddSow')}
            hitSlop={8}
            style={({ pressed }) => [styles.addSowBtn, pressed && { opacity: 0.75 }]}
          >
            <Feather name="plus" size={15} color={isMonoTheme ? '#e5e5e5' : '#FFFFFF'} />
            <Text style={[styles.addSowText, isMonoTheme && { color: '#e5e5e5' }]}>
              {T('stressMapAddSow')}
            </Text>
          </Pressable>
        ) : null}
        {tasksOutsideTeachingWindow > 0 ? (
          /* On its own panel with an icon, left-aligned. Centred white-on-blue
             paragraph read as part of the card's own copy, so a warning about
             the student's dates looked like a description of the chart. */
          <View style={[styles.noteRow, isMonoTheme && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
            <Feather
              name="alert-circle"
              size={14}
              color={isMonoTheme ? '#a3a3a3' : 'rgba(255,255,255,0.9)'}
              style={styles.noteIcon}
            />
            <Text style={[styles.noteText, isMonoTheme && { color: '#a3a3a3' }]}>
              {T('stressMapTasksOutsideRange')
                .replace('{count}', String(tasksOutsideTeachingWindow))
                .replace('{total}', String(totalWeeks))}
            </Text>
          </View>
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
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 104,
  },
  /**
   * With no bars to draw there is nothing for 104pt of height to hold, and the
   * card became a blank blue block with the week labels stranded at the foot of
   * it. A short baseline instead reads as "an axis, waiting for data".
   */
  barChartEmpty: { height: 18 },
  chartBaseline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 1,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
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
    textAlign: 'center',
    // No minWidth: fourteen 22pt labels are wider than the card, which is what
    // pushed W10-W14 into each other. The column already sets the width.
  },
  barWeekLabelCurrent: {
    color: '#ffffff',
    fontWeight: '800',
  },
  addSowBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  addSowText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyHint: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  noteIcon: { marginTop: 1 },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    color: 'rgba(255,255,255,0.95)',
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

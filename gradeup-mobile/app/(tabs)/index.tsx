import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { Priority } from '@/src/types';
import { formatDisplayDate } from '@/src/utils/date';
import { useTranslations } from '@/src/i18n';

const TOTAL_WEEKS = 14;
const WEEKDAY_TO_NUM: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

function getDaysLeft(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T23:59:59');
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

function getDueTimeLabelRaw(dueDate: string): { key: 'overdue' | 'dueToday' | 'tomorrow' | 'daysLeft'; days: number } {
  const days = getDaysLeft(dueDate);
  if (days < 0) return { key: 'overdue', days };
  if (days === 0) return { key: 'dueToday', days };
  if (days === 1) return { key: 'tomorrow', days };
  return { key: 'daysLeft', days };
}

export default function Dashboard() {
  const { user, tasks, courses, revisionSettingsList, completedStudyKeys, getSubjectColor, language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const pending = tasks.filter((t) => !t.isDone);
  const high = pending.filter((t) => t.priority === Priority.High).sort(
    (a, b) => new Date(a.dueDate + 'T' + a.dueTime).getTime() - new Date(b.dueDate + 'T' + b.dueTime).getTime()
  );
  const nextTask = high[0] || pending[0];

  const peakWeek = useMemo(() => {
    let max = 0;
    let peak = TOTAL_WEEKS;
    for (let w = 0; w < TOTAL_WEEKS; w++) {
      const total = courses.reduce((sum, c) => sum + (c.workload?.[w] ?? 0), 0);
      if (total > max) { max = total; peak = w + 1; }
    }
    return peak;
  }, [courses]);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);
  const in30Str = in30Days.toISOString().slice(0, 10);

  const deadlineItems = tasks
    .filter((t) => !t.isDone && t.dueDate >= todayStr && t.dueDate <= in30Str)
    .map((t) => ({
      date: t.dueDate,
      time: t.dueTime,
      code: t.courseId,
      room: T('onlineSubmission'),
      type: 'DEADLINE' as const,
      name: t.title,
    }));

  const studyItems: { studyKey: string; date: string; time: string; code: string; room: string; type: 'STUDY'; name: string }[] = [];
  for (const revisionSettings of revisionSettingsList) {
    if (!revisionSettings.time) continue;
    const [h, m] = revisionSettings.time.split(':').map((x) => parseInt(x, 10) || 0);
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const subject = revisionSettings.subjectId || 'Study';
    const topic = revisionSettings.topic ? ` • ${revisionSettings.topic}` : '';
    if (revisionSettings.repeat === 'once' && revisionSettings.singleDate) {
      const dateStr = revisionSettings.singleDate;
      if (dateStr >= todayStr && dateStr <= in30Str) {
        studyItems.push({ studyKey: `${dateStr}T${timeStr}`, date: dateStr, time: timeStr, code: subject, room: `${revisionSettings.durationMinutes} min${topic}`, type: 'STUDY', name: T('timeToStudy') });
      }
    } else {
      const targetWeekday = revisionSettings.day === 'Every day' ? null : WEEKDAY_TO_NUM[revisionSettings.day];
      for (let d = 0; d <= 30; d++) {
        const dte = new Date(now);
        dte.setDate(dte.getDate() + d);
        const dateStr = dte.toISOString().slice(0, 10);
        if (dateStr < todayStr) continue;
        if (dateStr > in30Str) break;
        const dayNum = dte.getDay();
        if (targetWeekday === null || dayNum === targetWeekday) {
          studyItems.push({ studyKey: `${dateStr}T${timeStr}`, date: dateStr, time: timeStr, code: subject, room: `${revisionSettings.durationMinutes} min${topic}`, type: 'STUDY', name: T('timeToStudy') });
        }
      }
    }
  }

  const scheduleWithinMonth = [...deadlineItems, ...studyItems].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.time.localeCompare(b.time);
  });

  const formatDateLabel = (dateStr: string) => formatDisplayDate(dateStr);

  const headerBg = theme.primary;
  const headerText = '#f8fafc';
  const headerSubtext = 'rgba(248, 250, 252, 0.85)';
  const accent = theme.accent;
  const cardBg = theme.card;
  const cardBorder = theme.border;
  const surface = theme.background;
  const boxTone = theme.backgroundSecondary;
  const text = theme.text;
  const textSecondary = theme.textSecondary;
  const sage = theme.accent2;
  const overdue = theme.danger;

  return (
    <ScrollView style={[styles.container, { backgroundColor: surface }]} contentContainerStyle={styles.content}>
      {/* Header: greeting + week + profile + week peak alert (white box) */}
      <View style={[styles.headerWrap, { backgroundColor: headerBg }]}>
        <Image
          source={require('../../assets/images/wave-texture.png')}
          style={[StyleSheet.absoluteFillObject, styles.waveTexture]}
          resizeMode="cover"
        />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0, 51, 102, 0.45)', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }]} />
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: headerText }]}>{T('hello')}, {user.name.split(' ')[0]}</Text>
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: accent }]} />
              <Text style={[styles.subtitle, { color: headerSubtext }]}>{T('part')} {user.part} • {T('week')} {user.currentWeek}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Pressable onPress={() => router.push('/profile-settings' as any)}>
              <ThemeIcon name="user" size={22} color={headerText} />
            </Pressable>
          </View>
        </View>
        {/* Week peak alert – compact white box inside header */}
        <Pressable
          style={({ pressed }) => [styles.peakAlertBox, pressed && styles.pressed]}
          onPress={() => router.push('/stress-map' as any)}
        >
          <View style={styles.peakAlertTop}>
            <View style={styles.peakAlertLeft}>
              <Text style={styles.peakAlertWeek}>{T('week')} {user.currentWeek}</Text>
              <Text style={styles.peakAlertLabel}>{T('semesterPulse')}</Text>
            </View>
            <View style={styles.peakAlertBadge}>
              <Text style={styles.peakAlertBadgeText}>W{peakWeek} {T('peakAlert')}</Text>
            </View>
          </View>
          <View style={styles.peakAlertBottom}>
            <Text style={styles.peakAlertProgressLabel}>{T('progress')}</Text>
            <Text style={styles.peakAlertFinalLabel}>W{TOTAL_WEEKS} {T('final')}</Text>
          </View>
          <View style={styles.peakAlertDots}>
            {Array.from({ length: TOTAL_WEEKS }, (_, i) => {
              const weekNum = i + 1;
              const isCurrent = weekNum === user.currentWeek;
              return (
                <View
                  key={weekNum}
                  style={[
                    styles.peakAlertDot,
                    isCurrent && styles.peakAlertDotCurrent,
                    weekNum < user.currentWeek && styles.peakAlertDotPast,
                  ]}
                />
              );
            })}
          </View>
        </Pressable>
      </View>

      {/* Today's focus */}
      <View style={[styles.sectionBox, styles.sectionBoxFirst, { backgroundColor: boxTone, borderColor: cardBorder }]}>
        <Text style={[styles.sectionBoxTitle, { color: textSecondary }]}>{T('todaysFocus')}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.focusCard,
            {
              backgroundColor: cardBg,
              borderColor: cardBorder,
              borderLeftWidth: nextTask ? 4 : 1,
              borderLeftColor: nextTask ? getSubjectColor(nextTask.courseId) : cardBorder,
            },
            pressed && styles.pressed,
          ]}
          onPress={() => router.push('/(tabs)/planner' as any)}
        >
          {nextTask ? (
            <>
              <View style={styles.focusPillsRow}>
                <View style={[styles.focusCoursePill, { backgroundColor: getSubjectColor(nextTask.courseId) + '18' }]}>
                  <Text style={[styles.focusCoursePillText, { color: getSubjectColor(nextTask.courseId) }]}>{nextTask.courseId}</Text>
                </View>
                <View style={[
                  styles.focusStatusPill,
                  { backgroundColor: getDaysLeft(nextTask.dueDate) < 0 ? overdue + '18' : accent + '18' },
                ]}
                >
                  <Text style={[
                    styles.focusStatusPillText,
                    { color: getDaysLeft(nextTask.dueDate) < 0 ? overdue : accent },
                  ]}
                  >
                    {(() => {
                      const info = getDueTimeLabelRaw(nextTask.dueDate);
                      if (info.key === 'daysLeft') return `${info.days} ${T('daysLeft')}`;
                      return T(info.key);
                    })()}
                  </Text>
                </View>
              </View>
              <Text style={[styles.focusTitle, { color: text }]} numberOfLines={2}>{nextTask.title}</Text>
              <View style={styles.focusMetaRow}>
                <ThemeIcon name="calendar" size={13} color={textSecondary} />
                <Text style={[styles.focusMetaText, { color: textSecondary }]}>
                  {formatDisplayDate(nextTask.dueDate)} · {nextTask.dueTime}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.focusEmptyWrap}>
              <Text style={[styles.focusEmpty, { color: textSecondary }]}>{T('noTasksToday')}</Text>
              <Text style={[styles.focusEmptySub, { color: accent }]}>{T('youreAllSet')}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Timeline / Upcoming */}
      <View style={[styles.sectionBox, { backgroundColor: boxTone, borderColor: cardBorder }]}>
        <View style={styles.timelineHeader}>
          <Text style={[styles.timelineTitle, { color: text }]}>{T('upcoming')}</Text>
          <Pressable onPress={() => router.push('/(tabs)/planner' as any)}>
            <Text style={[styles.seeAll, { color: accent }]}>{T('seeAll')}</Text>
          </Pressable>
        </View>
        <View style={styles.timelineList}>
          {scheduleWithinMonth.length === 0 ? (
            <View style={[styles.timelineCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text style={[styles.timelineMeta, { color: textSecondary }]}>{T('nothingIn30Days')}</Text>
            </View>
          ) : (
            scheduleWithinMonth.map((item, idx) => {
              const showDateHeader = idx === 0 || scheduleWithinMonth[idx - 1].date !== item.date;
              const isStudy = item.type === 'STUDY';
              const studyDone = isStudy && completedStudyKeys.includes((item as { studyKey?: string }).studyKey ?? '');
              const badgeColor = studyDone ? sage : accent;
              return (
                <View key={`${item.type}-${item.date}-${item.time}-${idx}`}>
                  {showDateHeader && (
                    <Text style={[styles.timelineDateHeader, { color: accent }, idx > 0 && { marginTop: 16 }]}>{formatDateLabel(item.date)}</Text>
                  )}
                  <View style={styles.timelineItem}>
                    <View style={[styles.timelineDot, { backgroundColor: cardBg, borderColor: studyDone ? sage : isStudy ? accent : getSubjectColor(item.code) }]} />
                    <View style={[
                      styles.timelineCard,
                      { backgroundColor: cardBg, borderColor: cardBorder, position: 'relative', overflow: 'hidden' },
                    ]}>
                      <View style={[styles.subjectDot, { backgroundColor: studyDone ? sage : isStudy ? accent : getSubjectColor(item.code) }]} />
                      <View style={styles.timelineCardTop}>
                        <Text style={[styles.timelineTime, { color: textSecondary }]}>{item.time}</Text>
                        <View style={[styles.typeBadge, { backgroundColor: badgeColor + '22' }]}>
                          <Text style={[styles.typeBadgeText, { color: badgeColor }]}>{studyDone ? 'DONE' : item.type}</Text>
                        </View>
                      </View>
                      <Text style={[styles.timelineName, { color: text }, studyDone && { textDecorationLine: 'line-through', color: textSecondary }]}>{item.name}</Text>
                      <Text style={[styles.timelineMeta, { color: textSecondary }]}>{item.code} • {item.room}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 0, paddingBottom: 100 },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 55,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  // Week peak alert – white box inside header
  peakAlertBox: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginTop: 22,
    zIndex: 1,
  },
  peakAlertTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  peakAlertLeft: {},
  peakAlertWeek: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  peakAlertLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  peakAlertBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  peakAlertBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.4,
  },
  peakAlertBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 10,
  },
  peakAlertProgressLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1.2,
  },
  peakAlertFinalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  peakAlertDots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  peakAlertDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e2e8f0',
  },
  peakAlertDotCurrent: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#f59e0b',
  },
  peakAlertDotPast: {
    backgroundColor: '#94a3b8',
  },
  waveTexture: {
    opacity: 0.5,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 1 },
  greeting: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  subtitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  pressed: { opacity: 0.96 },

  // Focus card
  focusCard: {
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  focusPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  focusCoursePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  focusCoursePillText: { fontSize: 12, fontWeight: '700' },
  focusStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  focusStatusPillText: { fontSize: 12, fontWeight: '700' },
  focusTitle: { fontSize: 17, fontWeight: '800', lineHeight: 23, marginBottom: 10 },
  focusMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  focusMetaText: { fontSize: 12, fontWeight: '500' },
  focusEmptyWrap: { alignItems: 'center', paddingVertical: 16 },
  focusEmpty: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  focusEmptySub: { fontSize: 13, fontWeight: '700' },

  // Sections
  sectionBox: { marginHorizontal: 14, marginBottom: 24, padding: 20, borderRadius: 22, borderWidth: 1 },
  sectionBoxFirst: { marginTop: 20 },
  sectionBoxTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 14 },

  // Timeline
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  timelineTitle: { fontSize: 16, fontWeight: '800' },
  seeAll: { fontSize: 13, fontWeight: '700' },
  timelineList: { marginLeft: 8 },
  timelineDateHeader: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  timelineItem: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 6 },
  timelineCard: { flex: 1, padding: 16, borderRadius: 18, borderWidth: 1 },
  subjectDot: { position: 'absolute', top: 0, right: 14, width: 14, height: 22, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  timelineCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  timelineTime: { fontSize: 11, fontWeight: '700' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  typeBadgeText: { fontSize: 9, fontWeight: '800' },
  timelineName: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  timelineMeta: { fontSize: 10, fontWeight: '600', marginTop: 4 },
});

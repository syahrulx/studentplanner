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
  const nextTask = useMemo(() => {
    const incomplete = tasks.filter((t) => !t.isDone);
    if (incomplete.length === 0) return undefined;
    const sorted = [...incomplete].sort(
      (a, b) => new Date(a.dueDate + 'T' + (a.dueTime || '23:59')).getTime() - new Date(b.dueDate + 'T' + (b.dueTime || '23:59')).getTime()
    );
    return sorted[0];
  }, [tasks]);

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
      priority: t.priority,
      daysLeft: getDaysLeft(t.dueDate),
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

  // White box with shadow; outline colour by due-date
  const CARD_BG_WHITE = '#ffffff';
  const getBorderColorByDueProximity = (daysLeft: number) => {
    if (daysLeft < 0 || daysLeft <= 3) return '#dc2626';
    if (daysLeft <= 14) return '#eab308';
    return '#22c55e';
  };

  const getPriorityLabel = (p: Priority) => (p === Priority.High ? T('high') : p === Priority.Medium ? T('medium') : T('low'));

  // Hardcoded theme – matching planner page navy/gold palette
  const NAVY = '#003366';
  const GOLD = '#f59e0b';
  const BG = '#f8fafc';
  const CARD_BG = '#ffffff';
  const CARD_BORDER = '#e2e8f0';
  const TEXT_PRIMARY = '#1A1C1E';
  const TEXT_SECONDARY = '#8E9AAF';
  const OVERDUE_COLOR = '#dc2626';

  return (
    <ScrollView style={[styles.container, { backgroundColor: BG }]} contentContainerStyle={styles.content}>
      {/* Header: greeting + week + profile + week peak alert (white box) */}
      <View style={[styles.headerWrap, { backgroundColor: NAVY }]}>
        <Image
          source={require('../../assets/images/wave-texture.png')}
          style={[StyleSheet.absoluteFillObject, styles.waveTexture]}
          resizeMode="cover"
        />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0, 51, 102, 0.45)', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }]} />
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: '#f8fafc' }]}>{T('hello')}, {user.name.split(' ')[0]}</Text>
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: GOLD }]} />
              <Text style={[styles.subtitle, { color: 'rgba(248,250,252,0.85)' }]}>
                {T('part')} {user.part} • {user.isBreak ? T('semesterBreak') || 'Semester Break' : `${T('week')} ${user.currentWeek}`}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Pressable onPress={() => router.push('/profile-settings' as any)}>
              <ThemeIcon name="user" size={22} color="#f8fafc" />
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
              <Text style={styles.peakAlertWeek}>
                {user.isBreak ? T('semesterBreak') || 'Semester Break' : `${T('week')} ${user.currentWeek}`}
              </Text>
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
      <View style={[styles.sectionWrapper, styles.sectionWrapperFirst]}>
        <Text style={[styles.sectionHeader, { color: NAVY }]}>{T('todaysFocus')}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.focusCard,
            pressed && styles.pressed,
            { backgroundColor: CARD_BG_WHITE },
            { borderWidth: 1.5, borderColor: nextTask ? getBorderColorByDueProximity(getDaysLeft(nextTask.dueDate)) : '#e2e8f0' },
          ]}
          onPress={() => router.push('/(tabs)/planner' as any)}
        >
          {nextTask ? (
            <>
              <View style={styles.focusPillsRow}>
                <View style={[styles.focusCoursePill, { backgroundColor: getSubjectColor(nextTask.courseId) + '25' }]}>
                  <Text style={[styles.focusCoursePillText, { color: getSubjectColor(nextTask.courseId) }]}>{nextTask.courseId}</Text>
                </View>
              </View>
              <Text style={[styles.focusTitle, { color: TEXT_PRIMARY }]} numberOfLines={2}>{nextTask.title}</Text>
              <View style={styles.focusMetaRow}>
                <ThemeIcon name="calendar" size={13} color={TEXT_SECONDARY} />
                <Text style={[styles.focusMetaText, { color: TEXT_SECONDARY }]}>
                  {formatDisplayDate(nextTask.dueDate)} · {(nextTask.dueTime || '').slice(0, 5)} · {getPriorityLabel(nextTask.priority)}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.focusEmptyWrap}>
              <Text style={[styles.focusEmpty, { color: TEXT_SECONDARY }]}>{T('noTasksToday')}</Text>
              <Text style={[styles.focusEmptySub, { color: NAVY }]}>{T('youreAllSet')}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Timeline / Upcoming */}
      <View style={styles.sectionWrapper}>
        <View style={styles.timelineHeader}>
          <Text style={[styles.sectionHeader, { color: NAVY }]}>{T('upcoming')}</Text>
          <Pressable onPress={() => router.push('/(tabs)/planner' as any)}>
            <Text style={[styles.seeAll, { color: NAVY }]}>{T('seeAll')}</Text>
          </Pressable>
        </View>
        <View style={styles.timelineList}>
          {scheduleWithinMonth.length === 0 ? (
            <View style={styles.timelineCard}>
              <Text style={[styles.timelineMeta, { color: TEXT_SECONDARY }]}>{T('nothingIn30Days')}</Text>
            </View>
          ) : (
            scheduleWithinMonth.map((item, idx) => {
              const showDateHeader = idx === 0 || scheduleWithinMonth[idx - 1].date !== item.date;
              const isStudy = item.type === 'STUDY';
              const studyDone = isStudy && completedStudyKeys.includes((item as { studyKey?: string }).studyKey ?? '');
              const daysLeft = !isStudy && 'daysLeft' in item ? item.daysLeft : 99;
              const priority = !isStudy && 'priority' in item ? item.priority : null;
              const subjectColor = getSubjectColor(item.code);
              const cardBg = CARD_BG_WHITE;
              const borderColor = isStudy ? '#e2e8f0' : getBorderColorByDueProximity(daysLeft);
              return (
                <View key={`${item.type}-${item.date}-${item.time}-${idx}`}>
                  {showDateHeader && (
                    <Text style={[styles.timelineDateHeader, { color: NAVY }, idx > 0 && { marginTop: 16 }]}>{formatDateLabel(item.date)}</Text>
                  )}
                  <View style={styles.timelineItem}>
                    <View style={styles.timelineDotCol}>
                      <View style={[styles.timelineDot, { borderColor: studyDone ? '#94a3b8' : isStudy ? NAVY : subjectColor }]} />
                      <View style={styles.timelineTrack} />
                    </View>
                    <View style={[styles.timelineCard, { backgroundColor: cardBg, borderWidth: 1.5, borderColor }]}>
                      <View style={styles.timelineCardTop}>
                        <Text style={[styles.timelineTime, { color: TEXT_SECONDARY }]}>{(item.time || '').slice(0, 5)}</Text>
                        {studyDone ? (
                          <View style={[styles.typeBadge, { backgroundColor: 'rgba(148, 163, 184, 0.15)' }]}>
                            <Text style={[styles.typeBadgeText, { color: '#64748b' }]}>DONE</Text>
                          </View>
                        ) : priority ? (
                          <Text style={[styles.typeBadgeText, { color: TEXT_SECONDARY, fontWeight: '600' }]}>{getPriorityLabel(priority)}</Text>
                        ) : null}
                      </View>
                      <Text style={[styles.timelineName, { color: TEXT_PRIMARY }, studyDone && { textDecorationLine: 'line-through', color: TEXT_SECONDARY }]}>{item.name}</Text>
                      <Text style={[styles.timelineMeta, { color: TEXT_SECONDARY }]}>
                        <Text style={{ color: subjectColor, fontWeight: '700' }}>{item.code}</Text>
                        {' • '}{item.room}
                      </Text>
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

  // Focus card – white with shadow
  focusCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 4,
  },
  focusPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  focusCoursePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8, // Softer pill
  },
  focusCoursePillText: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  focusStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  focusStatusPillText: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2 },
  focusTitle: { fontSize: 18, fontWeight: '700', lineHeight: 24, marginBottom: 10, letterSpacing: -0.3 },
  focusMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  focusMetaText: { fontSize: 13, fontWeight: '500' },
  focusEmptyWrap: { alignItems: 'center', paddingVertical: 20 },
  focusEmpty: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  focusEmptySub: { fontSize: 14, fontWeight: '500' },

  // Sections
  sectionWrapper: { marginHorizontal: 20, marginBottom: 32 },
  sectionWrapperFirst: { marginTop: 24 },
  sectionHeader: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginBottom: 16, color: '#000000' },

  // Timeline
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  seeAll: { fontSize: 15, fontWeight: '600' },
  timelineList: { marginLeft: 0 },
  timelineDateHeader: { fontSize: 14, fontWeight: '700', marginBottom: 12, letterSpacing: -0.2 },
  timelineItem: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  timelineDotCol: { alignItems: 'center', width: 14, paddingTop: 4 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, backgroundColor: '#f8fafc' },
  timelineTrack: { width: 2, flex: 1, backgroundColor: '#f1f5f9', marginTop: 4 },
  timelineCard: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 3,
  },
  timelineCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  timelineTime: { fontSize: 13, fontWeight: '600' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  timelineName: { fontSize: 16, fontWeight: '700', lineHeight: 22, letterSpacing: -0.3 },
  timelineMeta: { fontSize: 13, fontWeight: '500', marginTop: 4 },
});

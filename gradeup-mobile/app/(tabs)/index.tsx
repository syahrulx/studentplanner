import { View, Text, Pressable, ScrollView, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import type { ThemeIconKey } from '@/constants/ThemeIcons';
import { Priority } from '@/src/types';
import { formatDisplayDate } from '@/src/utils/date';

const WEEKDAY_TO_NUM: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

function getDaysLeft(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T23:59:59');
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

function getDueTimeLabel(dueDate: string): string {
  const days = getDaysLeft(dueDate);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return `${days} days left`;
}

export default function Dashboard() {
  const { user, tasks, revisionSettings, completedStudyKeys, getSubjectColor } = useApp();
  const theme = useTheme();
  const pending = tasks.filter((t) => !t.isDone);
  const high = pending.filter((t) => t.priority === Priority.High).sort(
    (a, b) => new Date(a.dueDate + 'T' + a.dueTime).getTime() - new Date(b.dueDate + 'T' + b.dueTime).getTime()
  );
  const nextTask = high[0] || pending[0];

  const getUrgency = (dueDate: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    if (dueDate === today) return 'DUE TODAY';
    if (dueDate === tomorrow) return 'DUE TOMORROW';
    return `DUE ${formatDisplayDate(dueDate)}`;
  };
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
      room: 'Online Submission',
      type: 'DEADLINE' as const,
      name: t.title,
    }));

  // Study-time entries for the next 30 days (when reminder is enabled)
  const studyItems: { studyKey: string; date: string; time: string; code: string; room: string; type: 'STUDY'; name: string }[] = [];
  if (revisionSettings.enabled && revisionSettings.time) {
    const [h, m] = revisionSettings.time.split(':').map((x) => parseInt(x, 10) || 0);
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const subject = revisionSettings.subjectId || 'Study';
    const topic = revisionSettings.topic ? ` • ${revisionSettings.topic}` : '';
    if (revisionSettings.repeat === 'once' && revisionSettings.singleDate) {
      const dateStr = revisionSettings.singleDate;
      if (dateStr >= todayStr && dateStr <= in30Str) {
        studyItems.push({
          studyKey: `${dateStr}T${timeStr}`,
          date: dateStr,
          time: timeStr,
          code: subject,
          room: `${revisionSettings.durationMinutes} min${topic}`,
          type: 'STUDY',
          name: 'Time to study',
        });
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
          studyItems.push({
            studyKey: `${dateStr}T${timeStr}`,
            date: dateStr,
            time: timeStr,
            code: subject,
            room: `${revisionSettings.durationMinutes} min${topic}`,
            type: 'STUDY',
            name: 'Time to study',
          });
        }
      }
    }
  }

  const scheduleWithinMonth = [...deadlineItems, ...studyItems].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.time.localeCompare(b.time);
  });

  const formatDateLabel = (dateStr: string) => formatDisplayDate(dateStr);

  // Muted palette for home (no neon): dark green header, sage, cream, warm gray
  // Study palette: dark green header, gold accent, sage/teal secondary
  const homeColors = {
    headerBg: '#14532d',
    headerText: '#f0fdf4',
    headerSubtext: '#86efac',
    accent: '#ca8a04',
    cardBg: '#ffffff',
    cardBorder: '#e2efe8',
    surface: '#ffffff',
    boxTone: '#f0f7f2',
    text: '#1a2e1a',
    textSecondary: '#4a6b5a',
    sage: '#0d9488',
    mutedBlue: '#15803d',
    mutedAmber: '#d4a843',
    overdue: '#b91c1c',
  };

  const shortcuts: { iconKey: ThemeIconKey; label: string; description: string; color: string; route: string }[] = [
    { iconKey: 'layers', label: 'Flashcard', description: 'Review notes with cards', color: homeColors.sage, route: '/flashcard-review' },
    { iconKey: 'target', label: 'Quiz', description: 'Test your understanding', color: homeColors.mutedBlue, route: '/quiz-config' },
    { iconKey: 'clock', label: 'Study time', description: 'Set a revision schedule', color: homeColors.mutedAmber, route: '/revision' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: homeColors.surface }]} contentContainerStyle={styles.content}>
      {/* Top header: greeting + week + profile */}
      <View style={[styles.headerWrap, { backgroundColor: homeColors.headerBg }]}>
        <Image
          source={require('../../assets/images/wave-texture.png')}
          style={[StyleSheet.absoluteFillObject, styles.waveTexture]}
          resizeMode="cover"
        />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(20,83,45,0.4)', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }]} />
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: homeColors.headerText }]}>Hello, {user.name.split(' ')[0]}</Text>
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: homeColors.accent }]} />
              <Text style={[styles.subtitle, { color: homeColors.headerSubtext }]}>Part {user.part} • Week {user.currentWeek}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Pressable style={styles.weekBtn} onPress={() => router.push('/stress-map' as any)}>
              <Text style={[styles.weekBtnText, { color: homeColors.headerSubtext }]}>Week {user.currentWeek}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/profile' as any)}>
              <ThemeIcon name="user" size={22} color={homeColors.headerText} />
            </Pressable>
          </View>
        </View>

        {/* Today's focus card - prominent like wallet balance */}
        <View style={styles.focusSection}>
          <Text style={[styles.focusSectionLabel, { color: homeColors.headerSubtext }]}>Today&apos;s focus</Text>
          <Pressable
            style={({ pressed }) => [
              styles.focusCard,
              { backgroundColor: homeColors.cardBg },
              pressed && styles.pressed,
            ]}
            onPress={() => router.push('/(tabs)/planner' as any)}
          >
            {nextTask && <View style={[styles.subjectDot, { backgroundColor: getSubjectColor(nextTask.courseId) }]} />}
            {nextTask ? (
              <>
                <View style={styles.focusTop}>
                  <Text style={[styles.focusTitle, { color: homeColors.text }]} numberOfLines={2}>{nextTask.title}</Text>
                  <Text style={[styles.dueTimeBold, { color: getDaysLeft(nextTask.dueDate) < 0 ? homeColors.overdue : homeColors.accent }]}>
                    {getDueTimeLabel(nextTask.dueDate)}
                  </Text>
                </View>
                <View style={styles.focusMetaRow}>
                  <View style={styles.focusMetaItem}>
                    <ThemeIcon name="checkCircle" size={14} color={homeColors.textSecondary} />
                    <Text style={[styles.focusMetaText, { color: homeColors.textSecondary }]}>{nextTask.courseId}</Text>
                  </View>
                  <View style={[styles.focusMetaDot, { backgroundColor: homeColors.cardBorder }]} />
                  <View style={styles.focusMetaItem}>
                    <ThemeIcon name="calendar" size={14} color={homeColors.textSecondary} />
                    <Text style={[styles.focusMetaText, { color: homeColors.textSecondary }]}>{formatDisplayDate(nextTask.dueDate)} • {nextTask.dueTime}</Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.focusEmptyWrap}>
                <Text style={[styles.focusEmpty, { color: homeColors.textSecondary }]}>No tasks for today</Text>
                <Text style={[styles.dueTimeBold, { color: homeColors.accent }]}>You&apos;re all set</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Quick actions */}
      <View style={[styles.sectionBox, styles.sectionBoxFirst, { backgroundColor: homeColors.boxTone, borderColor: homeColors.cardBorder }]}>
        <Text style={[styles.sectionBoxTitle, { color: homeColors.textSecondary }]}>Quick actions</Text>
        <View style={styles.shortcutsWrap}>
          {shortcuts.map((s, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [styles.shortcut, { backgroundColor: homeColors.cardBg, borderColor: homeColors.cardBorder }, pressed && styles.pressed]}
              onPress={() => router.push(s.route as any)}
            >
              <View style={[styles.shortcutIcon, { borderColor: s.color }]}>
              <ThemeIcon name={s.iconKey} size={22} color={s.color} />
              </View>
              <Text style={[styles.shortcutLabel, { color: homeColors.text }]}>{s.label}</Text>
              <Text style={[styles.shortcutDescription, { color: homeColors.textSecondary }]}>{s.description}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Timeline / Recent */}
      <View style={[styles.sectionBox, { backgroundColor: homeColors.boxTone, borderColor: homeColors.cardBorder }]}>
        <View style={styles.timelineHeader}>
          <Text style={[styles.timelineTitle, { color: homeColors.text }]}>Upcoming</Text>
          <Pressable onPress={() => router.push('/(tabs)/planner' as any)}>
            <Text style={[styles.seeAll, { color: homeColors.accent }]}>See all</Text>
          </Pressable>
        </View>
        <View style={styles.timelineList}>
          {scheduleWithinMonth.length === 0 ? (
            <View style={[styles.timelineCard, { backgroundColor: homeColors.cardBg, borderColor: homeColors.cardBorder }]}>
              <Text style={[styles.timelineMeta, { color: homeColors.textSecondary }]}>Nothing in the next 30 days.</Text>
            </View>
          ) : (
            scheduleWithinMonth.map((item, idx) => {
              const showDateHeader = idx === 0 || scheduleWithinMonth[idx - 1].date !== item.date;
              const isStudy = item.type === 'STUDY';
              const studyDone = isStudy && completedStudyKeys.includes((item as { studyKey?: string }).studyKey ?? '');
              return (
                <View key={`${item.type}-${item.date}-${item.time}-${idx}`}>
                  {showDateHeader && (
                    <Text style={[styles.timelineDateHeader, { color: homeColors.accent }, idx > 0 && { marginTop: 16 }]}>{formatDateLabel(item.date)}</Text>
                  )}
                  <View style={styles.timelineItem}>
                    <View style={[styles.timelineDot, { backgroundColor: homeColors.cardBg, borderColor: studyDone ? homeColors.sage : isStudy ? homeColors.mutedAmber : getSubjectColor(item.code) }]} />
                    <View style={[
                      styles.timelineCard,
                      { backgroundColor: homeColors.cardBg, borderColor: homeColors.cardBorder, position: 'relative', overflow: 'hidden' },
                    ]}>
                      <View style={[styles.subjectDot, { backgroundColor: studyDone ? homeColors.sage : isStudy ? homeColors.mutedAmber : getSubjectColor(item.code) }]} />
                      <View style={styles.timelineCardTop}>
                        <Text style={[styles.timelineTime, { color: homeColors.textSecondary }]}>{item.time}</Text>
                        <View style={[styles.typeBadge, { backgroundColor: studyDone ? homeColors.sage + '22' : (isStudy ? homeColors.mutedAmber : homeColors.accent) + '22' }]}>
                          <Text style={[styles.typeBadgeText, { color: studyDone ? homeColors.sage : isStudy ? homeColors.mutedAmber : homeColors.accent }]}>{studyDone ? 'DONE' : item.type}</Text>
                        </View>
                      </View>
                      <Text style={[styles.timelineName, { color: homeColors.text }, studyDone && { textDecorationLine: 'line-through', color: homeColors.textSecondary }]}>{item.name}</Text>
                      <Text style={[styles.timelineMeta, { color: homeColors.textSecondary }]}>{item.code} • {item.room}</Text>
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
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
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
  weekBtn: {},
  weekBtnText: { fontSize: 11, fontWeight: '700' },
  focusSection: { marginTop: 20, zIndex: 1 },
  focusSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 10 },
  focusCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  subjectDot: { position: 'absolute', top: 0, right: 14, width: 14, height: 22, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  pressed: { opacity: 0.96 },
  focusTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  focusTitle: { fontSize: 18, fontWeight: '800', flex: 1, lineHeight: 24 },
  dueTimeBold: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  focusMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  focusMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  focusMetaDot: { width: 4, height: 4, borderRadius: 2 },
  focusMetaText: { fontSize: 11, fontWeight: '600' },
  focusEmptyWrap: { alignItems: 'center', paddingVertical: 12 },
  focusEmpty: { fontSize: 14, marginBottom: 6 },
  shortcutsWrap: { flexDirection: 'row', gap: 8, paddingTop: 12 },
  shortcut: { flex: 1, borderRadius: 18, padding: 10, alignItems: 'flex-start', borderWidth: 1 },
  shortcutIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  shortcutLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2, textAlign: 'left' },
  shortcutDescription: { fontSize: 11, fontStyle: 'italic', marginTop: 6, textAlign: 'left' },
  sectionBox: { marginHorizontal: 14, marginBottom: 24, padding: 20, borderRadius: 22, borderWidth: 1 },
  sectionBoxFirst: { marginTop: 28 },
  sectionBoxTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 14 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  timelineTitle: { fontSize: 16, fontWeight: '800' },
  seeAll: { fontSize: 13, fontWeight: '700' },
  timelineList: { marginLeft: 8 },
  timelineDateHeader: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  timelineItem: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginTop: 6 },
  timelineCard: { flex: 1, padding: 16, borderRadius: 18, borderWidth: 1 },
  timelineCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  timelineTime: { fontSize: 11, fontWeight: '700' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  typeBadgeText: { fontSize: 9, fontWeight: '800' },
  timelineName: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  timelineMeta: { fontSize: 10, fontWeight: '600', marginTop: 4 },
});

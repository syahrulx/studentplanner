import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import type { ThemeIconKey } from '@/constants/ThemeIcons';
import { Priority } from '@/src/types';
import { formatDisplayDate } from '@/src/utils/date';

const WEEKDAY_TO_NUM: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

export default function Dashboard() {
  const { user, tasks, revisionSettings, completedStudyKeys } = useApp();
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

  // Timeline: next 30 days
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

  const shortcuts: { iconKey: ThemeIconKey; label: string; color: string; route: string }[] = [
    { iconKey: 'layers', label: 'Flashcard', color: theme.shortcutColors[0], route: '/flashcard-review' },
    { iconKey: 'target', label: 'Quiz', color: theme.shortcutColors[1], route: '/quiz-config' },
    { iconKey: 'clock', label: 'Study time', color: theme.shortcutColors[2], route: '/revision' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Hi, {user.name.split(' ')[0]}</Text>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: theme.success }]} />
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Part {user.part} • Active Session</Text>
          </View>
        </View>
        <View style={[styles.headerRight, { backgroundColor: theme.primary }]}>
          <Pressable style={styles.weekBtn} onPress={() => router.push('/stress-map' as any)}>
            <Text style={[styles.weekBtnText, { color: theme.textInverse }]}>Week {user.currentWeek}</Text>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.textInverse + '40' }]} />
          <Pressable onPress={() => router.push('/(tabs)/profile' as any)}>
            <ThemeIcon name="user" size={20} color={theme.textInverse} />
          </Pressable>
        </View>
      </View>

      <Pressable style={({ pressed }) => [styles.focusCard, { backgroundColor: theme.focusCard }, pressed && styles.pressed]} onPress={() => router.push('/(tabs)/planner' as any)}>
        <View style={styles.focusTop}>
          <Text style={[styles.focusLabel, { color: theme.accent3 }]}>Today&apos;s Focus</Text>
          <View style={[styles.urgencyPill, { backgroundColor: theme.textInverse + '20', borderColor: theme.textInverse + '15' }]}>
            <Text style={[styles.urgencyPillText, { color: theme.focusCardText }]}>{nextTask ? getUrgency(nextTask.dueDate) : 'No Tasks'}</Text>
          </View>
        </View>
        {nextTask ? (
          <>
            <Text style={[styles.focusTitle, { color: theme.focusCardText }]} numberOfLines={2}>{nextTask.title}</Text>
            <View style={styles.focusMetaRow}>
              <View style={styles.focusMetaItem}>
                <ThemeIcon name="checkCircle" size={14} color={theme.focusCardText} />
                <Text style={[styles.focusMetaText, { color: theme.focusCardText }]}>{nextTask.courseId}</Text>
              </View>
              <View style={[styles.focusMetaDot, { backgroundColor: theme.focusCardText + '40' }]} />
              <View style={styles.focusMetaItem}>
                <ThemeIcon name="calendar" size={14} color={theme.focusCardText} />
                <Text style={[styles.focusMetaText, { color: theme.focusCardText }]}>{nextTask.dueTime}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={[styles.focusEmpty, { color: theme.focusCardText + '99' }]}>Ready for a fresh start!</Text>
        )}
      </Pressable>

      <View style={styles.shortcuts}>
        {shortcuts.map((s, i) => (
          <Pressable key={i} style={({ pressed }) => [styles.shortcut, { backgroundColor: theme.card, borderColor: theme.border }, pressed && styles.pressed]} onPress={() => router.push(s.route as any)}>
            <View style={[styles.shortcutIcon, { backgroundColor: s.color + '22' }]}>
              <ThemeIcon name={s.iconKey} size={26} color={s.color} />
            </View>
            <Text style={[styles.shortcutLabel, { color: theme.textSecondary }]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.timelineSection}>
        <View style={styles.timelineHeader}>
          <Text style={[styles.timelineTitle, { color: theme.textSecondary }]}>Timeline</Text>
          <Text style={[styles.timelineDate, { color: theme.accent3 }]}>Next 30 days</Text>
        </View>
        <View style={styles.timelineList}>
          {scheduleWithinMonth.length === 0 ? (
            <View style={[styles.timelineCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.timelineMeta, { color: theme.textSecondary }]}>Nothing scheduled in the next 30 days.</Text>
            </View>
          ) : (
            scheduleWithinMonth.map((item, idx) => {
              const showDateHeader = idx === 0 || scheduleWithinMonth[idx - 1].date !== item.date;
              const isStudy = item.type === 'STUDY';
              const studyDone = isStudy && completedStudyKeys.includes((item as { studyKey?: string }).studyKey ?? '');
              return (
                <View key={`${item.type}-${item.date}-${item.time}-${idx}`}>
                  {showDateHeader && (
                    <Text style={[styles.timelineDateHeader, { color: theme.primary }, idx > 0 && { marginTop: 16 }]}>{formatDateLabel(item.date)}</Text>
                  )}
                  <View style={styles.timelineItem}>
                    <View style={[styles.timelineDot, { backgroundColor: theme.card, borderColor: studyDone ? theme.success : isStudy ? theme.accent2 : theme.primary }]} />
                    <View style={[styles.timelineCard, { backgroundColor: theme.card, borderColor: studyDone ? theme.success + '99' : isStudy ? theme.accent2 + '99' : theme.border }, isStudy && !studyDone && { borderLeftWidth: 3, borderLeftColor: theme.accent2 }, studyDone && { borderLeftWidth: 3, borderLeftColor: theme.success, opacity: 0.9 }]}>
                      <View style={styles.timelineCardTop}>
                        <Text style={[styles.timelineTime, { color: studyDone ? theme.success : isStudy ? theme.accent2 : theme.primary }]}>{item.time}</Text>
                        <View style={[styles.typeBadge, { backgroundColor: studyDone ? theme.success + '22' : isStudy ? theme.accent2 + '22' : theme.danger + '22' }]}>
                          <Text style={[styles.typeBadgeText, { color: studyDone ? theme.success : isStudy ? theme.accent2 : theme.danger }]}>{studyDone ? 'DONE' : item.type}</Text>
                        </View>
                      </View>
                      <Text style={[styles.timelineName, { color: theme.text }, studyDone && { textDecorationLine: 'line-through', color: theme.textSecondary }]}>{item.name}</Text>
                      <Text style={[styles.timelineMeta, { color: theme.textSecondary }]}>{item.code} • {item.room}</Text>
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
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  subtitle: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  weekBtn: {},
  weekBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  divider: { width: 1, height: 14 },
  focusCard: { borderRadius: 32, padding: 24, marginBottom: 28, overflow: 'hidden' },
  pressed: { opacity: 0.96 },
  focusTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  focusLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 2.5 },
  urgencyPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  urgencyPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  focusTitle: { fontSize: 22, fontWeight: '800', marginBottom: 14, lineHeight: 28 },
  focusMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  focusMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  focusMetaDot: { width: 4, height: 4, borderRadius: 2 },
  focusMetaText: { fontSize: 10, fontWeight: '800' },
  focusEmpty: { fontSize: 15, fontStyle: 'italic', marginTop: 8 },
  shortcuts: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  shortcut: { flex: 1, borderRadius: 20, padding: 18, alignItems: 'center', borderWidth: 1 },
  shortcutIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  shortcutLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  timelineSection: { marginBottom: 28 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 10, marginBottom: 18 },
  timelineTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2.5 },
  timelineDate: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  timelineList: { marginLeft: 14, gap: 12 },
  timelineDateHeader: { fontSize: 11, fontWeight: '800', marginBottom: 8 },
  timelineItem: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  timelineDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2.5, marginTop: 5 },
  timelineCard: { flex: 1, padding: 18, borderRadius: 24, borderWidth: 1 },
  timelineCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  timelineTime: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  typeBadgeText: { fontSize: 8, fontWeight: '800' },
  timelineName: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  timelineMeta: { fontSize: 9, fontWeight: '800', marginTop: 6, letterSpacing: 0.5 },
});

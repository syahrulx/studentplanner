import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { formatDisplayDate, getTodayISO } from '@/src/utils/date';
import { useTranslations } from '@/src/i18n';

function getDaysLeft(dateISO: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tgt = new Date(dateISO + 'T23:59:59');
  tgt.setHours(0, 0, 0, 0);
  return Math.ceil((tgt.getTime() - today.getTime()) / 86400000);
}

export default function StudyDetails() {
  const { studyKey } = useLocalSearchParams<{ studyKey: string }>();
  const { revisionSettingsList, completedStudyKeys, markStudyDone, unmarkStudyDone, language } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const T = useTranslations(language);

  // We need to re-find the generated study item
  const studyItem = useMemo(() => {
    if (!studyKey) return null;
    const [dateStr, timeStr] = studyKey.split('T');
    
    // Find matching setting
    for (const setting of revisionSettingsList) {
      if (!setting.time) continue;
      const [h, m] = setting.time.split(':').map((x) => parseInt(x, 10) || 0);
      const configuredTimeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      
      if (configuredTimeStr === timeStr) {
        if (setting.repeat === 'once' && setting.singleDate === dateStr) {
          return { ...setting, activeDate: dateStr };
        } else if (setting.repeat === 'repeated') {
          // If it matches the day of the week
          const tgtDate = new Date(dateStr + 'T12:00:00');
          const dayNum = tgtDate.getDay();
          const targetWeekday = setting.day === 'Every day' ? null : ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(setting.day);
          
          if (targetWeekday === null || dayNum === targetWeekday) {
             return { ...setting, activeDate: dateStr };
          }
        }
      }
    }
    return null;
  }, [studyKey, revisionSettingsList]);

  if (!studyItem || !studyKey) {
    return (
      <View style={[s.emptyContainer, { backgroundColor: theme.background }]}>
        <View style={[s.emptyIcon, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="alert-circle" size={32} color={theme.textSecondary} />
        </View>
        <Text style={[s.emptyTitle, { color: theme.textSecondary }]}>Study Session Not Found</Text>
        <Pressable onPress={() => router.back()} style={[s.emptyBackBtn, { backgroundColor: theme.primary }]}>
          <Text style={[s.emptyBackText, { color: theme.textInverse }]}>{T('back')}</Text>
        </Pressable>
      </View>
    );
  }

  const isDone = completedStudyKeys.includes(studyKey);
  
  const daysLeft = getDaysLeft(studyItem.activeDate);
  const isOverdue = daysLeft < 0;
  const isDueSoon = !isOverdue && daysLeft <= 1;
  const urgencyLabel = isOverdue
    ? `Past Date`
    : daysLeft === 0
      ? T('dueToday')
      : daysLeft === 1
        ? T('tomorrow')
        : `${daysLeft} ${T('daysLeft')}`;

  const handleToggle = () => {
    if (isDone) {
      Alert.alert(T('markAsNotDone'), T('markStudyNotDone'), [
        { text: T('cancel'), style: 'cancel' },
        { text: T('undo'), onPress: () => unmarkStudyDone(studyKey) },
      ]);
    } else {
      Alert.alert(T('markAsDoneQuestion'), T('markStudyDone'), [
        { text: T('cancel'), style: 'cancel' },
        { text: T('markDone'), onPress: () => {
             markStudyDone(studyKey);
             router.back();
        }},
      ]);
    }
  };

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 12, backgroundColor: theme.background }]}>
        <Pressable
          onPress={() => router.back()}
          style={[s.headerBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: theme.text }]}>Study Session</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.badgeRow}>
          <View style={[s.badgeCourse, { backgroundColor: theme.primary }]}>
            <Text style={s.badgeCourseText}>{studyItem.subjectId || 'Study'}</Text>
          </View>
          <View style={[s.badgeType, { backgroundColor: theme.backgroundSecondary }]}>
            <Text style={[s.badgeTypeText, { color: theme.textSecondary }]}>Revision</Text>
          </View>
          {isDone && (
            <View style={s.badgeDone}>
              <Feather name="check" size={12} color="#16a34a" />
              <Text style={[s.badgeDoneText, { color: theme.success }]}>{T('completed')}</Text>
            </View>
          )}
        </View>

        <Text style={[s.title, { color: theme.text }]}>
          {studyItem.topic ? `Study: ${studyItem.topic}` : T('timeToStudy')}
        </Text>

        {/* ── Urgency pill ──────────────────────────────────────────────────── */}
        <View style={[s.urgencyPill, isOverdue && s.urgencyOverdue, isDueSoon && s.urgencySoon]}>
          <Feather
            name={isOverdue ? 'alert-triangle' : 'clock'}
            size={14}
            color={isOverdue ? theme.danger : isDueSoon ? theme.warning : theme.primary}
          />
          <Text
            style={[s.urgencyText, { color: theme.text }, isOverdue && { color: theme.danger }, isDueSoon && { color: theme.warning }]}
          >
            {urgencyLabel}
          </Text>
        </View>

        {/* ── Details group ───────────────────────── */}
        <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>DETAILS</Text>
        <View style={[s.group, { backgroundColor: theme.card, borderColor: theme.border }]}>

          {/* Subject */}
          <View style={[s.groupRow, { borderBottomColor: theme.border }]}>
            <View style={[s.groupRowIcon, { backgroundColor: 'rgba(0,51,102,0.07)' }]}>
              <Feather name="book" size={16} color={theme.primary} />
            </View>
            <Text style={[s.groupRowLabel, { color: theme.textSecondary }]}>Subject</Text>
            <Text style={[s.groupRowValue, { color: theme.text }]}>{studyItem.subjectId || 'General'}</Text>
          </View>

          {/* Duration */}
          <View style={[s.groupRow, { borderBottomColor: theme.border }]}>
            <View style={[s.groupRowIcon, { backgroundColor: 'rgba(99,102,241,0.07)' }]}>
              <Feather name="clock" size={16} color="#6366f1" />
            </View>
            <Text style={[s.groupRowLabel, { color: theme.textSecondary }]}>Duration</Text>
            <Text style={[s.groupRowValue, { color: theme.text }]}>{studyItem.durationMinutes} minutes</Text>
          </View>

          {/* Due Date */}
          <View style={[s.groupRow, { borderBottomColor: theme.border }]}>
            <View style={[s.groupRowIcon, { backgroundColor: 'rgba(0,51,102,0.07)' }]}>
              <Feather name="calendar" size={16} color={theme.primary} />
            </View>
            <Text style={[s.groupRowLabel, { color: theme.textSecondary }]}>Date</Text>
            <Text style={[s.groupRowValue, { color: theme.text }]}>{formatDisplayDate(studyItem.activeDate)}</Text>
          </View>

          {/* Time */}
          <View style={[s.groupRow, s.groupRowLast]}>
            <View style={[s.groupRowIcon, { backgroundColor: 'rgba(245,158,11,0.08)' }]}>
              <Feather name="clock" size={16} color="#d97706" />
            </View>
            <Text style={[s.groupRowLabel, { color: theme.textSecondary }]}>Scheduled Time</Text>
            <Text style={[s.groupRowValue, { color: theme.text }]}>{studyItem.time.slice(0, 5)}</Text>
          </View>
        </View>

      </ScrollView>

      {/* ── Sticky Bottom Bar ─────────────────────────────────────────────────── */}
      <View style={[s.bottomBar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + 8 }]}>
        <Pressable
          style={({ pressed }) => [
            s.mainActionBtn,
            isDone && s.mainActionBtnDone,
            pressed && { opacity: 0.85 },
            { backgroundColor: isDone ? theme.textSecondary : theme.success },
          ]}
          onPress={handleToggle}
        >
          <Feather name={isDone ? 'rotate-ccw' : 'check'} size={20} color={theme.textInverse} />
          <Text style={[s.mainActionText, { color: theme.textInverse }]}>
            {isDone ? T('completed') : T('markAsDone')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 32, textAlign: 'center' },
  emptyBackBtn: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: 24 },
  emptyBackText: { fontSize: 16, fontWeight: '700' },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' },
  badgeCourse: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  badgeCourseText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  badgeType: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  badgeTypeText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  badgeDone: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(22, 163, 74, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  badgeDoneText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  title: { fontSize: 28, fontWeight: '800', lineHeight: 34, marginBottom: 12, letterSpacing: -0.5 },

  urgencyPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(0, 51, 102, 0.08)', marginBottom: 28 },
  urgencyOverdue: { backgroundColor: 'rgba(220, 38, 38, 0.12)' },
  urgencySoon: { backgroundColor: 'rgba(202, 138, 4, 0.12)' },
  urgencyText: { fontSize: 14, fontWeight: '700' },

  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 4 },
  group: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 28 },
  groupRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  groupRowLast: { borderBottomWidth: 0 },
  groupRowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  groupRowLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
  groupRowValue: { fontSize: 16, fontWeight: '600' },

  timerPromptBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 10, marginBottom: 20 },
  timerIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  timerPromptTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mainActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 16, gap: 10 },
  mainActionBtnDone: { opacity: 0.9 },
  mainActionText: { fontSize: 17, fontWeight: '700' },
});

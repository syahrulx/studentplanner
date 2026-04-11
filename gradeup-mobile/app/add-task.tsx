import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  FlatList,
  ScrollView,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { supabase } from '@/src/lib/supabase';
import { upsertTask } from '@/src/lib/taskDb';
import { TaskType, type Task } from '@/src/types';
import { formatDisplayDate, getTodayISO, getMonthYearLabel, getMonthGrid, toISO } from '@/src/utils/date';
import { SUBJECT_COLOR_OPTIONS } from '@/src/constants/subjectColors';
import { useTranslations } from '@/src/i18n';
import { createTaskId, getDeadlineRiskFromDueDate, getSuggestedWeekForDueDate } from '@/src/lib/taskUtils';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import type { ThemePalette } from '@/constants/Themes';
import type { Course } from '@/src/types';

function syntheticCourse(id: string): Course {
  return { id, name: id, creditHours: 0, workload: [] };
}

function dueDateTimeToDate(iso: string, time: string): Date {
  const [y, mo, d] = iso.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  const [hStr, mStr] = (time || '00:00').split(':');
  const h = Number.isFinite(Number(hStr)) ? Number(hStr) : 0;
  const m = Number.isFinite(Number(mStr)) ? Number(mStr) : 0;
  return new Date(y, mo - 1, d, h, m, 0, 0);
}

function formatTimeHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addCalendarMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const x = new Date(year, month + delta, 1);
  return { year: x.getFullYear(), month: x.getMonth() };
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized;
  if (expanded.length !== 6) return `rgba(0,51,102,${alpha})`;
  const value = Number.parseInt(expanded, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const TASK_TYPES = Object.values(TaskType) as TaskType[];

function Group({ theme, children }: { theme: ThemePalette; children: ReactNode }) {
  return (
    <View
      style={[
        gStyles.group,
        {
          backgroundColor: theme.card,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 2,
            },
            default: {},
          }),
        },
      ]}
    >
      {children}
    </View>
  );
}

function Row({
  theme,
  children,
  onPress,
  showDivider,
}: {
  theme: ThemePalette;
  children: ReactNode;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  const inner = (
    <View
      style={[
        gStyles.rowInner,
        showDivider && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      {children}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.55 }]}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const gStyles = StyleSheet.create({
  group: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  rowInner: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
});

export default function AddTask() {
  const { taskId: rawTaskId } = useLocalSearchParams<{ taskId?: string | string[] }>();
  const { courses, tasks, addTask, updateTask, getSubjectColor, setSubjectColor, language, user, academicCalendar } =
    useApp();
  const theme = useTheme();
  const themeId = useThemeId();
  const insets = useSafeAreaInsets();
  const T = useTranslations(language);
  const taskId = Array.isArray(rawTaskId) ? rawTaskId[0] : rawTaskId;
  const existingTask = tasks.find((task) => task.id === taskId);
  const isEditing = Boolean(taskId);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [type, setType] = useState<TaskType>(TaskType.Assignment);
  const [dueDateISO, setDueDateISO] = useState<string>(getTodayISO());
  const [dueTime, setDueTime] = useState('23:59');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [shareFriendIds, setShareFriendIds] = useState<string[]>([]);
  const [shareCircleIds, setShareCircleIds] = useState<string[]>([]);

  const {
    filteredFriends,
    circles,
    shareTaskWithFriend,
    shareTaskWithCircle,
    userId: communityUserId,
    refreshFriends,
  } = useCommunity();

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date(dueDateISO + 'T12:00:00').getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date(dueDateISO + 'T12:00:00').getMonth());

  useEffect(() => {
    if (!showDateModal) return;
    const d = new Date(dueDateISO + 'T12:00:00');
    setPickerYear(d.getFullYear());
    setPickerMonth(d.getMonth());
  }, [showDateModal]);

  const monthGridCells = getMonthGrid(pickerYear, pickerMonth);
  const pickerHeaderISO = toISO(pickerYear, pickerMonth, 1);

  /** Real courses plus current task course when unknown / not in list; fallback so the picker is never empty. */
  const subjectPickerCourses = useMemo(() => {
    const list: Course[] = courses.map((c) => ({ ...c }));
    const hasId = (id: string) => list.some((c) => c.id === id);
    if (courseId && !hasId(courseId)) {
      list.unshift(syntheticCourse(courseId));
    }
    if (list.length === 0) {
      list.push(syntheticCourse('General'));
    }
    return list;
  }, [courses, courseId]);

  useEffect(() => {
    if (!existingTask) return;
    setTitle(existingTask.title);
    setCourseId(existingTask.courseId);
    setType(existingTask.type);
    setDueDateISO(existingTask.dueDate);
    setDueTime(existingTask.dueTime || '23:59');
    setNotes(existingTask.notes);
  }, [existingTask]);

  useEffect(() => {
    if (isEditing || courseId || !courses[0]?.id) return;
    setCourseId(courses[0].id);
  }, [isEditing, courseId, courses]);

  useEffect(() => {
    if (communityUserId) void refreshFriends();
  }, [communityUserId, refreshFriends]);

  const toggleShareFriend = (id: string) => {
    setShareFriendIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleShareCircle = (id: string) => {
    setShareCircleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (!title.trim() || (isEditing && !existingTask)) return;
    setIsSaving(true);
    try {
      const wantsShare = shareFriendIds.length > 0 || shareCircleIds.length > 0;
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id ?? null;
      const deadlineRisk = getDeadlineRiskFromDueDate(dueDateISO);
      const suggestedWeek = getSuggestedWeekForDueDate(dueDateISO, user, academicCalendar?.startDate);
      const courseIdResolved = courseId || courses[0]?.id || 'General';

      if (existingTask) {
        updateTask(existingTask.id, {
          title: title.trim(),
          courseId: courseIdResolved,
          type,
          notes,
          dueDate: dueDateISO,
          dueTime,
          needsDate: false,
        });
        if (wantsShare && uid) {
          const merged: Task = {
            ...existingTask,
            title: title.trim(),
            courseId: courseIdResolved,
            type,
            notes,
            dueDate: dueDateISO,
            dueTime,
            needsDate: false,
            deadlineRisk,
            suggestedWeek,
          };
          const { error } = await upsertTask(uid, merged);
          if (error) {
            Alert.alert('', T('shareSyncFailed'));
            return;
          }
          for (const friendId of shareFriendIds) {
            await shareTaskWithFriend(existingTask.id, friendId, undefined);
          }
          for (const circleId of shareCircleIds) {
            await shareTaskWithCircle(existingTask.id, circleId, undefined);
          }
        }
        router.back();
        return;
      }

      const newId = createTaskId();
      const newTask: Task = {
        id: newId,
        title: title.trim(),
        courseId: courseIdResolved,
        type,
        dueDate: dueDateISO,
        dueTime,
        notes,
        isDone: false,
        deadlineRisk,
        suggestedWeek,
        sourceMessage: undefined,
      };

      if (wantsShare && uid) {
        const { error } = await upsertTask(uid, newTask);
        if (error) {
          Alert.alert('', T('shareSyncFailed'));
          return;
        }
        addTask(newTask, { skipRemote: true });
        for (const friendId of shareFriendIds) {
          await shareTaskWithFriend(newId, friendId, undefined);
        }
        for (const circleId of shareCircleIds) {
          await shareTaskWithCircle(newId, circleId, undefined);
        }
      } else {
        addTask(newTask);
      }
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  const calendarModal = (
    <Modal visible={showDateModal} transparent animationType="fade" onRequestClose={() => setShowDateModal(false)}>
      <Pressable style={styles.modalBg} onPress={() => setShowDateModal(false)}>
        <Pressable
          style={[styles.dateModalCard, { backgroundColor: theme.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.calHeader}>
            <Pressable
              hitSlop={12}
              style={styles.calNav}
              onPress={() => {
                const { year, month } = addCalendarMonth(pickerYear, pickerMonth, -1);
                setPickerYear(year);
                setPickerMonth(month);
              }}
            >
              <Feather name="chevron-left" size={22} color={theme.primary} />
            </Pressable>
            <Text style={[styles.calMonth, { color: theme.text }]}>{getMonthYearLabel(pickerHeaderISO)}</Text>
            <Pressable
              hitSlop={12}
              style={styles.calNav}
              onPress={() => {
                const { year, month } = addCalendarMonth(pickerYear, pickerMonth, 1);
                setPickerYear(year);
                setPickerMonth(month);
              }}
            >
              <Feather name="chevron-right" size={22} color={theme.primary} />
            </Pressable>
          </View>
          <View style={styles.calWeeks}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
              <Text key={`${d}-${idx}`} style={[styles.calWk, { color: theme.textSecondary }]}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.calGrid}>
            {monthGridCells.map((d, idx) => {
              if (d == null) return <View key={idx} style={styles.calEmpty} />;
              const iso = toISO(pickerYear, pickerMonth, d);
              const isSelected = iso === dueDateISO;
              return (
                <Pressable
                  key={idx}
                  style={styles.calCell}
                  onPress={() => {
                    setDueDateISO(iso);
                    setShowDateModal(false);
                  }}
                >
                  <View style={[styles.calDot, isSelected && { backgroundColor: theme.primary }]}>
                    <Text style={[styles.calNum, { color: theme.text }, isSelected && { color: theme.textInverse }]}>
                      {d}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={[styles.dateDone, { backgroundColor: theme.primary }]}
            onPress={() => setShowDateModal(false)}
          >
            <Text style={{ color: theme.textInverse, fontWeight: '600', fontSize: 17 }}>{T('done')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.backgroundSecondary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.pageScroll,
          {
            paddingTop: insets.top + 8,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
            <Feather name="chevron-left" size={28} color={theme.primary} />
          </Pressable>
          <View style={styles.heroCenter}>
            <Text style={[styles.heroTitle, { color: theme.text }]} numberOfLines={1}>
              {isEditing ? T('editTask') : T('addNewTask')}
            </Text>
            <Text style={[styles.heroSub, { color: theme.textSecondary }]} numberOfLines={1}>
              {isEditing ? T('taskChangesSync') : T('manualEntry')}
            </Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{T('taskTitleRequired')}</Text>
        <TextInput
          style={[styles.titleField, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
          value={title}
          onChangeText={setTitle}
          placeholder={T('taskTitleRequired')}
          placeholderTextColor={theme.textSecondary}
          returnKeyType="done"
        />

        <Group theme={theme}>
          <Row theme={theme} showDivider onPress={() => setSubjectModalOpen(true)}>
            <View style={styles.rowBetween}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{T('subjectLabel')}</Text>
              <View style={styles.rowTrail}>
                <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{courseId}</Text>
                <Feather name="chevron-right" size={18} color={theme.textSecondary} style={{ opacity: 0.45 }} />
              </View>
            </View>
          </Row>
          <Row theme={theme} onPress={() => setShowColorPicker(true)}>
            <View style={styles.rowBetween}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{T('subjectColour')}</Text>
              <View style={styles.rowTrail}>
                <View style={[styles.swatch, { backgroundColor: getSubjectColor(courseId) }]} />
                <Feather name="chevron-right" size={18} color={theme.textSecondary} style={{ opacity: 0.45 }} />
              </View>
            </View>
          </Row>
        </Group>

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{T('type')}</Text>
        <View
          style={[
            styles.segmentTrack,
            {
              backgroundColor: Platform.OS === 'ios' ? 'rgba(118, 118, 128, 0.12)' : theme.backgroundSecondary,
              marginBottom: 16,
            },
          ]}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentScroll}>
            {TASK_TYPES.map((t) => {
              const on = type === t;
              return (
                <Pressable
                  key={t}
                  style={[
                    styles.segmentCell,
                    on && { backgroundColor: theme.card },
                    on && Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowRadius: 2 } }),
                  ]}
                  onPress={() => setType(t)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: on ? theme.text : theme.textSecondary },
                      on && { fontWeight: '600' },
                    ]}
                    numberOfLines={1}
                  >
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{T('dueDateLabel')}</Text>
        <Group theme={theme}>
          <Row theme={theme} showDivider onPress={() => setShowDateModal(true)}>
            <View style={styles.rowBetween}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{T('dueDateLabel')}</Text>
              <View style={styles.rowTrail}>
                <Text style={[styles.rowValue, { color: theme.primary }]}>{formatDisplayDate(dueDateISO)}</Text>
                <Feather name="chevron-right" size={18} color={theme.textSecondary} style={{ opacity: 0.45 }} />
              </View>
            </View>
          </Row>
          <Row theme={theme} onPress={() => setShowTimePicker(true)}>
            <View style={styles.rowBetween}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{T('time')}</Text>
              <View style={styles.rowTrail}>
                <Text style={[styles.rowValue, { color: theme.primary }]}>{dueTime}</Text>
                <Feather name="chevron-right" size={18} color={theme.textSecondary} style={{ opacity: 0.45 }} />
              </View>
            </View>
          </Row>
        </Group>

        {communityUserId ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 8 }]}>
              {T('shareWithSection')}
            </Text>
            <Text style={[styles.shareHint, { color: theme.textSecondary }]}>{T('shareWithHint')}</Text>
            {filteredFriends.length === 0 && circles.length === 0 ? (
              <Text style={[styles.shareEmpty, { color: theme.textSecondary }]}>{T('shareNoConnectionsHint')}</Text>
            ) : (
              <>
                {filteredFriends.length > 0 ? (
                  <>
                    <Text style={[styles.shareSubLabel, { color: theme.textSecondary }]}>{T('shareFriendsLabel')}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.shareChipsScroll}
                      contentContainerStyle={styles.shareChipsRow}
                    >
                      {filteredFriends.map((friend) => {
                        const on = shareFriendIds.includes(friend.id);
                        return (
                          <Pressable
                            key={friend.id}
                            onPress={() => toggleShareFriend(friend.id)}
                            style={[
                              styles.shareChip,
                              {
                                backgroundColor: on ? hexToRgba(theme.primary, 0.14) : theme.card,
                                borderColor: on ? theme.primary : theme.border,
                              },
                            ]}
                          >
                            <Text style={[styles.shareChipText, { color: theme.text }]} numberOfLines={1}>
                              {friend.name}
                            </Text>
                            <Feather name={on ? 'check-circle' : 'circle'} size={16} color={on ? theme.primary : theme.textSecondary} />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : null}
                {circles.length > 0 ? (
                  <>
                    <Text style={[styles.shareSubLabel, { color: theme.textSecondary, marginTop: 10 }]}>
                      {T('shareCirclesLabel')}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.shareChipsScroll}
                      contentContainerStyle={styles.shareChipsRow}
                    >
                      {circles.map((circle) => {
                        const on = shareCircleIds.includes(circle.id);
                        return (
                          <Pressable
                            key={circle.id}
                            onPress={() => toggleShareCircle(circle.id)}
                            style={[
                              styles.shareChip,
                              {
                                backgroundColor: on ? hexToRgba(theme.primary, 0.14) : theme.card,
                                borderColor: on ? theme.primary : theme.border,
                              },
                            ]}
                          >
                            <Text style={styles.shareCircleEmoji}>{circle.emoji || '●'}</Text>
                            <Text style={[styles.shareChipText, { color: theme.text }]} numberOfLines={1}>
                              {circle.name}
                            </Text>
                            <Feather name={on ? 'check-circle' : 'circle'} size={16} color={on ? theme.primary : theme.textSecondary} />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : null}
              </>
            )}
          </>
        ) : null}

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{T('notesLabel')}</Text>
        <TextInput
          style={[styles.notesField, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
          value={notes}
          onChangeText={setNotes}
          placeholder={T('optional')}
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />

        <Pressable
          style={[
            styles.iosButton,
            {
              backgroundColor: theme.primary,
              marginTop: 8,
              opacity: !title.trim() || isSaving || (isEditing && !existingTask) ? 0.38 : 1,
            },
          ]}
          onPress={handleSubmit}
          disabled={!title.trim() || isSaving || (isEditing && !existingTask)}
        >
          {isSaving ? (
            <ActivityIndicator color={theme.textInverse} size="small" />
          ) : (
            <Text style={[styles.iosButtonText, { color: theme.textInverse }]}>
              {isEditing ? T('saveTask') : T('addTask')}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {calendarModal}

      <Modal
        visible={subjectModalOpen}
        animationType="slide"
        {...(Platform.OS === 'ios'
          ? { presentationStyle: 'pageSheet' as const }
          : { transparent: true })}
        onRequestClose={() => setSubjectModalOpen(false)}
      >
        {Platform.OS === 'ios' ? (
          <View style={[styles.sheetContainer, { paddingTop: insets.top, backgroundColor: theme.backgroundSecondary }]}>
            <View style={[styles.sheetGrab, { backgroundColor: theme.border }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.textSecondary }]}>{T('subjectLabel')}</Text>
              <Pressable onPress={() => setSubjectModalOpen(false)} hitSlop={12}>
                <Text style={[styles.sheetDone, { color: theme.primary }]}>{T('done')}</Text>
              </Pressable>
            </View>
            <View style={[styles.sheetListCard, { backgroundColor: theme.card }]}>
              <FlatList
                data={subjectPickerCourses}
                keyExtractor={(c, index) => `${c.id}__${index}`}
                style={styles.sheetFlatList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item, index }) => (
                  <Pressable
                    style={({ pressed }) => [
                      styles.sheetRow,
                      index < subjectPickerCourses.length - 1 && {
                        borderBottomColor: theme.border,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      },
                      pressed && { backgroundColor: theme.backgroundSecondary },
                    ]}
                    onPress={() => {
                      setCourseId(item.id);
                      setSubjectModalOpen(false);
                    }}
                  >
                    <Text style={[styles.sheetRowText, { color: theme.text }]}>{item.id}</Text>
                    {courseId === item.id ? <Feather name="check" size={20} color={theme.primary} /> : null}
                  </Pressable>
                )}
              />
            </View>
          </View>
        ) : (
          <Pressable style={styles.modalBg} onPress={() => setSubjectModalOpen(false)}>
            <Pressable style={[styles.androidSheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.sheetTitle, { color: theme.text, marginBottom: 12 }]}>{T('subjectLabel')}</Text>
              <FlatList
                data={subjectPickerCourses}
                keyExtractor={(c, index) => `${c.id}__${index}`}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.sheetRow}
                    onPress={() => {
                      setCourseId(item.id);
                      setSubjectModalOpen(false);
                    }}
                  >
                    <Text style={{ color: theme.text, fontSize: 17 }}>{item.id}</Text>
                    {courseId === item.id ? <Feather name="check" size={20} color={theme.primary} /> : null}
                  </Pressable>
                )}
              />
            </Pressable>
          </Pressable>
        )}
      </Modal>

      <Modal visible={showColorPicker} transparent animationType="slide" onRequestClose={() => setShowColorPicker(false)}>
        <Pressable style={styles.modalBg} onPress={() => setShowColorPicker(false)}>
          <View
            style={[styles.colorSheet, { backgroundColor: theme.card, paddingBottom: insets.bottom + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[styles.sheetGrab, { backgroundColor: theme.border, alignSelf: 'center' }]} />
            <Text style={[styles.modalHdr, { color: theme.text }]}>{T('colourFor')} {courseId}</Text>
            <View style={styles.colorGrid}>
              {SUBJECT_COLOR_OPTIONS.map((color) => (
                <Pressable
                  key={color}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    getSubjectColor(courseId) === color && { borderWidth: 3, borderColor: theme.primary },
                  ]}
                  onPress={() => {
                    setSubjectColor(courseId, color);
                    setShowColorPicker(false);
                  }}
                />
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {Platform.OS === 'ios' && showTimePicker && (
        <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
          <Pressable style={styles.modalBg} onPress={() => setShowTimePicker(false)}>
            <View style={[styles.timeSheet, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
              {/* UIDatePicker wheel needs explicit height or it collapses to ~0 inside Modal */}
              <View style={styles.iosTimePickerWrap}>
                <DateTimePicker
                  value={dueDateTimeToDate(dueDateISO, dueTime)}
                  mode="time"
                  display="spinner"
                  is24Hour
                  themeVariant={isDarkTheme(themeId) ? 'dark' : 'light'}
                  textColor={theme.text}
                  style={styles.iosTimePicker}
                  onChange={(_, date) => {
                    if (date) setDueTime(formatTimeHM(date));
                  }}
                />
              </View>
              <Pressable style={[styles.timeDoneBtn, { backgroundColor: theme.primary }]} onPress={() => setShowTimePicker(false)}>
                <Text style={{ color: theme.textInverse, fontWeight: '600', fontSize: 17 }}>{T('done')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      {Platform.OS === 'android' && showTimePicker && (
        <DateTimePicker
          value={dueDateTimeToDate(dueDateISO, dueTime)}
          mode="time"
          display="default"
          is24Hour
          onChange={(event, date) => {
            setShowTimePicker(false);
            if (event.type === 'set' && date) setDueTime(formatTimeHM(date));
          }}
        />
      )}

      {Platform.OS === 'web' && (
        <Modal visible={showTimePicker} transparent animationType="fade">
          <Pressable style={styles.modalBg} onPress={() => setShowTimePicker(false)}>
            <View style={[styles.timeSheet, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
              <Text style={[styles.modalHdr, { color: theme.text }]}>{T('time')}</Text>
              <View style={styles.webTimeRow}>
                <ScrollView style={styles.webCol}>
                  {Array.from({ length: 24 }, (_, h) => h).map((h) => {
                    const hh = String(h).padStart(2, '0');
                    const isActive = dueTime.slice(0, 2) === hh;
                    return (
                      <Pressable
                        key={hh}
                        style={[styles.webPick, { backgroundColor: theme.backgroundSecondary }, isActive && { backgroundColor: theme.primary }]}
                        onPress={() => setDueTime(`${hh}:${dueTime.slice(3, 5) || '00'}`)}
                      >
                        <Text style={{ color: isActive ? theme.textInverse : theme.text }}>{hh}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <ScrollView style={styles.webCol}>
                  {Array.from({ length: 60 }, (_, m) => m).map((m) => {
                    const mm = String(m).padStart(2, '0');
                    const isActive = dueTime.slice(3, 5) === mm;
                    return (
                      <Pressable
                        key={mm}
                        style={[styles.webPick, { backgroundColor: theme.backgroundSecondary }, isActive && { backgroundColor: theme.primary }]}
                        onPress={() => setDueTime(`${dueTime.slice(0, 2) || '00'}:${mm}`)}
                      >
                        <Text style={{ color: isActive ? theme.textInverse : theme.text }}>{mm}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <Pressable style={[styles.timeDoneBtn, { backgroundColor: theme.primary }]} onPress={() => setShowTimePicker(false)}>
                <Text style={{ color: theme.textInverse, fontWeight: '600', fontSize: 17 }}>{T('done')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pageScroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  heroCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 6,
    opacity: 0.92,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 4,
  },
  shareHint: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 12,
    marginLeft: 4,
    marginTop: -4,
  },
  shareEmpty: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 12,
    marginLeft: 4,
  },
  shareSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginLeft: 4,
  },
  shareChipsScroll: { marginBottom: 4 },
  shareChipsRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, paddingVertical: 2, paddingRight: 4 },
  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 220,
  },
  shareChipText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  shareCircleEmoji: { fontSize: 16, marginRight: -4 },

  titleField: {
    fontSize: 17,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
    minHeight: 56,
  },
  notesField: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 112,
    maxHeight: 140,
    marginBottom: 4,
  },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowTitle: { fontSize: 17, fontWeight: '400' },
  rowValue: { fontSize: 17, fontWeight: '400' },
  rowTrail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 24, height: 24, borderRadius: 12 },

  segmentTrack: {
    borderRadius: 10,
    padding: 3,
  },
  segmentScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  segmentCell: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    maxWidth: 92,
  },

  iosButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosButtonText: { fontSize: 17, fontWeight: '700' },

  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  dateModalCard: {
    marginHorizontal: 16,
    marginBottom: 32,
    borderRadius: 14,
    padding: 14,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  dateDone: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calNav: { padding: 6 },
  calMonth: { fontSize: 16, fontWeight: '600' },
  calWeeks: { flexDirection: 'row', marginBottom: 6 },
  calWk: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calEmpty: { width: '14.28%', aspectRatio: 1 },
  calDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calNum: { fontSize: 15, fontWeight: '400' },

  sheetContainer: { flex: 1 },
  sheetGrab: {
    width: 36,
    height: 5,
    borderRadius: 3,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  sheetDone: { fontSize: 17, fontWeight: '600' },
  sheetListCard: {
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
    flex: 1,
    maxHeight: 420,
    minHeight: 200,
  },
  sheetFlatList: {
    flex: 1,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  sheetRowText: { fontSize: 17, fontWeight: '400' },
  androidSheet: {
    marginHorizontal: 16,
    marginBottom: 40,
    borderRadius: 14,
    padding: 16,
    maxHeight: '70%',
  },

  colorSheet: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  modalHdr: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginBottom: 8 },
  colorDot: { width: 44, height: 44, borderRadius: 22 },

  timeSheet: {
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 16,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
  },
  iosTimePickerWrap: {
    height: 216,
    width: '100%',
    overflow: 'hidden',
  },
  iosTimePicker: {
    height: 216,
    width: '100%',
  },
  timeDoneBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },

  webTimeRow: { flexDirection: 'row', gap: 12, height: 180 },
  webCol: { flex: 1 },
  webPick: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 4,
  },
});

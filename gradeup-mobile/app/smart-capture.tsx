import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradePrompt } from '@/hooks/useUpgradePrompt';
import { buildTaskFromExtraction } from '@/src/lib/taskUtils';
import { handleMonthlyLimit, isSmartCaptureLimitError } from '@/src/lib/aiLimitError';
import { useCaptureInbox } from '@/src/lib/smartCapture/useCaptureInbox';
import {
  runSmartCapture,
  type CaptureStep,
  type ReviewItem,
} from '@/src/lib/smartCapture/runSmartCapture';
import {
  getUsesToday,
  recordUse,
  remainingFreeCaptures,
} from '@/src/lib/smartCapture/smartCaptureLimits';
import { markCaptureSuccess } from '@/src/lib/smartCapture/smartCaptureSetupState';
import type { Task } from '@/src/types';

type Phase = 'scanning' | 'review' | 'empty' | 'limit' | 'error' | 'needs_vision' | 'added';

const STEPS: CaptureStep[] = ['read', 'extract', 'match'];

function haptic(kind: 'light' | 'success' | 'warn') {
  if (kind === 'light') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } else if (kind === 'success') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }
}

function formatDateLabel(iso: string): string {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function SmartCaptureSheet() {
  const {
    language,
    courses,
    tasks,
    user,
    academicCalendar,
    addTask,
    deleteTask,
  } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const { upgradeLabel, openPaywall } = useUpgradePrompt();

  const inbox = useCaptureInbox();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [doneSteps, setDoneSteps] = useState<CaptureStep[]>([]);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [emptyReason, setEmptyReason] = useState<'no_tasks' | 'no_text'>('no_tasks');
  const [canUseVision, setCanUseVision] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usesToday, setUsesToday] = useState(0);
  const [addedCount, setAddedCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [datePickerFor, setDatePickerFor] = useState<string | null>(null);
  const [coursePickerFor, setCoursePickerFor] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const addedIdsRef = useRef<string[]>([]);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runTokenRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    haptic('light');
    void getUsesToday().then((n) => {
      if (aliveRef.current) setUsesToday(n);
    });
    return () => {
      aliveRef.current = false;
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const close = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/planner' as never);
  }, []);

  const analyze = useCallback(
    async (allowVision: boolean) => {
      // Nothing resolved yet (the share failed to read, or was already
      // cleared): re-resolve first — the auto-start effect picks it up again.
      if (!inbox.payload) {
        inbox.reload();
        return;
      }
      const token = ++runTokenRef.current;
      setPhase('scanning');
      setDoneSteps([]);
      setErrorMessage(null);

      const outcome = await runSmartCapture(
        {
          source: inbox.source,
          text: inbox.payload.kind === 'text' ? inbox.payload.value : undefined,
          imageUri: inbox.payload.kind === 'image' ? inbox.payload.value : undefined,
          mime: inbox.payload.mime,
        },
        {
          courses: courses.map((c) => ({ id: c.id, name: c.name })),
          tasks: tasks.map((t) => ({ title: t.title, dueDate: t.dueDate })),
          currentWeek: user.currentWeek,
          userId: user.id,
          semesterStartISO: academicCalendar?.startDate,
          country: user.country,
          allowVisionFallback: allowVision,
        },
        (step) => {
          if (!aliveRef.current || runTokenRef.current !== token) return;
          setDoneSteps((prev) => {
            const index = STEPS.indexOf(step);
            return STEPS.slice(0, Math.max(0, index));
          });
        },
      );

      if (!aliveRef.current || runTokenRef.current !== token) return;
      setDoneSteps(STEPS);

      // The server counts a capture as soon as the request reaches it, so the
      // local pill has to follow the same rule or it will understate usage.
      const reachedServer =
        outcome.status === 'ok' ||
        (outcome.status === 'empty' && outcome.reason === 'no_tasks');
      if (reachedServer) {
        void recordUse().then((n) => aliveRef.current && setUsesToday(n));
      }

      if (outcome.status === 'ok') {
        setItems(outcome.items);
        setPhase('review');
        haptic('success');
        return;
      }
      if (outcome.status === 'needs_vision') {
        // The retry re-runs the same capture with the vision fallback enabled.
        setPhase('needs_vision');
        return;
      }
      if (outcome.status === 'empty') {
        setEmptyReason(outcome.reason);
        setCanUseVision(!!outcome.canUseVision);
        setPhase('empty');
        haptic('warn');
        return;
      }

      // status === 'error'
      const error = outcome.error;
      if (isSmartCaptureLimitError({ code: error.serverCode, message: error.message })) {
        setPhase('limit');
        haptic('warn');
        return;
      }
      if (handleMonthlyLimit({ code: error.serverCode, message: error.message }, language)) {
        close();
        return;
      }
      // runSmartCapture reports its own local failures as sentinels so the
      // sheet can phrase them for a student instead of showing plumbing.
      const localCopy: Record<string, string> = {
        IMAGE_TOO_LARGE: T('scImageTooLarge'),
        READ_FAILED: T('scReadFailed'),
      };
      setErrorMessage(localCopy[error.message] ?? error.message);
      setPhase('error');
      haptic('warn');
    },
    [inbox, courses, tasks, user, academicCalendar, language, close, T],
  );

  // Auto-start as soon as the capture is readable, and re-run when a newer
  // capture replaces this one while the sheet is open.
  useEffect(() => {
    if (inbox.isLoading) return;
    if (inbox.error) {
      setErrorMessage(inbox.error.message);
      setPhase('error');
      return;
    }
    if (!inbox.payload) {
      setEmptyReason('no_text');
      setPhase('empty');
      return;
    }
    void analyze(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox.isLoading, inbox.payload?.value, inbox.captureId]);

  const selectedItems = useMemo(() => items.filter((i) => i.selected), [items]);

  const updateItem = useCallback((localId: string, patch: Partial<ReviewItem>) => {
    setItems((prev) => prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }, []);

  const handleAdd = useCallback(
    (thenOpenPlanner: boolean) => {
      if (selectedItems.length === 0) return;
      const created: string[] = [];
      const sourceMessage = inbox.payload?.kind === 'text' ? inbox.payload.value : undefined;

      for (const item of selectedItems) {
        const task: Task = buildTaskFromExtraction(item, {
          fallbackCourseId: courses[0]?.id || 'General',
          user,
          calendarStart: academicCalendar?.startDate,
          sourceMessage,
        });
        addTask(task);
        created.push(task.id);
      }

      addedIdsRef.current = created;
      setAddedCount(created.length);
      setPhase('added');
      haptic('success');
      void markCaptureSuccess(inbox.source);

      if (thenOpenPlanner) {
        router.replace('/(tabs)/planner' as never);
        return;
      }
      dismissTimerRef.current = setTimeout(close, 5000);
    },
    [selectedItems, inbox.payload, inbox.source, courses, user, academicCalendar, addTask, close],
  );

  const handleUndo = useCallback(() => {
    for (const id of addedIdsRef.current) deleteTask(id);
    addedIdsRef.current = [];
    haptic('light');
    close();
  }, [deleteTask, close]);

  const freeLeft = remainingFreeCaptures(user.subscriptionPlan, usesToday);

  const sourceLabel =
    inbox.source === 'paste'
      ? T('scPasted')
      : inbox.payload?.kind === 'image'
        ? T('scFromScreenshot')
        : T('scFromWhatsApp');

  return (
    <View style={s.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={T('scCloseLabel')} />
      <Animated.View
        entering={FadeInDown.duration(220)}
        style={[s.sheet, { backgroundColor: theme.card }]}
      >
        <View style={[s.grabber, { backgroundColor: theme.border }]} />

        <View style={s.header}>
          <View style={[s.sourceChip, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather
              name={inbox.payload?.kind === 'image' ? 'image' : 'message-circle'}
              size={12}
              color={theme.textSecondary}
            />
            <Text style={[s.sourceChipText, { color: theme.textSecondary }]} numberOfLines={1}>
              {sourceLabel}
            </Text>
          </View>

          <View style={s.headerRight}>
            {freeLeft != null ? (
              <Text style={[s.usagePill, { color: theme.textSecondary }]}>
                {freeLeft > 0
                  ? T('scFreeLeftToday').replace('{n}', String(freeLeft))
                  : T('scNoneLeftToday')}
              </Text>
            ) : null}
            <Pressable
              onPress={close}
              hitSlop={12}
              style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather name="x" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={s.body}
          contentContainerStyle={s.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {phase === 'scanning' ? (
            <ScanningState
              theme={theme}
              T={T}
              doneSteps={doneSteps}
              preview={inbox.payload}
            />
          ) : null}

          {phase === 'review' ? (
            <Animated.View entering={FadeIn.duration(180)}>
              <Text style={[s.title, { color: theme.text }]}>
                {items.length === 1
                  ? T('scOneTaskFound')
                  : T('scTasksFound').replace('{n}', String(items.length))}
              </Text>
              <Text style={[s.subtitle, { color: theme.textSecondary }]}>{T('scTapToEdit')}</Text>

              <View style={s.cards}>
                {items.map((item, index) => (
                  <Animated.View
                    key={item.localId}
                    entering={FadeInDown.delay(index * 45).duration(200)}
                    layout={LinearTransition.springify()}
                  >
                    <TaskCard
                      item={item}
                      theme={theme}
                      T={T}
                      courses={courses}
                      isEditing={editingId === item.localId}
                      onToggle={() => updateItem(item.localId, { selected: !item.selected })}
                      onStartEdit={() => setEditingId(item.localId)}
                      onEndEdit={() => setEditingId(null)}
                      onChangeTitle={(title) => updateItem(item.localId, { title })}
                      onPressDate={() => setDatePickerFor(item.localId)}
                      onPressCourse={() => setCoursePickerFor(item.localId)}
                    />
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          ) : null}

          {phase === 'needs_vision' ? (
            <EmptyState
              theme={theme}
              icon="eye-off"
              title={T('scReadingFailed')}
              lines={[T('scReasonHardToRead')]}
            >
              <PrimaryButton
                theme={theme}
                label={T('scTryVision')}
                onPress={() => void analyze(true)}
              />
              <Text style={[s.helperText, { color: theme.textSecondary }]}>{T('scTryVisionSub')}</Text>
              <SecondaryButton theme={theme} label={T('scRetry')} onPress={() => void analyze(false)} />
            </EmptyState>
          ) : null}

          {phase === 'empty' ? (
            <EmptyState
              theme={theme}
              icon="inbox"
              title={T('scNothingFound')}
              lines={[
                emptyReason === 'no_text' ? T('scReasonHardToRead') : T('scReasonNoDates'),
              ]}
            >
              {canUseVision ? (
                <>
                  {/* A busy chat screenshot flattens into a noisy dump; the
                      vision model reads the layout and usually finds the one
                      message that matters. */}
                  <PrimaryButton
                    theme={theme}
                    label={T('scTryVision')}
                    onPress={() => void analyze(true)}
                  />
                  <Text style={[s.helperText, { color: theme.textSecondary }]}>
                    {T('scTryVisionSub')}
                  </Text>
                  <SecondaryButton
                    theme={theme}
                    label={T('scPasteInstead')}
                    onPress={() => router.replace('/ai-chat' as never)}
                  />
                </>
              ) : (
                <>
                  <PrimaryButton
                    theme={theme}
                    label={T('scPasteInstead')}
                    onPress={() => router.replace('/ai-chat' as never)}
                  />
                  <SecondaryButton theme={theme} label={T('scRetry')} onPress={() => void analyze(false)} />
                </>
              )}
            </EmptyState>
          ) : null}

          {phase === 'limit' ? (
            <EmptyState theme={theme} icon="zap" title={T('scLimitTitle')} lines={[T('scLimitBody')]}>
              <PrimaryButton theme={theme} label={upgradeLabel('plus')} onPress={openPaywall} />
            </EmptyState>
          ) : null}

          {phase === 'error' ? (
            <EmptyState
              theme={theme}
              icon="alert-triangle"
              title={T('scReadingFailed')}
              lines={errorMessage ? [errorMessage] : []}
            >
              <PrimaryButton theme={theme} label={T('scRetry')} onPress={() => void analyze(false)} />
            </EmptyState>
          ) : null}

          {phase === 'added' ? (
            <Animated.View entering={FadeIn.duration(160)} style={s.addedWrap}>
              <View style={[s.addedIcon, { backgroundColor: theme.success }]}>
                <Feather name="check" size={26} color="#fff" />
              </View>
              <Text style={[s.title, { color: theme.text, textAlign: 'center' }]}>
                {addedCount === 1
                  ? T('scAddedOne')
                  : T('scAdded').replace('{n}', String(addedCount))}
              </Text>
              <Pressable onPress={handleUndo} hitSlop={10}>
                <Text style={[s.undoText, { color: theme.primary }]}>{T('scUndo')}</Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </ScrollView>

        {phase === 'review' ? (
          <View style={[s.footer, { borderTopColor: theme.border }]}>
            <PrimaryButton
              theme={theme}
              disabled={selectedItems.length === 0}
              label={
                selectedItems.length === 1
                  ? T('scAddOneTask')
                  : T('scAddTasks').replace('{n}', String(selectedItems.length))
              }
              onPress={() => handleAdd(false)}
            />
            <Pressable onPress={() => handleAdd(true)} disabled={selectedItems.length === 0} hitSlop={8}>
              <Text
                style={[
                  s.footerLink,
                  { color: selectedItems.length === 0 ? theme.textSecondary : theme.primary },
                ]}
              >
                {T('scAddOpenPlanner')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Animated.View>

      {datePickerFor ? (
        <DateTimePicker
          value={(() => {
            const item = items.find((i) => i.localId === datePickerFor);
            const parsed = item?.due_date ? new Date(`${item.due_date}T00:00:00`) : new Date();
            return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
          })()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            const target = datePickerFor;
            setDatePickerFor(null);
            if (event.type === 'dismissed' || !date || !target) return;
            // Both flags must clear: buildTaskFromExtraction ORs them into
            // `needsDate`, and a task saved with needsDate true has its due date
            // reset to today on the next load (see taskDb.rowToTask).
            updateItem(target, {
              due_date: toISODate(date),
              needs_date: false,
              is_inferred_date: false,
            });
          }}
        />
      ) : null}

      {coursePickerFor ? (
        <Pressable style={s.pickerOverlay} onPress={() => setCoursePickerFor(null)}>
          <View style={[s.pickerCard, { backgroundColor: theme.card }]}>
            <Text style={[s.pickerTitle, { color: theme.text }]}>{T('scPickCourse')}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {courses.map((course) => (
                <Pressable
                  key={course.id}
                  onPress={() => {
                    updateItem(coursePickerFor, { course_id: course.id, is_unknown_course: false });
                    setCoursePickerFor(null);
                  }}
                  style={({ pressed }) => [
                    s.pickerRow,
                    pressed && { backgroundColor: theme.backgroundSecondary },
                  ]}
                >
                  <Text style={[s.pickerRowText, { color: theme.text }]}>{course.id}</Text>
                  <Text style={[s.pickerRowSub, { color: theme.textSecondary }]} numberOfLines={1}>
                    {course.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

type ThemeShape = ReturnType<typeof useTheme>;
type Translate = ReturnType<typeof useTranslations>;

function ScanningState({
  theme,
  T,
  doneSteps,
  preview,
}: {
  theme: ThemeShape;
  T: Translate;
  doneSteps: CaptureStep[];
  preview: { kind: 'text' | 'image'; value: string } | null;
}) {
  const labels: Record<CaptureStep, string> = {
    read: T('scReading'),
    extract: T('scFindingDeadlines'),
    match: T('scMatchingCourses'),
  };

  return (
    <View style={s.scanRow}>
      {preview?.kind === 'image' ? (
        <Image source={{ uri: preview.value }} style={s.thumb} resizeMode="cover" />
      ) : (
        <View style={[s.quoteCard, { backgroundColor: theme.backgroundSecondary }]}>
          <Text style={[s.quoteText, { color: theme.textSecondary }]} numberOfLines={4}>
            {preview?.value ?? ''}
          </Text>
        </View>
      )}

      <View style={s.steps}>
        {STEPS.map((step) => {
          const done = doneSteps.includes(step);
          return (
            <View key={step} style={s.stepRow}>
              {done ? (
                <Feather name="check-circle" size={16} color={theme.success} />
              ) : (
                <ActivityIndicator size="small" color={theme.primary} />
              )}
              <Text
                style={[s.stepText, { color: done ? theme.text : theme.textSecondary }]}
                numberOfLines={1}
              >
                {labels[step]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TaskCard({
  item,
  theme,
  T,
  courses,
  isEditing,
  onToggle,
  onStartEdit,
  onEndEdit,
  onChangeTitle,
  onPressDate,
  onPressCourse,
}: {
  item: ReviewItem;
  theme: ThemeShape;
  T: Translate;
  courses: { id: string; name: string }[];
  isEditing: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onChangeTitle: (title: string) => void;
  onPressDate: () => void;
  onPressCourse: () => void;
}) {
  const dimmed = item.alreadyExists && !item.selected;
  const knownCourse = courses.some((c) => c.id === item.course_id);

  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: theme.backgroundSecondary,
          borderColor: item.selected ? theme.primary : theme.border,
          opacity: dimmed ? 0.55 : 1,
        },
      ]}
    >
      <Pressable onPress={onToggle} hitSlop={8} style={s.checkbox}>
        <View
          style={[
            s.checkboxBox,
            {
              borderColor: item.selected ? theme.primary : theme.border,
              backgroundColor: item.selected ? theme.primary : 'transparent',
            },
          ]}
        >
          {item.selected ? <Feather name="check" size={14} color={theme.textInverse} /> : null}
        </View>
      </Pressable>

      <View style={s.cardBody}>
        {isEditing ? (
          <TextInput
            value={item.title}
            onChangeText={onChangeTitle}
            onBlur={onEndEdit}
            autoFocus
            style={[s.cardTitle, s.cardTitleInput, { color: theme.text, borderBottomColor: theme.primary }]}
          />
        ) : (
          <Pressable onPress={onStartEdit}>
            <Text style={[s.cardTitle, { color: theme.text }]}>{item.title}</Text>
          </Pressable>
        )}

        <View style={s.chipRow}>
          <Pressable
            onPress={onPressCourse}
            style={[
              s.chip,
              {
                backgroundColor: knownCourse ? theme.card : theme.warning + '22',
                borderColor: knownCourse ? theme.border : theme.warning,
              },
            ]}
          >
            <Feather
              name="book"
              size={11}
              color={knownCourse ? theme.textSecondary : theme.warning}
            />
            <Text
              style={[s.chipText, { color: knownCourse ? theme.textSecondary : theme.warning }]}
              numberOfLines={1}
            >
              {knownCourse ? item.course_id : T('scPickCourse')}
            </Text>
          </Pressable>

          <Pressable
            onPress={onPressDate}
            style={[
              s.chip,
              {
                backgroundColor: item.needs_date ? theme.warning + '22' : theme.card,
                borderColor: item.needs_date ? theme.warning : theme.border,
              },
            ]}
          >
            <Feather
              name="calendar"
              size={11}
              color={item.needs_date ? theme.warning : theme.textSecondary}
            />
            <Text style={[s.chipText, { color: item.needs_date ? theme.warning : theme.textSecondary }]}>
              {item.needs_date || !item.due_date ? T('scSetDate') : formatDateLabel(item.due_date)}
            </Text>
          </Pressable>

          <View style={[s.chip, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.chipText, { color: theme.textSecondary }]}>{item.type}</Text>
          </View>
        </View>

        {item.alreadyExists ? (
          <Text style={[s.cardNote, { color: theme.textSecondary }]}>{T('scAlreadyInPlanner')}</Text>
        ) : null}
      </View>
    </View>
  );
}

function EmptyState({
  theme,
  icon,
  title,
  lines,
  children,
}: {
  theme: ThemeShape;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  lines: string[];
  children?: React.ReactNode;
}) {
  return (
    <Animated.View entering={FadeIn.duration(180)} style={s.emptyWrap}>
      <View style={[s.emptyIcon, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name={icon} size={24} color={theme.textSecondary} />
      </View>
      <Text style={[s.title, { color: theme.text, textAlign: 'center' }]}>{title}</Text>
      {lines.map((line) => (
        <Text key={line} style={[s.subtitle, { color: theme.textSecondary, textAlign: 'center' }]}>
          {line}
        </Text>
      ))}
      <View style={s.emptyActions}>{children}</View>
    </Animated.View>
  );
}

function PrimaryButton({
  theme,
  label,
  onPress,
  disabled,
}: {
  theme: ThemeShape;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.primaryBtn,
        {
          backgroundColor: disabled ? theme.border : theme.primary,
          opacity: pressed && !disabled ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[s.primaryBtnText, { color: disabled ? theme.textSecondary : theme.textInverse }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({
  theme,
  label,
  onPress,
}: {
  theme: ThemeShape;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
      <Text style={[s.footerLink, { color: theme.primary }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 12,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexShrink: 1,
  },
  sourceChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  usagePill: { fontSize: 11, fontWeight: '700' },
  closeBtn: { padding: 2 },

  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 },

  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontWeight: '500', marginTop: 4, lineHeight: 19 },

  scanRow: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingVertical: 12 },
  thumb: { width: 84, height: 118, borderRadius: 14 },
  quoteCard: { width: 84, height: 118, borderRadius: 14, padding: 10, justifyContent: 'center' },
  quoteText: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  steps: { flex: 1, gap: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepText: { fontSize: 14, fontWeight: '700', flex: 1 },

  cards: { marginTop: 16, gap: 10 },
  card: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1.5 },
  checkbox: { paddingTop: 2 },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  cardTitleInput: { borderBottomWidth: 1.5, paddingVertical: 2 },
  cardNote: { fontSize: 11, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    maxWidth: 170,
  },
  chipText: { fontSize: 11, fontWeight: '800' },

  emptyWrap: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyActions: { marginTop: 18, gap: 14, alignItems: 'center', alignSelf: 'stretch' },
  helperText: { fontSize: 12, textAlign: 'center', marginTop: -6, paddingHorizontal: 20 },

  addedWrap: { alignItems: 'center', paddingVertical: 30, gap: 12 },
  addedIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  undoText: { fontSize: 14, fontWeight: '800', paddingVertical: 6 },

  footer: { paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, gap: 12, alignItems: 'center' },
  footerLink: { fontSize: 13, fontWeight: '800' },

  primaryBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 20,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },

  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  pickerCard: { width: '100%', borderRadius: 22, padding: 18, gap: 10 },
  pickerTitle: { fontSize: 16, fontWeight: '900' },
  pickerRow: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 12 },
  pickerRowText: { fontSize: 14, fontWeight: '800' },
  pickerRowSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});

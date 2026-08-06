import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { scheduleStudyTimerComplete, cancelStudyTimerNotification } from '@/src/notificationManager';
import { getCurrentTimetableSubjectLabel } from '@/src/lib/timetableCurrentSlot';

// Duration presets (milliseconds)
const PRESETS = [
  { label: '25 min', focus: 25, breakMin: 5 },
  { label: '45 min', focus: 45, breakMin: 10 },
  { label: '60 min', focus: 60, breakMin: 15 },
  { label: 'Custom', focus: 25, breakMin: 5 },
];

type Phase = 'focus' | 'break' | 'idle';

export default function StudyTimerScreen() {
  const theme = useTheme();
  const { courses, timetable } = useApp();
  const { updateActivity, clearMyActivity } = useCommunity();

  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0);
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || '');
  const [broadcastEnabled, setBroadcastEnabled] = useState(true);

  const [phase, setPhase] = useState<Phase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(PRESETS[0].focus * 60);
  const [completedSessions, setCompletedSessions] = useState(0);
  // Real state, not derived from timerRef.current — a ref change doesn't
  // trigger a re-render, so reading the ref at render time made the button
  // freeze on "Pause" forever after the first pause (pressing it again was a
  // silent no-op, and there was no way to reach the "Resume" branch below).
  const [isRunning, setIsRunning] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const preset = PRESETS[selectedPresetIdx];
  const focusSecs = preset.focus * 60;
  const breakSecs = preset.breakMin * 60;

  const totalSecs = phase === 'break' ? breakSecs : focusSecs;
  const progress = secondsLeft / totalSecs;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Pulse animation while running
  const startPulse = useCallback(() => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (initialSecs: number, currentPhase: Phase) => {
      clearTimer();
      let secs = initialSecs;
      setSecondsLeft(secs);
      setIsRunning(true);
      startPulse();

      timerRef.current = setInterval(() => {
        secs -= 1;
        setSecondsLeft(secs);

        if (secs <= 0) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setIsRunning(false);
          stopPulse();

          if (currentPhase === 'focus') {
            setCompletedSessions((prev) => prev + 1);
            setPhase('break');
            setSecondsLeft(breakSecs);
            // Don't auto-start break – let user press Start
          } else {
            setPhase('idle');
            setSecondsLeft(focusSecs);
          }
        }
      }, 1000);
    },
    [clearTimer, startPulse, stopPulse, breakSecs, focusSecs]
  );

  const handleStart = useCallback(async () => {
    if (phase === 'idle') {
      setPhase('focus');
      startTimer(focusSecs, 'focus');
      scheduleStudyTimerComplete(preset.focus, selectedCourseId || undefined).catch(() => {});
      if (broadcastEnabled) {
        const course = courses.find((c) => c.id === selectedCourseId);
        const slotLabel = getCurrentTimetableSubjectLabel(timetable);
        const detail = course?.id || slotLabel || 'Studying';
        await updateActivity('studying', detail, course?.id || slotLabel || undefined);
      }
    } else if (phase === 'break' && !isRunning) {
      // secondsLeft already holds the right value whether this is a fresh
      // break (just set to breakSecs when focus completed) or a paused one.
      startTimer(secondsLeft, 'break');
    } else if (phase === 'focus' && !isRunning) {
      // Resume a paused focus session from where it left off, not from the
      // top — and re-schedule the completion notification for the actual
      // remaining time, since handlePause cancelled the original one.
      startTimer(secondsLeft, 'focus');
      const remainingMinutes = Math.max(1, Math.ceil(secondsLeft / 60));
      scheduleStudyTimerComplete(remainingMinutes, selectedCourseId || undefined).catch(() => {});
    }
  }, [phase, isRunning, startTimer, focusSecs, secondsLeft, broadcastEnabled, courses, selectedCourseId, timetable, updateActivity, preset.focus]);

  const handlePause = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    stopPulse();
    cancelStudyTimerNotification().catch(() => {});
  }, [clearTimer, stopPulse]);

  const handleReset = useCallback(async () => {
    clearTimer();
    setIsRunning(false);
    stopPulse();
    cancelStudyTimerNotification().catch(() => {});
    setPhase('idle');
    setSecondsLeft(focusSecs);
    if (broadcastEnabled) {
      await clearMyActivity().catch(() => {});
    }
  }, [clearTimer, stopPulse, focusSecs, broadcastEnabled, clearMyActivity]);

  // Latest phase/broadcastEnabled for the unmount cleanup below — read via
  // ref so the cleanup (which must stay mount-once to only fire on a real
  // unmount, not every phase change) always sees the current values instead
  // of whatever they were when the effect was first set up.
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const broadcastEnabledRef = useRef(broadcastEnabled);
  useEffect(() => { broadcastEnabledRef.current = broadcastEnabled; }, [broadcastEnabled]);

  // Clean up on unmount. Navigating away mid-session (back button / swipe)
  // used to only clear the interval — the scheduled "session complete"
  // notification still fired for an abandoned session, and Community
  // presence stayed stuck on "studying" indefinitely since only handleReset
  // used to clear either of those.
  useEffect(() => {
    return () => {
      clearTimer();
      stopPulse();
      if (phaseRef.current !== 'idle') {
        cancelStudyTimerNotification().catch(() => {});
        if (broadcastEnabledRef.current) {
          void clearMyActivity().catch(() => {});
        }
      }
    };
  }, [clearTimer, stopPulse, clearMyActivity]);

  // Derived colors
  const accentColor = phase === 'break' ? '#10b981' : theme.primary;
  const bgGradientColor = phase === 'break' ? '#10b98118' : (theme.primary + '14');

  const circumference = 2 * Math.PI * 100;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Focus Timer</Text>
        {completedSessions > 0 && (
          <View style={[styles.sessionBadge, { backgroundColor: accentColor + '22' }]}>
            <Feather name="check-circle" size={14} color={accentColor} />
            <Text style={[styles.sessionBadgeText, { color: accentColor }]}>×{completedSessions}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Phase label */}
        <Text style={[styles.phaseLabel, { color: theme.textSecondary }]}>
          {phase === 'focus' ? '📚 Focus Session' : phase === 'break' ? '☕ Break Time' : '⏱️ Ready to Focus'}
        </Text>

        {/* Circular Timer */}
        <Animated.View style={[styles.timerRingWrap, { transform: [{ scale: pulseAnim }] }]}>
          <View style={[styles.timerRingBg, { backgroundColor: bgGradientColor }]}>
            {/* SVG-like ring using border approach */}
            <View style={[styles.timerRingOuter, { borderColor: accentColor + '30' }]}>
              <View style={[styles.timerRingInner, { borderColor: accentColor }]}>
                <Text style={[styles.timerText, { color: theme.text }]}>{timeStr}</Text>
                <Text style={[styles.timerPhaseText, { color: accentColor }]}>
                  {phase === 'break' ? 'break' : phase === 'focus' ? 'focus' : 'start'}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Preset selector (only in idle) */}
        {phase === 'idle' && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Duration</Text>
            <View style={styles.presetRow}>
              {PRESETS.slice(0, 3).map((p, idx) => (
                <Pressable
                  key={p.label}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor:
                        selectedPresetIdx === idx ? accentColor + '18' : theme.card,
                      borderColor: selectedPresetIdx === idx ? accentColor : theme.border,
                    },
                  ]}
                  onPress={() => {
                    setSelectedPresetIdx(idx);
                    setSecondsLeft(p.focus * 60);
                  }}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      { color: selectedPresetIdx === idx ? accentColor : theme.text },
                    ]}
                  >
                    {p.label}
                  </Text>
                  <Text style={[styles.presetBreakText, { color: theme.textSecondary }]}>
                    +{p.breakMin}m break
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Subject picker */}
            {courses.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Subject</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subjectRow}
                >
                  {courses.map((c) => (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.subjectChip,
                        {
                          backgroundColor:
                            selectedCourseId === c.id ? accentColor + '18' : theme.card,
                          borderColor: selectedCourseId === c.id ? accentColor : theme.border,
                        },
                      ]}
                      onPress={() => setSelectedCourseId(c.id)}
                    >
                      <Text
                        style={[
                          styles.subjectChipText,
                          { color: selectedCourseId === c.id ? accentColor : theme.text },
                        ]}
                      >
                        {c.id}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Broadcast toggle */}
            <View style={[styles.broadcastRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.broadcastLeft}>
                <Feather name="users" size={18} color={accentColor} />
                <View style={styles.broadcastText}>
                  <Text style={[styles.broadcastTitle, { color: theme.text }]}>Study with Friends</Text>
                  <Text style={[styles.broadcastDesc, { color: theme.textSecondary }]}>
                    Show your focus on the Community map
                  </Text>
                </View>
              </View>
              <Switch
                value={broadcastEnabled}
                onValueChange={setBroadcastEnabled}
                trackColor={{ false: theme.border, true: accentColor + '99' }}
                thumbColor={broadcastEnabled ? accentColor : theme.textSecondary}
              />
            </View>
          </>
        )}

        {/* Session info during active timer */}
        {phase !== 'idle' && (
          <View style={[styles.sessionInfo, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sessionInfoLabel, { color: theme.textSecondary }]}>Subject</Text>
            <Text style={[styles.sessionInfoValue, { color: theme.text }]}>
              {selectedCourseId || 'General Study'}
            </Text>
            {broadcastEnabled && (
              <View style={styles.broadcastBadge}>
                <Feather name="radio" size={12} color={accentColor} />
                <Text style={[styles.broadcastBadgeText, { color: accentColor }]}>
                  Live on Community
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {phase === 'idle' ? (
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: accentColor },
                pressed && styles.pressed,
              ]}
              onPress={handleStart}
            >
              <Feather name="play" size={22} color="#fff" />
              <Text style={styles.primaryBtnText}>Start Focus</Text>
            </Pressable>
          ) : phase === 'break' && !isRunning ? (
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: '#10b981' },
                pressed && styles.pressed,
              ]}
              onPress={handleStart}
            >
              <Feather name="play" size={22} color="#fff" />
              <Text style={styles.primaryBtnText}>Start Break</Text>
            </Pressable>
          ) : (
            <View style={styles.activeControls}>
              {isRunning ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.controlBtn,
                    { backgroundColor: theme.card, borderColor: theme.border },
                    pressed && styles.pressed,
                  ]}
                  onPress={handlePause}
                >
                  <Feather name="pause" size={22} color={theme.text} />
                  <Text style={[styles.controlBtnText, { color: theme.text }]}>Pause</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.controlBtn,
                    { backgroundColor: accentColor + '18', borderColor: accentColor },
                    pressed && styles.pressed,
                  ]}
                  onPress={handleStart}
                >
                  <Feather name="play" size={22} color={accentColor} />
                  <Text style={[styles.controlBtnText, { color: accentColor }]}>Resume</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [
                  styles.controlBtn,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}
                onPress={handleReset}
              >
                <Feather name="x" size={22} color={theme.textSecondary} />
                <Text style={[styles.controlBtnText, { color: theme.textSecondary }]}>End</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerTitle: { fontSize: 20, fontWeight: '800', flex: 1 },
  sessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sessionBadgeText: { fontSize: 13, fontWeight: '700' },

  content: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },

  phaseLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  },
  phaseLabel: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Circular timer
  timerRingWrap: { marginBottom: 40 },
  timerRingBg: {
    width: 240,
    height: 240,
    borderRadius: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerRingOuter: {
    width: 224,
    height: 224,
    borderRadius: 112,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerRingInner: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: { fontSize: 52, fontWeight: '800', letterSpacing: -2 },
  timerPhaseText: { fontSize: 13, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },

  // Preset
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    alignSelf: 'flex-start',
    marginBottom: 10,
    marginTop: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
    width: '100%',
  },
  presetChip: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  presetChipText: { fontSize: 14, fontWeight: '700' },
  presetBreakText: { fontSize: 11, marginTop: 2 },

  // Subject
  subjectRow: { gap: 8, paddingBottom: 4, marginBottom: 16 },
  subjectChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  subjectChipText: { fontSize: 13, fontWeight: '700' },

  // Broadcast toggle
  broadcastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 28,
    width: '100%',
  },
  broadcastLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  broadcastText: { flex: 1 },
  broadcastTitle: { fontSize: 14, fontWeight: '700' },
  broadcastDesc: { fontSize: 12, marginTop: 2 },

  // Session info
  sessionInfo: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 28,
  },
  sessionInfoLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  sessionInfoValue: { fontSize: 16, fontWeight: '700' },
  broadcastBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  broadcastBadgeText: { fontSize: 12, fontWeight: '700' },

  // Controls
  controls: { width: '100%' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 20,
  },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  activeControls: { flexDirection: 'row', gap: 12 },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  controlBtnText: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});

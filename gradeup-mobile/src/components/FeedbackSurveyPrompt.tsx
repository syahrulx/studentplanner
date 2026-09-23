import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  type AppStateStatus,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { contrastText } from '../lib/contrast';
import {
  fetchFeedbackSurveyCandidates,
  hasFeedbackBlockingOverlay,
  isAnswered,
  markFeedbackSurveyDismissed,
  markFeedbackSurveyShown,
  onFeedbackEvent,
  pickFeedbackSurvey,
  pickLang,
  recordFeedbackAppOpen,
  submitFeedbackSurvey,
  surveyHasMalay,
  type FeedbackAnswer,
  type FeedbackAnswers,
  type FeedbackCheckContext,
  type FeedbackLanguage,
  type FeedbackQuestion,
  type FeedbackSurvey,
} from '../lib/feedbackSurvey';
import { supabase } from '../lib/supabase';

/** Let the home screen settle (and What's New show first) before checking on launch. */
const LAUNCH_DELAY_MS = 8000;
/** Short pause after an action so the popup doesn't cover its success feedback. */
const EVENT_DELAY_MS = 1800;
/** A foreground after this long in the background counts as a new app open. */
const NEW_OPEN_AFTER_MS = 30 * 60 * 1000;
/** Server candidates are re-fetched at most this often. */
const CANDIDATE_TTL_MS = 5 * 60 * 1000;

const COPY = {
  en: { next: 'Next', back: 'Back', submit: 'Send', notNow: 'Not now', optional: 'Optional',
    thanks: 'Thanks — got it.', thanksBody: 'This goes straight to the people building Rencana.',
    failed: 'Couldn’t send. Check your connection and try again.', pickMany: 'Pick all that apply',
    typeHere: 'Type your answer…', ratingLow: 'Not great', ratingHigh: 'Love it' },
  ms: { next: 'Seterusnya', back: 'Kembali', submit: 'Hantar', notNow: 'Nanti', optional: 'Tidak wajib',
    thanks: 'Terima kasih — dah sampai.', thanksBody: 'Terus sampai kepada team yang membina Rencana.',
    failed: 'Tak dapat hantar. Semak sambungan dan cuba lagi.', pickMany: 'Pilih semua yang berkaitan',
    typeHere: 'Tulis jawapan anda…', ratingLow: 'Kurang baik', ratingHigh: 'Suka sangat' },
} as const;

/** Question types where one tap is the whole answer, so we move on by ourselves. */
const AUTO_ADVANCE_DELAY_MS = 320;

/** Questions differ in height; ease the sheet to its new size instead of snapping. */
function animateSheetResize() {
  LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
}

// One survey per app process at most, however many triggers fire.
let shownThisSession = false;

export default function FeedbackSurveyPrompt() {
  const segments = useSegments();
  const inAuthFlow = segments[0] === '(auth)';
  const inAuthFlowRef = useRef(inAuthFlow);
  inAuthFlowRef.current = inAuthFlow;

  const [survey, setSurvey] = useState<FeedbackSurvey | null>(null);
  const [visible, setVisible] = useState(false);
  const candidatesRef = useRef<{ at: number; items: FeedbackSurvey[] } | null>(null);
  const checkingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const check = useCallback(async (context: FeedbackCheckContext) => {
    if (shownThisSession || checkingRef.current || inAuthFlowRef.current || hasFeedbackBlockingOverlay()) return;
    checkingRef.current = true;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const cached = candidatesRef.current;
      let items = cached && Date.now() - cached.at < CANDIDATE_TTL_MS ? cached.items : null;
      if (!items) {
        items = await fetchFeedbackSurveyCandidates();
        candidatesRef.current = { at: Date.now(), items };
      }
      const picked = await pickFeedbackSurvey(items, context);
      if (!picked || shownThisSession || inAuthFlowRef.current || hasFeedbackBlockingOverlay()) return;
      // The server bumps the prompt budget; if it refuses (survey just turned
      // off), don't show a popup whose answers would be rejected.
      if (!(await markFeedbackSurveyShown(picked.id))) return;
      shownThisSession = true;
      candidatesRef.current = null;
      setSurvey(picked);
      setVisible(true);
    } catch {
      /* feedback is never worth surfacing an error for */
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const later = useCallback((ms: number, context: FeedbackCheckContext) => {
    timersRef.current.push(setTimeout(() => void check(context), ms));
  }, [check]);

  // Launch + foreground: count an app open, then check for open-triggered surveys.
  useEffect(() => {
    let backgroundedAt: number | null = null;
    void recordFeedbackAppOpen().then(() => later(LAUNCH_DELAY_MS, { kind: 'open' }));

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background') {
        backgroundedAt = Date.now();
      } else if (next === 'active' && backgroundedAt != null) {
        const away = Date.now() - backgroundedAt;
        backgroundedAt = null;
        if (away >= NEW_OPEN_AFTER_MS) {
          candidatesRef.current = null;
          void recordFeedbackAppOpen().then(() => later(4000, { kind: 'open' }));
        }
      }
    });
    const unsubscribe = onFeedbackEvent((event) => later(EVENT_DELAY_MS, { kind: 'event', event }));
    const timers = timersRef.current;
    return () => {
      sub.remove();
      unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, [later]);

  if (!survey) return null;
  return (
    <SurveySheet
      key={survey.id}
      survey={survey}
      visible={visible}
      onClosed={() => {
        setVisible(false);
        setSurvey(null);
      }}
    />
  );
}

function SurveySheet({ survey, visible, onClosed }: {
  survey: FeedbackSurvey;
  visible: boolean;
  onClosed: () => void;
}) {
  const theme = useTheme();
  const isDark = isDarkTheme(theme.id);
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const slide = useRef(new Animated.Value(screenH)).current;
  const fade = useRef(new Animated.Value(0)).current;

  const hasMalay = surveyHasMalay(survey);
  const [lang, setLang] = useState<FeedbackLanguage>('en');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<FeedbackAnswers>({});
  const [phase, setPhase] = useState<'answering' | 'sending' | 'done'>('answering');
  const [error, setError] = useState('');
  const closingRef = useRef(false);

  const t = COPY[lang];
  const questions = survey.questions;
  const q = questions[index];
  const isLast = index === questions.length - 1;
  const canAdvance = !q.required || isAnswered(q, answers[q.id]);

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.spring(slide, { toValue: 0, damping: 22, stiffness: 180, mass: 0.9, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [visible, slide, fade]);

  const close = useCallback((dismissed: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (dismissed) void markFeedbackSurveyDismissed(survey.id);
    Animated.parallel([
      Animated.timing(slide, { toValue: screenH, duration: 260, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => onClosed());
  }, [survey.id, slide, fade, screenH, onClosed]);

  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
  }, []);

  const setAnswer = (value: FeedbackAnswer | undefined) => {
    setError('');
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (value !== undefined && q.type !== 'text') Haptics.selectionAsync().catch(() => {});
    if (value !== undefined && !isLast && (q.type === 'rating' || q.type === 'single')) {
      advanceTimerRef.current = setTimeout(() => {
        animateSheetResize();
        setIndex((i) => Math.min(i + 1, questions.length - 1));
      }, AUTO_ADVANCE_DELAY_MS);
    }
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[q.id];
      else next[q.id] = value;
      return next;
    });
  };

  const submit = async () => {
    setPhase('sending');
    setError('');
    const payload: FeedbackAnswers = {};
    for (const question of questions) {
      const a = answers[question.id];
      if (isAnswered(question, a)) payload[question.id] = typeof a === 'string' ? a.trim() : (a as FeedbackAnswer);
    }
    const res = await submitFeedbackSurvey(survey.id, payload, lang);
    if (!res.ok) {
      setPhase('answering');
      setError(t.failed);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    animateSheetResize();
    setPhase('done');
    setTimeout(() => close(false), 1800);
  };

  const sheetBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const surface = isDark ? '#2C2C2E' : '#F2F2F7';
  const textPrimary = isDark ? '#FFFFFF' : '#0A0A0A';
  const textSecondary = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
  const accent = theme.primary;
  const onAccent = contrastText(accent);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => close(phase !== 'done')}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { opacity: fade, backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)' }]}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ translateY: slide }],
              maxHeight: Math.max(360, screenH - Math.max(insets.top, 8) - 16),
              paddingBottom: Math.max(insets.bottom + 8, 16),
            },
          ]}
        >
          <View style={[styles.pane, { backgroundColor: sheetBg }]}>
            {phase === 'done' ? (
              <View style={styles.done}>
                <View style={[styles.doneIcon, { backgroundColor: accent }]}>
                  <Feather name="check" size={30} color={onAccent} />
                </View>
                <Text style={[styles.title, styles.center, { color: textPrimary }]}>{t.thanks}</Text>
                <Text style={[styles.intro, styles.center, { color: textSecondary }]}>{t.thanksBody}</Text>
              </View>
            ) : (
              <>
                <View style={styles.header}>
                  {hasMalay ? (
                    <View style={[styles.langToggle, { backgroundColor: surface }]}>
                      {(['en', 'ms'] as const).map((l) => (
                        <Pressable
                          key={l}
                          onPress={() => setLang(l)}
                          style={[styles.langBtn, lang === l && { backgroundColor: accent }]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: lang === l }}
                        >
                          <Text style={[styles.langText, { color: lang === l ? onAccent : textSecondary }]}>
                            {l === 'en' ? 'EN' : 'BM'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : <View />}
                  <Pressable
                    onPress={() => close(true)}
                    hitSlop={12}
                    style={[styles.closeBtn, { backgroundColor: surface }]}
                    accessibilityRole="button"
                    accessibilityLabel={t.notNow}
                  >
                    <Feather name="x" size={18} color={textSecondary} />
                  </Pressable>
                </View>

                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                  {/* The survey title introduces page one; later pages lead with the question itself. */}
                  {index === 0 ? (
                    <>
                      <Text style={[styles.title, { color: textPrimary }]}>{pickLang(survey.title_en, survey.title_ms, lang)}</Text>
                      {!!pickLang(survey.intro_en, survey.intro_ms, lang) && (
                        <Text style={[styles.intro, { color: textSecondary }]}>{pickLang(survey.intro_en, survey.intro_ms, lang)}</Text>
                      )}
                    </>
                  ) : (
                    <Text style={[styles.eyebrow, { color: textSecondary }]} numberOfLines={1}>
                      {pickLang(survey.title_en, survey.title_ms, lang)}
                    </Text>
                  )}

                  {questions.length > 1 && (
                    <View style={styles.segments} accessibilityLabel={`${index + 1} / ${questions.length}`}>
                      {questions.map((qq, i) => (
                        <View key={qq.id} style={[styles.segment, { backgroundColor: i <= index ? accent : surface }]} />
                      ))}
                    </View>
                  )}

                  <Text style={[styles.prompt, index === 0 ? styles.promptAfterTitle : null, { color: textPrimary }]}>
                    {pickLang(q.prompt_en, q.prompt_ms, lang)}
                  </Text>
                  {(q.type === 'multi' || !q.required) && (
                    <Text style={[styles.hint, { color: textSecondary }]}>
                      {[q.type === 'multi' ? t.pickMany : null, q.required ? null : t.optional].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  <View style={styles.inputGap} />

                  <QuestionInput
                    q={q}
                    lang={lang}
                    value={answers[q.id]}
                    onChange={setAnswer}
                    colors={{ surface, textPrimary, textSecondary, accent, onAccent }}
                    placeholderFallback={t.typeHere}
                    ratingLabels={[t.ratingLow, t.ratingHigh]}
                  />

                  {!!error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
                </ScrollView>

                <View style={styles.footer}>
                  {index > 0 && (
                    <Pressable
                      onPress={() => {
                        animateSheetResize();
                        setIndex((i) => i - 1);
                      }}
                      style={[styles.secondaryBtn, { backgroundColor: surface }]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.secondaryText, { color: textPrimary }]}>{t.back}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      if (isLast) {
                        void submit();
                        return;
                      }
                      animateSheetResize();
                      setIndex((i) => i + 1);
                    }}
                    disabled={!canAdvance || phase === 'sending'}
                    style={[styles.primaryBtn, { backgroundColor: accent, opacity: canAdvance ? 1 : 0.4 }]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canAdvance || phase === 'sending' }}
                  >
                    {phase === 'sending'
                      ? <ActivityIndicator color={onAccent} />
                      : <Text style={[styles.primaryText, { color: onAccent }]}>{isLast ? t.submit : t.next}</Text>}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Stars stay gold on every theme — it is the one colour users read as "rating". */
const STAR_ON = '#F5B301';

type InputColors = { surface: string; textPrimary: string; textSecondary: string; accent: string; onAccent: string };

function QuestionInput({ q, lang, value, onChange, colors, placeholderFallback, ratingLabels }: {
  q: FeedbackQuestion;
  lang: FeedbackLanguage;
  value: FeedbackAnswer | undefined;
  onChange: (v: FeedbackAnswer | undefined) => void;
  colors: InputColors;
  placeholderFallback: string;
  ratingLabels: readonly [string, string];
}) {
  if (q.type === 'rating') {
    const current = typeof value === 'number' ? value : 0;
    return (
      <View>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(current === n && !q.required ? undefined : n)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${n} / 5`}
            accessibilityState={{ selected: current >= n }}
          >
            <FontAwesome name={current >= n ? 'star' : 'star-o'} size={36} color={current >= n ? STAR_ON : colors.textSecondary} />
          </Pressable>
        ))}
      </View>
      <View style={styles.ratingLabels}>
        <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>{ratingLabels[0]}</Text>
        <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>{ratingLabels[1]}</Text>
      </View>
      </View>
    );
  }

  if (q.type === 'text') {
    return (
      <TextInput
        value={typeof value === 'string' ? value : ''}
        onChangeText={(v) => onChange(v ? v : undefined)}
        placeholder={(lang === 'ms' ? q.placeholder_ms : q.placeholder_en) || placeholderFallback}
        placeholderTextColor={colors.textSecondary}
        multiline
        maxLength={2000}
        textAlignVertical="top"
        style={[styles.textInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
      />
    );
  }

  const multi = q.type === 'multi';
  const selected = multi ? (Array.isArray(value) ? value : []) : typeof value === 'string' ? [value] : [];
  const toggle = (id: string) => {
    if (!multi) {
      onChange(selected[0] === id ? undefined : id);
      return;
    }
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(next.length ? next : undefined);
  };

  return (
    <View style={styles.options}>
      {(q.options ?? []).map((o) => {
        const on = selected.includes(o.id);
        return (
          <Pressable
            key={o.id}
            onPress={() => toggle(o.id)}
            style={[styles.option, { backgroundColor: colors.surface, borderColor: on ? colors.accent : 'transparent' }]}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: on }}
          >
            <View
              style={[
                multi ? styles.checkbox : styles.radio,
                { borderColor: on ? colors.accent : colors.textSecondary, backgroundColor: on ? colors.accent : 'transparent' },
              ]}
            >
              {on && <Feather name={multi ? 'check' : 'circle'} size={multi ? 14 : 8} color={colors.onAccent} />}
            </View>
            <Text style={[styles.optionText, { color: colors.textPrimary }]}>{pickLang(o.label_en, o.label_ms, lang)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingHorizontal: 12, paddingTop: 8 },
  pane: {
    borderRadius: 28,
    overflow: 'hidden',
    flexShrink: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  langToggle: { flexDirection: 'row', borderRadius: 100, padding: 3 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100 },
  langText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', lineHeight: 30 },
  intro: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  center: { textAlign: 'center' },
  eyebrow: { fontSize: 13, fontWeight: '600' },
  segments: { flexDirection: 'row', gap: 4, marginTop: 14 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  prompt: { fontSize: 19, fontWeight: '700', lineHeight: 25, marginTop: 18 },
  promptAfterTitle: { fontSize: 17, lineHeight: 23, marginTop: 20 },
  hint: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  inputGap: { height: 16 },
  stars: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 4 },
  ratingLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  ratingLabel: { fontSize: 12, fontWeight: '500' },
  textInput: { minHeight: 110, maxHeight: 200, borderRadius: 16, padding: 14, fontSize: 15, lineHeight: 21 },
  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, fontSize: 15, fontWeight: '500', lineHeight: 20 },
  error: { fontSize: 13, fontWeight: '600', marginTop: 12 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  primaryBtn: { flex: 1, borderRadius: 100, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '600' },
  secondaryBtn: { borderRadius: 100, paddingVertical: 15, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontWeight: '600' },
  done: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 36, paddingBottom: 28 },
  doneIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
});

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';

import FixPhotoPanel from '@/components/lockScreen/FixPhotoPanel';
import LockCanvas from '@/components/lockScreen/LockCanvas';
import RecipeChips, { recipeChipsFor, type LockRecipe } from '@/components/lockScreen/RecipeChips';
import SetupStepCard, {
  REDUCED_FADE,
  SETUP_AMBER,
  SetupButton,
  SetupCheckBurst,
  SetupLink,
  SetupNote,
  SetupStepConnector,
  SetupSymbol,
  setupEntering,
  setupHaptic,
  usePulse,
  useReduceMotion,
  useShake,
  type SetupIcon,
} from '@/components/lockScreen/SetupStepCard';
import type { ThemePalette } from '@/constants/Themes';
import { useLockScreenConfig } from '@/hooks/useLockScreenConfig';
import { useDarkMinimalThemePack, useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { t, type TranslationKey } from '@/src/i18n';
import { resolveDisplayTeachingWeeks } from '@/src/lib/academicWeek';
import {
  getLockScreenSetupSnapshot,
  isLockScreenSetupLoaded,
  loadLockScreenSetup,
  subscribeLockScreenSetup,
  updateLockScreenSetup,
} from '@/src/lib/lockScreen/lockScreenConfig';
import { detectUses24h, fmtGhostDate, fmtTimeOfDay, fmtWhen } from '@/src/lib/lockScreen/lockScreenFormat';
import { getLockCanvasSize } from '@/src/lib/lockScreen/lockScreenGeometry';
import { lockScreenUnsupportedReason, runLockScreenAutomationDetector } from '@/src/lib/lockScreen/lockScreenHealth';
import {
  buildLockScreenDayModel,
  collectLockScreenTasks,
  lockScreenA11ySummary,
} from '@/src/lib/lockScreen/lockScreenModel';
import { lockChromeAccent, resolveLockInk } from '@/src/lib/lockScreen/lockScreenPalette';
import {
  getLockRenderState,
  requestLockScreenRender,
  subscribeLockRenderState,
} from '@/src/lib/lockScreen/lockScreenRenderQueue';
import {
  LOCK_SHORTCUT_HAS_TRIGGERS,
  LOCK_SHORTCUT_NAME,
  iosMajorVersion,
  lockScreenAutomationLinks,
  lockScreenShortcutLink,
  openAutomationCreation,
  openLockAutomationInstall,
  openLockShortcutInstall,
  runLockScreenShortcut,
  type LockRunOutcome,
  type ShortcutLink,
} from '@/src/lib/lockScreen/lockScreenShortcut';
import { readLockScreenManifest, readLockScreenStatus } from '@/src/lib/lockScreen/lockScreenStore';
import type { LockScreenConfig, LockScreenDayModel, LockScreenSetupState } from '@/src/lib/lockScreen/types';
import { SHORTCUTS_APP_URL } from '@/src/lib/shortcutLink';
import { getTodayISO } from '@/src/utils/date';

/**
 * Setup for the self-refreshing lock screen (spec §3.7): a dark page sheet
 * with three steps.
 *
 *   1  Add the shortcut       iCloud link, or build it by hand until one is published
 *   2  Set it once            runs the shortcut from here; the run is the check
 *   3  Run it every morning   the automations, confirmed passively when one fires
 *
 * Every step is optimistic: it moves on as soon as the student plausibly did
 * the thing, and the next step catches it if they didn't (a missing shortcut
 * surfaces as step 2's "not found"). How far setup got lives in the per-device
 * setup state, so closing the sheet halfway and coming back resumes.
 *
 * Params: ?step=1|2|3 opens that step; ?stale=1 opens step 3 with the "not
 * updated since" banner; ?error=<LockRunOutcome kind> opens step 2 showing
 * that outcome (the Studio's Update now sends failed runs here).
 */

const SHEET_BG = '#0E0F12';
const HERO_CANVAS_W = 52;
const APP_STORE_SHORTCUTS = 'itms-apps://apps.apple.com/app/id915249334';
const UNPUBLISHED_LINK: ShortcutLink = { url: SHORTCUTS_APP_URL, isPublished: false };

/** A trip to Shortcuts and back takes longer than this; anything shorter was a bounce. */
const INSTALL_MIN_AWAY_MS = 1500;
const ADVANCE_AFTER_INSTALL_MS = 600;
const ADVANCE_AFTER_RUN_MS = 1400;
const FINISH_AFTER_AUTOMATION_MS = 1500;
/**
 * The close test ("swipe home, then come back") can beat its own automation
 * back: the serve takes a second or two to land. Keep looking this long.
 */
const LATE_SERVE_WINDOW_MS = 8000;
const LATE_SERVE_POLL_MS = 500;
/** Still in Rencana this long after tapping run: Shortcuts never came up or is waiting on the student. */
const SLOW_RUN_MS = 8000;
const COPIED_MS = 1500;
const SHORTCUTS_ERROR_MAX = 120;

// "Get Wallpaper" (Current) feeds Set Wallpaper Photo so the shortcut changes
// whichever lock screen is active. Picking "Wallpaper 10" instead would pin
// the builder's own wallpaper index, which another phone doesn't have.
const MANUAL_STEPS = ['lsManual1', 'lsManual2', 'lsManual3', 'lsManual3b', 'lsManual4', 'lsManual5'] as const;

const ICONS = {
  add: { sf: 'plus.square.on.square', feather: 'plus-square' },
  openApp: { sf: 'arrow.up.forward.app', feather: 'external-link' },
  setLock: { sf: 'lock.rotation', feather: 'lock' },
  retry: { sf: 'arrow.clockwise', feather: 'refresh-cw' },
  check: { sf: 'checkmark', feather: 'check' },
  done: { sf: 'checkmark.circle.fill', feather: 'check-circle' },
  morning: { sf: 'sunrise.fill', feather: 'sunrise' },
  close: { sf: 'rectangle.portrait.and.arrow.right', feather: 'log-out' },
} satisfies Record<string, SetupIcon>;

type Timer = ReturnType<typeof setTimeout>;
type Translate = (key: TranslationKey) => string;
type StepIndex = 1 | 2 | 3;
type ErrorOutcome = Exclude<LockRunOutcome, { kind: 'ok' }>;

const ERROR_KINDS: readonly ErrorOutcome['kind'][] = [
  'wallpaperFailed',
  'previewCancelled',
  'wrongShortcut',
  'notReady',
  'notFound',
  'couldntRun',
  'locked',
  'storage',
  'cancelled',
  'noShortcutsApp',
];

interface Entry {
  error: ErrorOutcome | null;
  stale: boolean;
  step: StepIndex | null;
}

function outcomeFromParam(value: string | undefined): ErrorOutcome | null {
  const kind = ERROR_KINDS.find((k) => k === value);
  return kind ? ({ kind } as ErrorOutcome) : null;
}

function stepFromParam(value: string | undefined): StepIndex | null {
  return value === '1' ? 1 : value === '2' ? 2 : value === '3' ? 3 : null;
}

function firstIncompleteStep(setup: LockScreenSetupState): StepIndex {
  if (!setup.shortcutStepDoneAt) return 1;
  if (!setup.firstRunVerifiedAt) return 2;
  return 3;
}

/** The step to open with; null while the setup state is still loading and nothing in the URL decides it. */
function entryStep(entry: Entry, setup: LockScreenSetupState | null): StepIndex | null {
  if (entry.error) return 2;
  if (entry.stale) return 3;
  if (entry.step) return entry.step;
  return setup ? firstIncompleteStep(setup) : null;
}

/**
 * A serve the time-of-day recipe could have made: before noon, and well after
 * Rencana was left (so not the close recipe). The in-sheet check only ever
 * sees one when the student comes back to finish setup the next morning.
 */
function isMorningServe(servedAt: number | null): boolean {
  return servedAt != null && new Date(servedAt).getHours() < 12;
}

/** Not the student's doing and nothing to fix: no shake, no warning. */
function isNeutralOutcome(outcome: ErrorOutcome): boolean {
  return outcome.kind === 'cancelled' || outcome.kind === 'notReady';
}

type OutcomeAction = 'run' | 'addShortcut' | 'appStore';

interface OutcomeView {
  tone: 'error' | 'neutral';
  title?: string;
  lines: string[];
  primary: OutcomeAction;
  secondary?: OutcomeAction;
  /** wrongShortcut: show the build steps again. */
  manual?: boolean;
  /** wallpaperFailed: the photo-type fix, behind a toggle the first time and open from the second. */
  fix?: 'toggle' | 'open';
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Step 2's inline outcome UI, one entry per LockRunOutcome kind (spec §3.7 "Outcome UI"). */
function describeOutcome(outcome: ErrorOutcome, T: Translate, wallpaperFailCount: number): OutcomeView {
  switch (outcome.kind) {
    case 'wallpaperFailed': {
      const repeated = wallpaperFailCount >= 2;
      return {
        tone: 'error',
        title: T('lsErrTitleWallpaper'),
        lines: repeated ? [] : [T('lsFixRetryHint')],
        primary: 'run',
        fix: repeated ? 'open' : 'toggle',
      };
    }
    case 'previewCancelled':
      return { tone: 'error', lines: [T('lsErrPreviewOn')], primary: 'run' };
    case 'wrongShortcut':
      return { tone: 'error', lines: [T('lsErrWrongShortcut')], primary: 'run', manual: true };
    case 'notFound':
      return { tone: 'error', lines: [T('lsErrNotFound')], primary: 'addShortcut', secondary: 'run' };
    case 'couldntRun': {
      const lines = [T('lsErrCouldntRun'), T('lsErrBlockedHint')];
      if (outcome.errorMessage) {
        lines.push(T('lsErrShortcutsSaid').replace('{error}', truncate(outcome.errorMessage, SHORTCUTS_ERROR_MAX)));
      }
      return { tone: 'error', lines, primary: 'run', secondary: 'addShortcut' };
    }
    case 'notReady':
      // No notice: the run button already reads "Getting your pictures ready…" until
      // today's picture lands, then "Try again".
      return { tone: 'neutral', lines: [], primary: 'run' };
    case 'locked':
      return { tone: 'error', lines: [T('lsErrLocked')], primary: 'run' };
    case 'storage':
      return { tone: 'error', lines: [T('lsErrStorage')], primary: 'run' };
    case 'cancelled':
      return { tone: 'neutral', lines: [T('lsCancelled')], primary: 'run' };
    case 'noShortcutsApp':
      return { tone: 'error', lines: [T('lsErrNoShortcutsApp')], primary: 'appStore' };
  }
}

function openShortcutsAppStore(): void {
  Linking.openURL(APP_STORE_SHORTCUTS).catch(() => {});
}

function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}

/** Today's picture model, built from the same inputs the render host uses so the hero matches the wallpaper. */
function useTodayModel(T: Translate): LockScreenDayModel {
  const {
    timetable,
    tasks,
    courses,
    subjectColors,
    getSubjectColor,
    isTaskDoneOn,
    academicCalendar,
    user,
    weekStartsOn,
    language,
  } = useApp();
  const { acceptedSharedTasks, userId: communityUserId } = useCommunity();
  const { startDate, currentWeek } = user;
  const todayISO = getTodayISO();

  return useMemo(() => {
    const allTasks = collectLockScreenTasks(tasks, acceptedSharedTasks, communityUserId);
    const totalWeeks = resolveDisplayTeachingWeeks(academicCalendar, startDate, allTasks);
    return buildLockScreenDayModel(
      {
        timetable,
        tasks: allTasks,
        courses,
        subjectColors,
        getSubjectColor,
        isTaskDoneOn,
        pulseCalendar: academicCalendar ? { ...academicCalendar, totalWeeks } : null,
        totalWeeks,
        startDate: startDate || null,
        currentWeek,
        weekStartsOn,
        language,
        T,
        nowMs: Date.now(),
        uses24h: detectUses24h(),
      },
      todayISO,
    );
  }, [
    timetable,
    tasks,
    acceptedSharedTasks,
    communityUserId,
    courses,
    subjectColors,
    getSubjectColor,
    isTaskDoneOn,
    academicCalendar,
    startDate,
    currentWeek,
    weekStartsOn,
    language,
    T,
    todayISO,
  ]);
}

// ─── Presentational pieces ───────────────────────────────────────────────────

function ProgressSegment({ filled, accent, reduceMotion }: { filled: boolean; accent: string; reduceMotion: boolean }) {
  const progress = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(filled ? 1 : 0, reduceMotion ? REDUCED_FADE : { duration: 300 });
  }, [filled, reduceMotion, progress]);
  const fillStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { width: '100%' as const, opacity: progress.value }
      : { width: `${progress.value * 100}%` as const, opacity: 1 },
  );
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, { backgroundColor: accent }, fillStyle]} />
    </View>
  );
}

/** The live mini wallpaper with its pulsing AUTO badge: what the next three steps put on the lock screen. */
function HeroPreview({
  model,
  config,
  theme,
  darkMinimal,
  T,
  accent,
  onAccent,
  badge,
  accessibilityLabel,
  reduceMotion,
}: {
  model: LockScreenDayModel;
  config: LockScreenConfig;
  theme: ThemePalette;
  darkMinimal: boolean;
  T: Translate;
  accent: string;
  onAccent: string;
  badge: string;
  accessibilityLabel: string;
  reduceMotion: boolean;
}) {
  const { W, H, s } = useMemo(getLockCanvasSize, []);
  const scale = HERO_CANVAS_W / W;
  const height = Math.round(H * scale);
  const pulse = usePulse(true, 1200, 0.6, reduceMotion);

  return (
    <View style={{ width: HERO_CANVAS_W, paddingBottom: 7 }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {/* The shadow sits on an unclipped wrapper; the frame itself clips the canvas. */}
      <View style={[styles.heroShadow, { width: HERO_CANVAS_W, height }]}>
        <View style={[styles.heroFrame, { width: HERO_CANVAS_W, height }]}>
          <View
            pointerEvents="none"
            style={{ width: W, height: H, transform: [{ scale }], transformOrigin: 'top left' }}
          >
            <LockCanvas model={model} config={config} W={W} H={H} s={s} theme={theme} darkMinimal={darkMinimal} T={T} />
          </View>
        </View>
      </View>
      <View style={styles.autoBadgeRow} pointerEvents="none">
        <Animated.View style={[styles.autoBadge, { backgroundColor: accent }, pulse]}>
          <Text style={[styles.autoBadgeText, { color: onAccent }]}>{badge}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

function ManualSteps({
  T,
  accent,
  copied,
  onCopy,
}: {
  T: Translate;
  accent: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <View style={styles.manual}>
      <Text style={styles.manualTitle}>{T('lsManualTitle')}</Text>
      {MANUAL_STEPS.map((key, i) => (
        <View key={key} style={styles.manualRow}>
          <View style={styles.manualDot}>
            <Text style={styles.manualDotText}>{i + 1}</Text>
          </View>
          <View style={styles.manualBody}>
            <Text style={styles.manualText}>{T(key)}</Text>
            {i === MANUAL_STEPS.length - 1 ? (
              <View style={styles.nameRow}>
                <View style={styles.nameChip}>
                  <Text style={styles.nameText} selectable>
                    {LOCK_SHORTCUT_NAME}
                  </Text>
                </View>
                <Pressable
                  onPress={onCopy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={copied ? T('lsCopied') : T('lsCopyName')}
                  style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
                >
                  <Feather name={copied ? 'check' : 'copy'} size={14} color={accent} />
                  <Text style={[styles.copyText, { color: accent }]}>{copied ? T('lsCopied') : T('lsCopyName')}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function OutcomeBlock({
  view,
  shakeStyle,
  reduceMotion,
}: {
  view: OutcomeView;
  shakeStyle: AnimatedStyle<ViewStyle>;
  reduceMotion: boolean;
}) {
  const error = view.tone === 'error';
  return (
    // The fade is on the outer view and the shake on the inner one: both would write the same style.
    <Animated.View entering={reduceMotion ? FadeIn.duration(150).reduceMotion(ReduceMotion.Never) : FadeIn.duration(200)}>
      <Animated.View
        style={[styles.notice, error ? styles.noticeError : styles.noticeNeutral, shakeStyle]}
        accessible
        accessibilityLiveRegion="polite"
      >
        <View style={styles.noticeRow}>
          <Feather
            name={error ? 'alert-triangle' : 'info'}
            size={16}
            color={error ? SETUP_AMBER : 'rgba(255,255,255,0.7)'}
            style={styles.noticeIcon}
          />
          <View style={styles.noticeTextCol}>
            {view.title ? <Text style={styles.noticeTitle}>{view.title}</Text> : null}
            {view.lines.map((line) => (
              <Text key={line} style={styles.noticeText}>
                {line}
              </Text>
            ))}
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function NoShortcutsNotice({ T }: { T: Translate }) {
  return (
    <View style={[styles.notice, styles.noticeError]}>
      <SetupNote icon="alert-triangle" iconColor={SETUP_AMBER}>
        {T('lsErrNoShortcutsApp')}
      </SetupNote>
      <SetupLink label={T('lsOpenAppStore')} onPress={openShortcutsAppStore} color="#FFFFFF" trailingChevron />
    </View>
  );
}

function RecipeCard({
  icon,
  title,
  badge,
  badgeOnAccent,
  chips,
  note,
  why,
  accent,
  onAccent,
}: {
  icon: SetupIcon;
  title: string;
  badge: string;
  /** The must-have recipe's badge is filled with the accent; the optional one is glass. */
  badgeOnAccent: boolean;
  chips: readonly string[];
  note: string;
  why: string;
  accent: string;
  onAccent: string;
}) {
  return (
    <View style={styles.subCard}>
      <View style={styles.recipeHead}>
        <View style={styles.recipeIcon}>
          <SetupSymbol {...icon} size={14} color="#FFFFFF" />
        </View>
        <Text style={styles.subCardTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={[styles.badge, { backgroundColor: badgeOnAccent ? accent : 'rgba(255,255,255,0.14)' }]}>
          <Text style={[styles.badgeText, { color: badgeOnAccent ? onAccent : '#FFFFFF' }]}>{badge}</Text>
        </View>
      </View>
      <RecipeChips chips={chips} accent={accent} />
      <SetupNote icon="sliders">{note}</SetupNote>
      <Text style={styles.recipeWhy}>{why}</Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LockScreenSetupScreen() {
  const unsupported = lockScreenUnsupportedReason();
  // Android and iPad can't set the wallpaper from Shortcuts; the Studio never links here there.
  if (unsupported === 'android' || unsupported === 'ipad') return <Redirect href="/lock-wallpaper" />;
  return <SetupSheet unavailable={unsupported === 'noAppGroup'} />;
}

function SetupSheet({ unavailable }: { unavailable: boolean }) {
  const params = useLocalSearchParams<{ step?: string; stale?: string; error?: string }>();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { language } = useApp();
  // useTranslations' lookup, but one function per language: the callbacks, effects and memos
  // below depend on it, and a new function every render would re-run them every render.
  const T = useMemo<Translate>(() => (key) => t(language, key), [language]);
  const theme = useTheme();
  const darkMinimal = useDarkMinimalThemePack();
  // The sheet is always dark, so it takes the dark-glass accent (white for Mono and Spider).
  const { accent, onAccent } = useMemo(() => resolveLockInk('dark', theme, darkMinimal), [theme, darkMinimal]);
  // For text, links and the progress bars on the near-black sheet; filled buttons keep `accent`.
  const linkAccent = useMemo(() => lockChromeAccent(accent), [accent]);
  const [config, updateConfig, configLoaded] = useLockScreenConfig();
  const setup = useSyncExternalStore(subscribeLockScreenSetup, getLockScreenSetupSnapshot);
  const setupLoaded = useSyncExternalStore(subscribeLockScreenSetup, isLockScreenSetupLoaded);
  const renderState = useSyncExternalStore(subscribeLockRenderState, getLockRenderState);
  const todayModel = useTodayModel(T);
  const uses24h = useMemo(detectUses24h, []);
  const iosVersion = useMemo(iosMajorVersion, []);
  const todayISO = todayModel.dateISO ?? getTodayISO();

  const [entry] = useState<Entry>(() => ({
    error: outcomeFromParam(params.error),
    stale: params.stale === '1',
    step: stepFromParam(params.step),
  }));
  const [activeStep, setActiveStep] = useState<StepIndex | null>(() =>
    entryStep(entry, isLockScreenSetupLoaded() ? getLockScreenSetupSnapshot() : null),
  );
  const [staleSince] = useState(() =>
    entry.stale ? (readLockScreenStatus()?.lastServedAt ?? getLockScreenSetupSnapshot().completedAt) : null,
  );
  const [link, setLink] = useState<ShortcutLink>(UNPUBLISHED_LINK);
  const [automationLinks, setAutomationLinks] = useState<Record<LockRecipe, ShortcutLink>>({
    morning: UNPUBLISHED_LINK,
    close: UNPUBLISHED_LINK,
  });
  const [manualReturned, setManualReturned] = useState(false);
  const [installFailed, setInstallFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [outcome, setOutcome] = useState<LockRunOutcome | null>(entry.error);
  const [running, setRunning] = useState(false);
  const [runSlow, setRunSlow] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [manifestHasToday, setManifestHasToday] = useState(false);
  const [automationVisited, setAutomationVisited] = useState(false);
  const [automationOpenFailed, setAutomationOpenFailed] = useState(false);
  const [autoConfirmed, setAutoConfirmed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [shakeStyle, shake] = useShake(reduceMotion);

  const mountedRef = useRef(false);
  const awaitingRef = useRef<'install' | 'automation' | null>(null);
  const runningRef = useRef(false);
  const finishedRef = useRef(false);
  const autoConfirmedRef = useRef(false);
  const advanceTimerRef = useRef<Timer | null>(null);
  const copiedTimerRef = useRef<Timer | null>(null);
  const timersRef = useRef(new Set<Timer>());
  // Read from AppState listeners, which outlive the render that created them.
  const stepRef = useRef(activeStep);
  stepRef.current = activeStep;
  const linkRef = useRef(link);
  linkRef.current = link;
  const automationLinksRef = useRef(automationLinks);
  automationLinksRef.current = automationLinks;

  // ─── Timers ────────────────────────────────────────────────────────────────

  const schedule = useCallback((fn: () => void, ms: number): Timer => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const cancelTimer = useCallback((id: Timer | null) => {
    if (id == null) return;
    clearTimeout(id);
    timersRef.current.delete(id);
  }, []);

  const cancelAdvance = useCallback(() => {
    cancelTimer(advanceTimerRef.current);
    advanceTimerRef.current = null;
  }, [cancelTimer]);

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
  }, []);

  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/lock-wallpaper');
  }, []);

  // ─── On mount ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (unavailable) return;
    void loadLockScreenSetup();
    void requestLockScreenRender({ priority: 'today', reason: 'setup' });

    let alive = true;
    let fetched = false;
    // Paint from the cache, then reconcile with app_config; a late cache read must not undo the fetch.
    void lockScreenShortcutLink.getCached().then((cached) => {
      if (alive && !fetched) setLink(cached);
    });
    void lockScreenShortcutLink.fetch().then((current) => {
      fetched = true;
      if (alive) setLink(current);
    });

    // Only iOS 27 imports a shortcut's trigger, so only it gets the automation links.
    if (iosMajorVersion() >= 27) {
      (['morning', 'close'] as const).forEach((kind) => {
        let fetchedOne = false;
        const apply = (value: ShortcutLink) =>
          setAutomationLinks((prev) => (prev[kind].url === value.url ? prev : { ...prev, [kind]: value }));
        void lockScreenAutomationLinks[kind].getCached().then((cached) => {
          if (alive && !fetchedOne) apply(cached);
        });
        void lockScreenAutomationLinks[kind].fetch().then((current) => {
          fetchedOne = true;
          if (alive) apply(current);
        });
      });
    }
    return () => {
      alive = false;
    };
  }, [unavailable]);

  // Opening setup is the decision to go automatic; the Studio usually did this already.
  const autoRefreshEnsured = useRef(false);
  useEffect(() => {
    if (unavailable || !configLoaded || autoRefreshEnsured.current) return;
    autoRefreshEnsured.current = true;
    if (!config.autoRefresh) void updateConfig({ autoRefresh: true });
  }, [unavailable, configLoaded, config.autoRefresh, updateConfig]);

  useEffect(() => {
    if (activeStep == null && setupLoaded) setActiveStep(entryStep(entry, getLockScreenSetupSnapshot()));
  }, [activeStep, setupLoaded, entry]);

  // Reopened from "Setup guide" on a phone that finished setup: the student is
  // here to read step 3 (say, to add the other recipe), and with the close
  // recipe on, every return to Rencana is a working automation. Finishing the
  // sheet under them would make step 3 unreadable. Decided once, from the
  // state the sheet opened with, before anything here writes completedAt.
  const guideOnlyRef = useRef<boolean | null>(entry.stale ? false : null);
  if (guideOnlyRef.current == null && setupLoaded) guideOnlyRef.current = setup.completedAt != null;

  // A picture from an earlier session counts as ready too; the intent serves whatever is live.
  useEffect(() => {
    if (unavailable) return;
    setManifestHasToday(readLockScreenManifest()?.days[getTodayISO()] != null);
  }, [unavailable, renderState.lastWrittenAt]);

  // ─── Step 1 ────────────────────────────────────────────────────────────────

  const completeStepOne = useCallback(() => {
    awaitingRef.current = null;
    setManualReturned(false);
    setInstallFailed(false);
    void updateLockScreenSetup({ shortcutStepDoneAt: Date.now() });
    setupHaptic('light');
    schedule(() => setActiveStep((step) => (step === 1 ? 2 : step)), ADVANCE_AFTER_INSTALL_MS);
  }, [schedule]);

  const installShortcut = useCallback(() => {
    setupHaptic('light');
    setInstallFailed(false);
    setManualReturned(false);
    // Set before opening: the app is backgrounded before openURL resolves.
    awaitingRef.current = 'install';
    void openLockShortcutInstall(linkRef.current).then((opened) => {
      if (opened) return;
      awaitingRef.current = null;
      if (!mountedRef.current) return;
      setInstallFailed(true);
      setupHaptic('warn');
    });
  }, []);

  const copyName = useCallback(() => {
    Clipboard.setStringAsync(LOCK_SHORTCUT_NAME)
      .then(() => {
        if (!mountedRef.current) return;
        setupHaptic('success');
        setCopied(true);
        cancelTimer(copiedTimerRef.current);
        copiedTimerRef.current = schedule(() => setCopied(false), COPIED_MS);
      })
      .catch(() => {});
  }, [schedule, cancelTimer]);

  // ─── Step 3 and finish ─────────────────────────────────────────────────────

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    void updateLockScreenSetup({ completedAt: Date.now() });
    setupHaptic('success');
    setFinished(true);
    announce(T('lsAllSetTitle'));
  }, [T]);

  const canAutoConfirm = useCallback(
    () => stepRef.current === 3 && guideOnlyRef.current === false && !finishedRef.current && !autoConfirmedRef.current,
    [],
  );

  /**
   * Passive check: a picture was served while Rencana was away, by neither a
   * run from here nor a trip to Shortcuts this sheet started (where the
   * student may have tapped the shortcut by hand), in a way one of the
   * recipes would. Resolves whether it confirmed.
   */
  const checkAutomation = useCallback(async (): Promise<boolean> => {
    if (!canAutoConfirm()) return false;
    const check = await runLockScreenAutomationDetector();
    if (!check.confirmedNow || !mountedRef.current || !canAutoConfirm()) return false;
    if (!check.viaClose && !isMorningServe(check.servedAt)) return false;
    autoConfirmedRef.current = true;
    // Recorded now rather than when the all-set card shows, so closing the sheet
    // during the celebration still counts as finished.
    const now = Date.now();
    void updateLockScreenSetup((current) => ({
      completedAt: now,
      closeAutomationConfirmedAt: check.viaClose ? now : current.closeAutomationConfirmedAt,
    }));
    setAutoConfirmed(true);
    setupHaptic('success');
    announce(T('lsAutoWorks'));
    schedule(finish, FINISH_AFTER_AUTOMATION_MS);
    return true;
  }, [T, canAutoConfirm, schedule, finish]);

  // Back before the close automation's serve landed: watch status.json for a
  // few seconds rather than miss it. The next background would move past it
  // for good.
  const latePollRef = useRef<Timer | null>(null);
  const stopLateServeWatch = useCallback(() => {
    cancelTimer(latePollRef.current);
    latePollRef.current = null;
  }, [cancelTimer]);
  const watchForLateServe = useCallback(() => {
    stopLateServeWatch();
    const baseline = readLockScreenStatus()?.lastServedAt ?? 0;
    const until = Date.now() + LATE_SERVE_WINDOW_MS;
    const tick = () => {
      latePollRef.current = null;
      if (!canAutoConfirm() || AppState.currentState !== 'active') return;
      if ((readLockScreenStatus()?.lastServedAt ?? 0) > baseline) {
        void checkAutomation();
        return;
      }
      if (Date.now() < until) latePollRef.current = schedule(tick, LATE_SERVE_POLL_MS);
    };
    latePollRef.current = schedule(tick, LATE_SERVE_POLL_MS);
  }, [stopLateServeWatch, canAutoConfirm, checkAutomation, schedule]);

  useEffect(() => {
    if (activeStep === 3 && setupLoaded) void checkAutomation();
  }, [activeStep, setupLoaded, checkAutomation]);

  const installAutomation = useCallback((kind: LockRecipe) => {
    setupHaptic('light');
    setAutomationOpenFailed(false);
    setAutomationVisited(true);
    awaitingRef.current = 'automation';
    void openLockAutomationInstall(automationLinksRef.current[kind]).then((opened) => {
      if (opened) return;
      awaitingRef.current = null;
      if (mountedRef.current) setAutomationOpenFailed(true);
    });
  }, []);

  const openAutomations = useCallback(() => {
    setupHaptic('light');
    setAutomationOpenFailed(false);
    awaitingRef.current = 'automation';
    void openAutomationCreation().then((opened) => {
      if (opened) return;
      awaitingRef.current = null;
      if (mountedRef.current) setAutomationOpenFailed(true);
    });
  }, []);

  // ─── Coming back from Shortcuts ────────────────────────────────────────────

  useEffect(() => {
    if (unavailable) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') stopLateServeWatch();
      if (next !== 'active') return;
      const awaiting = awaitingRef.current;
      if (awaiting === 'install') {
        const openedAt = getLockScreenSetupSnapshot().shortcutOpenedAt;
        if (openedAt != null && Date.now() - openedAt >= INSTALL_MIN_AWAY_MS) {
          awaitingRef.current = null;
          // Adding from an iCloud link is one tap, so coming back means it's done. Building
          // by hand takes several trips back here to re-read the list, so leave the list up
          // and let the student say when it's built.
          if (linkRef.current.isPublished) completeStepOne();
          else setManualReturned(true);
        }
      } else if (awaiting === 'automation') {
        awaitingRef.current = null;
        setAutomationVisited(true);
      }
      void checkAutomation().then((confirmed) => {
        if (!confirmed && canAutoConfirm()) watchForLateServe();
      });
    });
    return () => subscription.remove();
  }, [unavailable, completeStepOne, checkAutomation, canAutoConfirm, stopLateServeWatch, watchForLateServe]);

  // ─── Step 2 ────────────────────────────────────────────────────────────────

  const presentOutcome = useCallback(
    (result: LockRunOutcome) => {
      setOutcome(result);
      if (result.kind === 'ok') {
        setupHaptic('success');
        announce(T('lsRunOk'));
        advanceTimerRef.current = schedule(() => {
          advanceTimerRef.current = null;
          setActiveStep((step) => (step === 2 ? 3 : step));
        }, ADVANCE_AFTER_RUN_MS);
        return;
      }
      const view = describeOutcome(result, T, getLockScreenSetupSnapshot().wallpaperFailCount);
      const spoken = [view.title, ...view.lines].filter(Boolean).join(' ');
      if (spoken) announce(spoken);
      if (isNeutralOutcome(result)) return;
      setupHaptic('warn');
      shake();
    },
    [T, schedule, shake],
  );

  const runStepTwo = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    // Returning from this run must not read as returning from an install.
    awaitingRef.current = null;
    cancelAdvance();
    setupHaptic('light');
    setOutcome(null);
    setFixOpen(false);
    setRunSlow(false);
    setRunning(true);

    let backgrounded = false;
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'background') backgrounded = true;
    });
    const slowTimer = schedule(() => {
      if (!backgrounded) setRunSlow(true);
    }, SLOW_RUN_MS);

    // The runner records the outcome in the setup state itself.
    const result = await runLockScreenShortcut({ autoRetryNotReady: true });
    appState.remove();
    cancelTimer(slowTimer);
    runningRef.current = false;
    if (!mountedRef.current) return;
    setRunning(false);
    setRunSlow(false);
    presentOutcome(result);
  }, [cancelAdvance, schedule, cancelTimer, presentOutcome]);

  const retryRender = useCallback(() => {
    setupHaptic('light');
    void requestLockScreenRender({ priority: 'today', reason: 'setup-retry' });
  }, []);

  /** notFound / couldntRun: back to step 1 and straight into its install action. */
  const addShortcutAgain = useCallback(() => {
    cancelAdvance();
    setOutcome(null);
    setActiveStep(1);
    installShortcut();
  }, [cancelAdvance, installShortcut]);

  const openFix = useCallback(() => {
    // Reading the fix outranks moving on to step 3.
    cancelAdvance();
    setupHaptic('selection');
    setFixOpen(true);
  }, [cancelAdvance]);

  const openStep = useCallback(
    (step: StepIndex) => {
      cancelAdvance();
      awaitingRef.current = null;
      setupHaptic('selection');
      setActiveStep(step);
    },
    [cancelAdvance],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  const btn = { accent, onAccent, reduceMotion };
  const stepLabel = (n: number) => T('lsStepOf').replace('{n}', String(n));
  const step1Done = entry.stale || setup.shortcutStepDoneAt != null;
  const step2Done = entry.stale || setup.firstRunVerifiedAt != null;
  const step3Done = finished || (!entry.stale && setup.completedAt != null);
  const pictureReady = renderState.todayReady || manifestHasToday;
  const renderFailed = !pictureReady && renderState.phase === 'error';

  const heroLabel = T('lsA11yPreview')
    .replace('{date}', fmtGhostDate(todayISO))
    .replace('{summary}', lockScreenA11ySummary(todayModel, T));

  const fixPanel = <FixPhotoPanel T={T} todayISO={todayISO} accent={linkAccent} reduceMotion={reduceMotion} />;

  const runButton = (label: string, icon: SetupIcon) => {
    if (running) {
      return <SetupButton {...btn} label={runSlow ? T('lsRunningSlow') : T('lsRunning')} busy="pulse" onPress={runStepTwo} />;
    }
    if (renderFailed) return <SetupButton {...btn} label={T('lsTryAgain')} icon={ICONS.retry} onPress={retryRender} />;
    if (!pictureReady) return <SetupButton {...btn} label={T('lsPreparing')} busy="spinner" onPress={runStepTwo} />;
    return <SetupButton {...btn} label={label} icon={icon} onPress={runStepTwo} />;
  };

  const actionButton = (action: OutcomeAction): ReactNode => {
    if (action === 'run') return runButton(T('lsTryAgain'), ICONS.retry);
    if (action === 'addShortcut') {
      return <SetupButton {...btn} label={T('lsAddShortcut')} icon={ICONS.add} onPress={addShortcutAgain} />;
    }
    return <SetupButton {...btn} label={T('lsOpenAppStore')} icon={ICONS.openApp} onPress={openShortcutsAppStore} />;
  };

  const actionLink = (action: OutcomeAction): ReactNode => {
    if (action === 'run') return running ? null : <SetupLink label={T('lsTryAgain')} onPress={runStepTwo} />;
    if (action === 'addShortcut') return <SetupLink label={T('lsAddShortcut')} onPress={addShortcutAgain} />;
    return <SetupLink label={T('lsOpenAppStore')} onPress={openShortcutsAppStore} />;
  };

  // Step 1: the iCloud link when one is published, otherwise the build-it-yourself list.
  const stepOneBody = link.isPublished ? (
    <>
      <Text style={styles.body}>{T('lsStep1Body')}</Text>
      <SetupButton {...btn} label={T('lsStep1Btn')} icon={ICONS.add} onPress={installShortcut} />
      <SetupLink label={T('lsStep1Have')} onPress={completeStepOne} />
      {installFailed ? <NoShortcutsNotice T={T} /> : null}
    </>
  ) : (
    <>
      <ManualSteps T={T} accent={linkAccent} copied={copied} onCopy={copyName} />
      {manualReturned ? (
        <>
          <SetupButton {...btn} label={T('lsStep1Have')} icon={ICONS.check} onPress={completeStepOne} />
          <SetupLink label={T('lsOpenShortcuts')} onPress={installShortcut} />
        </>
      ) : (
        <>
          <SetupButton {...btn} label={T('lsOpenShortcuts')} icon={ICONS.openApp} onPress={installShortcut} />
          <SetupLink label={T('lsStep1Have')} onPress={completeStepOne} />
        </>
      )}
      {installFailed ? <NoShortcutsNotice T={T} /> : null}
    </>
  );

  let stepTwoBody: ReactNode;
  if (outcome?.kind === 'ok') {
    stepTwoBody = (
      <>
        <View style={styles.success}>
          <SetupCheckBurst size={44} reduceMotion={reduceMotion} />
          <Text style={styles.successText}>{T('lsRunOk')}</Text>
        </View>
        {fixOpen ? (
          <>
            {fixPanel}
            {/* The panel's last step is "come back and tap Try again". */}
            {runButton(T('lsTryAgain'), ICONS.retry)}
          </>
        ) : (
          <SetupLink label={T('lsDidntChange')} onPress={openFix} />
        )}
      </>
    );
  } else if (outcome) {
    const view = describeOutcome(outcome, T, setup.wallpaperFailCount);
    const showFix = view.fix === 'open' || (view.fix === 'toggle' && fixOpen);
    stepTwoBody = (
      <>
        {actionButton(view.primary)}
        {view.title || view.lines.length > 0 ? (
          <OutcomeBlock view={view} shakeStyle={shakeStyle} reduceMotion={reduceMotion} />
        ) : null}
        {view.manual ? (
          <View style={styles.subCard}>
            <ManualSteps T={T} accent={linkAccent} copied={copied} onCopy={copyName} />
          </View>
        ) : null}
        {showFix ? fixPanel : null}
        {view.fix === 'toggle' && !fixOpen ? (
          <SetupLink label={T('lsFixStillNot')} onPress={openFix} trailingChevron />
        ) : null}
        {view.secondary ? actionLink(view.secondary) : null}
      </>
    );
  } else {
    stepTwoBody = (
      <>
        <Text style={styles.body}>{T('lsStep2Body')}</Text>
        <SetupNote icon="info">{T('lsStep2Note')}</SetupNote>
        {runButton(T('lsStep2Btn'), ICONS.setLock)}
      </>
    );
  }

  const recipe = (kind: LockRecipe) => {
    const morning = kind === 'morning';
    return (
      <RecipeCard
        icon={morning ? ICONS.morning : ICONS.close}
        title={T(morning ? 'lsRecipeMorning' : 'lsRecipeClose')}
        badge={T(morning ? 'lsRecipeMorningBadge' : 'lsRecipeCloseBadge')}
        badgeOnAccent={morning}
        chips={recipeChipsFor(iosVersion, kind)}
        note={T(iosVersion >= 17 ? 'lsIos17Note' : 'lsIos16Note')}
        why={T(morning ? 'lsRecipeMorningWhy' : 'lsRecipeCloseWhy')}
        accent={accent}
        onAccent={onAccent}
      />
    );
  };

  // iOS 27 with both links published: one tap per automation instead of building them.
  const automationLinksShown =
    iosVersion >= 27 && automationLinks.morning.isPublished && automationLinks.close.isPublished;

  // Once the student has been to Shortcuts, "I've set it up" becomes the obvious next tap.
  const stepThreeBody = autoConfirmed ? (
    <View style={styles.success}>
      <SetupCheckBurst size={44} reduceMotion={reduceMotion} />
      <Text style={styles.successText}>{T('lsAutoWorks')}</Text>
    </View>
  ) : (
    <>
      {entry.stale && staleSince != null ? (
        <View style={styles.staleBanner}>
          <Feather name="alert-triangle" size={16} color={SETUP_AMBER} style={styles.noticeIcon} />
          <Text style={styles.staleText}>
            {T('lsStaleBody').replace('{when}', fmtWhen(staleSince, Date.now(), T, uses24h))}
          </Text>
        </View>
      ) : null}
      <Text style={styles.body}>{T('lsStep3Body')}</Text>
      {automationLinksShown ? (
        <View style={styles.subCard}>
          <Text style={styles.subCardTitle}>{T('lsIos27LinksTitle')}</Text>
          <Text style={styles.subCardBody}>{T('lsIos27LinksBody')}</Text>
          <SetupButton
            {...btn}
            label={T('lsGetMorningAuto')}
            icon={ICONS.morning}
            onPress={() => installAutomation('morning')}
          />
          <SetupButton
            {...btn}
            label={T('lsGetCloseAuto')}
            icon={ICONS.close}
            variant="tonal"
            onPress={() => installAutomation('close')}
          />
        </View>
      ) : iosVersion >= 27 ? (
        <View style={styles.subCard}>
          <Text style={styles.subCardTitle}>{T('lsIos27Title')}</Text>
          <Text style={styles.subCardBody}>{T(LOCK_SHORTCUT_HAS_TRIGGERS ? 'lsIos27BodyBuiltIn' : 'lsIos27Body')}</Text>
        </View>
      ) : (
        <>
          {recipe('morning')}
          {recipe('close')}
        </>
      )}
      <SetupButton
        {...btn}
        label={T(iosVersion >= 27 ? 'lsOpenShortcutIos27' : 'lsOpenAutomations')}
        icon={ICONS.openApp}
        variant={automationVisited || automationLinksShown ? 'tonal' : 'primary'}
        onPress={openAutomations}
      />
      {automationOpenFailed ? <NoShortcutsNotice T={T} /> : null}
      <Text style={styles.testHint}>{T('lsTestHint')}</Text>
      <SetupButton
        {...btn}
        label={T('lsDone')}
        icon={ICONS.done}
        variant={automationVisited ? 'primary' : 'tonal'}
        onPress={finish}
      />
    </>
  );

  let content: ReactNode = null;
  if (unavailable) {
    content = (
      <View style={styles.allSet}>
        <Feather name="alert-circle" size={40} color={SETUP_AMBER} />
        <Text style={styles.allSetBody}>{T('lsUnavailable')}</Text>
        <View style={styles.stretch}>
          <SetupButton {...btn} label={T('lsClose')} onPress={dismiss} />
        </View>
      </View>
    );
  } else if (finished) {
    content = (
      <Animated.View entering={setupEntering(reduceMotion)} style={styles.allSet}>
        <SetupCheckBurst size={64} reduceMotion={reduceMotion} />
        <Text style={styles.allSetTitle}>{T('lsAllSetTitle')}</Text>
        <Text style={styles.allSetBody}>{T('lsAllSetBody')}</Text>
        <View style={styles.stretch}>
          <SetupButton {...btn} label={T('lsClose')} onPress={dismiss} />
        </View>
      </Animated.View>
    );
  } else if (activeStep != null) {
    const verifiedAt = setup.firstRunVerifiedAt;
    content = (
      <>
        <SetupStepCard
          {...btn}
          index={1}
          stepLabel={stepLabel(1)}
          title={T('lsStep1Title')}
          done={step1Done}
          expanded={activeStep === 1}
          doneSubtitle={T('lsStepDoneAdded')}
          onPressHeader={() => openStep(1)}
        >
          {stepOneBody}
        </SetupStepCard>
        <SetupStepConnector filled={step1Done} reduceMotion={reduceMotion} />
        <SetupStepCard
          {...btn}
          index={2}
          stepLabel={stepLabel(2)}
          title={T('lsStep2Title')}
          done={step2Done}
          expanded={activeStep === 2}
          doneSubtitle={verifiedAt ? T('lsStepDoneRun').replace('{time}', fmtTimeOfDay(verifiedAt, uses24h, T)) : null}
          onPressHeader={() => openStep(2)}
        >
          {stepTwoBody}
        </SetupStepCard>
        <SetupStepConnector filled={step2Done} reduceMotion={reduceMotion} />
        <SetupStepCard
          {...btn}
          index={3}
          stepLabel={stepLabel(3)}
          title={T('lsStep3Title')}
          done={step3Done}
          expanded={activeStep === 3}
          doneSubtitle={setup.automationConfirmedAt ? T('lsStepDoneAuto') : null}
          onPressHeader={() => openStep(3)}
        >
          {stepThreeBody}
        </SetupStepCard>
      </>
    );
  }

  return (
    // A page sheet starts below the status bar on iOS, so only a full-screen modal needs the inset.
    <View style={[styles.root, { paddingTop: Platform.OS === 'ios' ? 14 : insets.top + 14 }]}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <Text style={styles.stepOf}>{unavailable ? '' : stepLabel(finished ? 3 : activeStep ?? 1)}</Text>
        <Pressable
          onPress={dismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={T('lsClose')}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Feather name="x" size={17} color="#FFFFFF" />
        </Pressable>
      </View>
      {unavailable ? null : (
        <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[step1Done, step2Done, step3Done].map((filled, i) => (
            <ProgressSegment key={i} filled={filled} accent={linkAccent} reduceMotion={reduceMotion} />
          ))}
        </View>
      )}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        indicatorStyle="white"
      >
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>{T('lsSetupTitle')}</Text>
            <Text style={styles.heroSub}>{T('lsSetupSub')}</Text>
          </View>
          <HeroPreview
            model={todayModel}
            config={config}
            theme={theme}
            darkMinimal={darkMinimal}
            T={T}
            accent={accent}
            onAccent={onAccent}
            badge={T('lsAutoBadge')}
            accessibilityLabel={heroLabel}
            reduceMotion={reduceMotion}
          />
        </View>
        {content}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SHEET_BG,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    minHeight: 32,
  },
  stepOf: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  progress: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  segmentFill: {
    height: 4,
    borderRadius: 2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 22,
  },
  heroText: {
    flex: 1,
    gap: 6,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  heroShadow: {
    borderRadius: 10,
    boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 20, color: 'rgba(0,0,0,0.5)' }],
  },
  heroFrame: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  autoBadgeRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  autoBadge: {
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  autoBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  body: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
  },
  success: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  successText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  manual: {
    gap: 10,
  },
  manualTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  manualDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualDotText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  manualBody: {
    flex: 1,
    gap: 8,
  },
  manualText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    paddingTop: 2,
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  nameChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  copyText: {
    fontSize: 13,
    fontWeight: '700',
  },
  notice: {
    borderRadius: 16,
    padding: 12,
    gap: 6,
    borderWidth: 1,
  },
  noticeError: {
    backgroundColor: 'rgba(255,159,10,0.10)',
    borderColor: 'rgba(255,159,10,0.22)',
  },
  noticeNeutral: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noticeIcon: {
    marginTop: 2,
  },
  noticeTextCol: {
    flex: 1,
    gap: 6,
  },
  noticeTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  noticeText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  subCard: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    gap: 10,
  },
  subCardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  subCardBody: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  recipeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recipeIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  recipeWhy: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  testHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'center',
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(255,159,10,0.14)',
  },
  staleText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  allSet: {
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 22,
  },
  allSetTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  allSetBody: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
    textAlign: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
    marginTop: 8,
  },
});

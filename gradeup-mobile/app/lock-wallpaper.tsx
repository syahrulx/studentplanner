import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  AccessibilityInfo,
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type ViewShot from 'react-native-view-shot';

import { ExportCanvas, saveExportCanvas, shareExportCanvas } from '@/components/ViewShotCompat';
import BackgroundPicker from '@/components/lockScreen/BackgroundPicker';
import LayoutPanel from '@/components/lockScreen/LayoutPanel';
import { lockBackgroundGradient } from '@/components/lockScreen/LockBackground';
import LockCanvas from '@/components/lockScreen/LockCanvas';
import LockFullPreview from '@/components/lockScreen/LockFullPreview';
import LockPreview, { lockSizeLabel, useLockReduceMotion } from '@/components/lockScreen/LockPreview';
import LockStatusPill, { lockHealthPill } from '@/components/lockScreen/LockStatusPill';
import { SetupSymbol, type SetupIcon } from '@/components/lockScreen/SetupStepCard';
import ShowPanel from '@/components/lockScreen/ShowPanel';
import { StudioTabs, StudioTray, type LockConfigUpdate, type StudioTabId } from '@/components/lockScreen/StudioTabs';
import TemplatePicker from '@/components/lockScreen/TemplatePicker';
import type { ThemePalette } from '@/constants/Themes';
import { useLockScreenConfig } from '@/hooks/useLockScreenConfig';
import { useLockScreenHealth } from '@/hooks/useLockScreenHealth';
import { useLockScreenModelInput } from '@/hooks/useLockScreenModelInput';
import { useDarkMinimalThemePack, useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import type { TranslationKey } from '@/src/i18n';
import { withAlpha } from '@/src/lib/contrast';
import {
  consumeLockScreenPhotoMissing,
  getLockScreenConfigSnapshot,
  getLockScreenSetupSnapshot,
  lockScreenPhotoExists,
  updateLockScreenSetup,
} from '@/src/lib/lockScreen/lockScreenConfig';
import {
  dateFromISO,
  dayShortName,
  detectUses24h,
  fmtGhostDate,
  fmtTimeOfDay,
} from '@/src/lib/lockScreen/lockScreenFormat';
import { getLockCanvasSize } from '@/src/lib/lockScreen/lockScreenGeometry';
import { lockScreenUnsupportedReason } from '@/src/lib/lockScreen/lockScreenHealth';
import { buildLockScreenModels } from '@/src/lib/lockScreen/lockScreenModel';
import {
  lockChromeAccent,
  lockGradientLayers,
  resolveLockInk,
  type LockGradientLayer,
} from '@/src/lib/lockScreen/lockScreenPalette';
import { requestLockScreenRender } from '@/src/lib/lockScreen/lockScreenRenderQueue';
import { runLockScreenShortcut } from '@/src/lib/lockScreen/lockScreenShortcut';
import { clearLockScreenImages } from '@/src/lib/lockScreen/lockScreenStore';
import type {
  LockBackgroundId,
  LockScreenDayModel,
  LockScreenHealth,
  LockSize,
} from '@/src/lib/lockScreen/types';
import { getTodayISO } from '@/src/utils/date';

/**
 * The lock screen Studio (spec §3.2): an always-dark editor, like iOS's own
 * lock screen customiser, around a live preview of the exact picture the
 * automation will set.
 *
 * The path it is built for: a student opens it, sees their real day on the
 * preview, taps "Make it automatic" and lands in setup. Everything else
 * (templates, backgrounds, position, what shows) is optional polish in the
 * tray; every edit is already live, because the render host redraws the
 * week's pictures from the same config within half a second.
 *
 * Previews, template cards, Save to Photos and the render host all draw
 * through LockCanvas from the same model input (useLockScreenModelInput), so
 * what the student sees here is what their lock screen gets.
 *
 * Param: ?setup=1 (Smart automations card) runs "Make it automatic" on open.
 */

type Timer = ReturnType<typeof setTimeout>;
type Translate = (key: TranslationKey) => string;
type FeatherName = ComponentProps<typeof Feather>['name'];

const STUDIO_BG = '#08090B';
/** Read by the Timetable menu's NEW badge; any non-null value means "opened once". */
const STUDIO_SEEN_KEY = 'lock_screen_studio_seen_v1';
/** How many Studio visits have shown "Opens Shortcuts for a second" under Update now. */
const UPDATE_CAPTION_KEY = 'lock_screen_update_caption_v1';
const UPDATE_CAPTION_VISITS = 3;
/** Served date the "weekly view was used" banner last explained. */
const FALLBACK_BANNER_KEY = 'lock_screen_fallback_banner_v1';

/** The scrubber's Backup chip, after today..today+6. */
/**
 * The backup chip's index, deliberately outside any array.
 *
 * It used to be 7, which was free only while the scrubber showed exactly seven
 * days. When RENDER_DAYS became 14 the eighth day took index 7 too: React saw
 * two chips keyed `7`, and `isBackup` matched that real day, so tapping it
 * showed the fallback design instead of its timetable. A negative sentinel can
 * never be a day index, however many days are rendered.
 */
const BACKUP_INDEX = -1;

const AUTO_SETUP_DELAY_MS = 350;
const BANNER_MS = 6000;
const TOO_TALL_MS = 2500;
const SAVED_TOAST_MS = 4000;
const DENIED_TOAST_MS = 6000;
const ERROR_TOAST_MS = 3000;
const SAVE_CHECK_MS = 1600;
/** LockCanvas reports ready once its background is drawn; past this, capture what is there. */
const EXPORT_READY_TIMEOUT_MS = 3000;
const SAVE_QUALITY = 0.92;

const AMBIENT_FADE_MS = 400;
const AMBIENT_SCALE = 1.4;
const AMBIENT_OPACITY = 0.35;
/** mass 1 spelled out: Reanimated 4's default mass of 4 turns these into a slow wobble. */
const ENTRY_SPRING = { damping: 20, stiffness: 180, mass: 1 } as const;
const ENTRY_SCALE = 0.94;
const REDUCED_FADE_MS = 150;

const PREVIEW_MIN_H = 260;
/**
 * Below this window height (SE-class phones) the spec's 260-pt minimum would
 * push the CTA off screen; the preview gives way instead, and tap-to-expand
 * still shows it full size.
 */
const COMPACT_WINDOW_H = 740;
const PREVIEW_MIN_H_COMPACT = 160;
const CTA_H = 54;
const SUB_CAPTION_H = 18;

const FADE_IN = FadeIn.duration(180).reduceMotion(ReduceMotion.Never);
const FADE_OUT = FadeOut.duration(120).reduceMotion(ReduceMotion.Never);

// ─── CTA states (spec §3.2 table) ───────────────────────────────────────────

type CtaAction = 'auto' | 'continue' | 'update' | 'fix' | 'save' | 'share';

const PRIMARY_ACTION: Record<LockScreenHealth['kind'], CtaAction> = {
  off: 'auto',
  setup: 'continue',
  pending: 'update',
  healthy: 'update',
  stale: 'fix',
  unsupported: 'save',
};

const SECONDARY_ACTION: Record<LockScreenHealth['kind'], CtaAction> = {
  off: 'save',
  setup: 'save',
  pending: 'save',
  healthy: 'save',
  stale: 'update',
  unsupported: 'share',
};

const CTA_LABEL: Record<CtaAction, TranslationKey> = {
  auto: 'lsCtaAuto',
  continue: 'lsCtaContinue',
  update: 'lsCtaUpdate',
  fix: 'lsCtaFix',
  save: 'lsCtaSave',
  share: 'lsCtaShare',
};

const CTA_ICON: Record<CtaAction, SetupIcon> = {
  auto: { sf: 'wand.and.stars', feather: 'zap' },
  continue: { sf: 'arrow.right.circle', feather: 'arrow-right-circle' },
  update: { sf: 'arrow.clockwise', feather: 'refresh-cw' },
  fix: { sf: 'wrench.and.screwdriver', feather: 'tool' },
  save: { sf: 'square.and.arrow.down', feather: 'download' },
  share: { sf: 'square.and.arrow.up', feather: 'share' },
};

const CHECK_ICON: SetupIcon = { sf: 'checkmark', feather: 'check' };

// ─── Small helpers ───────────────────────────────────────────────────────────

function lightHaptic(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function warnHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(count);
  });
}

function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Timeouts that are cleared when the screen unmounts, so nothing sets state afterwards. */
function useTimers() {
  const live = useRef(new Set<Timer>());
  useEffect(() => {
    const timers = live.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);
  return useMemo(
    () => ({
      after(ms: number, fn: () => void): Timer {
        const id = setTimeout(() => {
          live.current.delete(id);
          fn();
        }, ms);
        live.current.add(id);
        return id;
      },
      cancel(id: Timer | null): void {
        if (!id) return;
        clearTimeout(id);
        live.current.delete(id);
      },
    }),
    [],
  );
}

/** Today's date, rolling over at local midnight and whenever the app comes back. */
function useTodayISO(): string {
  const [today, setToday] = useState(getTodayISO);
  useEffect(() => {
    const sync = () => setToday(getTodayISO());
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync();
    });
    let timer: Timer;
    const arm = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(() => {
        sync();
        arm();
      }, next.getTime() - now.getTime() + 1000);
    };
    arm();
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);
  return today;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

interface CaptionToast {
  id: number;
  text: string;
  action?: { label: string; onPress: () => void };
}

type BannerKind = 'auto' | 'fallback' | 'photoMissing';

interface StudioBannerItem {
  kind: BannerKind;
  text: string;
  icon: FeatherName;
  iconColor: string;
}

interface ExportJob {
  id: number;
  model: LockScreenDayModel;
}

interface DayChipItem {
  index: number;
  label: string;
  a11yLabel: string;
  backup: boolean;
}

export default function LockScreenStudio() {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const params = useLocalSearchParams<{ setup?: string }>();
  const isFocused = useIsFocused();
  const theme = useTheme();
  const darkMinimal = useDarkMinimalThemePack();
  // Starts from Reanimated's synchronous read, so the entry animation already respects it.
  const reduceMotion = useLockReduceMotion();
  const { timetable, dataReady } = useApp();
  const [config, updateConfig, configLoaded] = useLockScreenConfig();
  const { health, status, setup, renderState, loaded: healthLoaded, refresh } = useLockScreenHealth();
  const modelInput = useLockScreenModelInput();
  const T: Translate = modelInput.T;
  const timers = useTimers();

  const todayISO = useTodayISO();
  const [uses24h] = useState(detectUses24h);
  const [canvas] = useState(getLockCanvasSize);
  const { W, H, s } = canvas;
  const isIOS = Platform.OS === 'ios';
  const unsupported = lockScreenUnsupportedReason() != null;
  // The dark-glass accent: the Studio is always dark, and Mono/Spider get white instead of near-black.
  const ink = useMemo(() => resolveLockInk('dark', theme, darkMinimal), [theme, darkMinimal]);
  // For text, links and tracks on the near-black chrome; filled buttons keep ink.accent.
  const chromeAccent = useMemo(() => lockChromeAccent(ink.accent), [ink.accent]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── Models: today..today+6 and the undated backup ──
  const models = useMemo(
    () => buildLockScreenModels({ ...modelInput, nowMs: Date.now(), uses24h }, todayISO),
    [modelInput, todayISO, uses24h],
  );
  const dayModels = useMemo(() => models.dates.map((d) => models.days[d]), [models]);
  const todayModel = dayModels[0];

  const [dayIndex, setDayIndex] = useState(0);
  const isBackup = dayIndex === BACKUP_INDEX;
  const selectedModel = isBackup ? models.fallback : (dayModels[dayIndex] ?? todayModel);
  const selectedDateISO = isBackup ? null : models.dates[dayIndex];

  const dayChips = useMemo<DayChipItem[]>(() => {
    const chips = models.dates.map((dateISO, i) => {
      const d = dateFromISO(dateISO);
      const longDate = fmtGhostDate(dateISO);
      if (i < 2) {
        const label = T(i === 0 ? 'lsDayToday' : 'lsDayTomorrow');
        return { index: i, label, a11yLabel: `${label}, ${longDate}`, backup: false };
      }
      const label = d ? `${dayShortName(d.getDay(), T)} ${d.getDate()}` : dateISO;
      return { index: i, label, a11yLabel: longDate, backup: false };
    });
    // The backup picture only exists where the lock screen refreshes itself.
    if (!unsupported) {
      chips.push({ index: BACKUP_INDEX, label: T('lsDayBackup'), a11yLabel: T('lsDayBackup'), backup: true });
    }
    return chips;
  }, [models.dates, T, unsupported]);

  const selectDay = useCallback(
    (index: number) => {
      if (index === dayIndex) return;
      Haptics.selectionAsync().catch(() => {});
      setDayIndex(index);
    },
    [dayIndex],
  );

  // ── Edits: every design change also arms the pill's "changes show on next update" ──
  const [configEditedAt, setConfigEditedAt] = useState<number | null>(null);
  const edit = useCallback<LockConfigUpdate>(
    (patch) => {
      setConfigEditedAt(Date.now());
      return updateConfig(patch);
    },
    [updateConfig],
  );

  const [tab, setTab] = useState<StudioTabId>(() =>
    // With no timetable, the Show tab is the "add your timetable" card: open on it.
    dataReady && timetable.length === 0 ? 'show' : 'template',
  );

  // ── First visit: coach bubble, drag hint, and the Timetable menu's NEW badge ──
  const [firstVisit, setFirstVisit] = useState(false);
  const [dragged, setDragged] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(STUDIO_SEEN_KEY)
      .then((seen) => {
        if (seen != null) return;
        if (mounted.current) setFirstVisit(true);
        return AsyncStorage.setItem(STUDIO_SEEN_KEY, '1');
      })
      .catch(() => {});
  }, []);

  // ── Caption toasts (too tall, save results) ──
  const [toast, setToast] = useState<CaptionToast | null>(null);
  const toastSeq = useRef(0);
  const toastTimer = useRef<Timer | null>(null);
  const showToast = useCallback(
    (text: string, ms: number, action?: CaptionToast['action']) => {
      timers.cancel(toastTimer.current);
      const id = ++toastSeq.current;
      setToast({ id, text, action });
      toastTimer.current = timers.after(ms, () => setToast((cur) => (cur?.id === id ? null : cur)));
    },
    [timers],
  );

  // ── Banners over the top of the preview ──
  const [banners, setBanners] = useState<StudioBannerItem[]>([]);
  const pushBanner = useCallback((item: StudioBannerItem) => {
    setBanners((queue) => (queue.some((b) => b.kind === item.kind) ? queue : [...queue, item]));
  }, []);
  const dismissBanner = useCallback(() => setBanners((queue) => queue.slice(1)), []);
  const banner = banners[0] ?? null;
  useEffect(() => {
    if (!banner) return;
    AccessibilityInfo.announceForAccessibility(banner.text);
    const id = timers.after(BANNER_MS, dismissBanner);
    return () => timers.cancel(id);
  }, [banner, dismissBanner, timers]);

  const photoChecked = useRef(false);
  useEffect(() => {
    if (!configLoaded || photoChecked.current) return;
    photoChecked.current = true;
    if (consumeLockScreenPhotoMissing()) {
      pushBanner({ kind: 'photoMissing', text: T('lsBgPhotoMissing'), icon: 'image', iconColor: '#FF9F0A' });
    }
  }, [configLoaded, pushBanner, T]);

  useEffect(() => {
    if (!isFocused || !healthLoaded || !setup.automationBannerPending) return;
    const servedAt = status?.lastServedAt ?? setup.automationConfirmedAt ?? Date.now();
    const now = Date.now();
    const time = fmtTimeOfDay(servedAt, uses24h, T);
    const morning = sameLocalDay(servedAt, now) && new Date(servedAt).getHours() < 12;
    pushBanner({
      kind: 'auto',
      text: T(morning ? 'lsBannerAuto' : 'lsBannerAutoAny').replace('{time}', time),
      icon: 'check-circle',
      iconColor: '#30D158',
    });
    void updateLockScreenSetup({ automationBannerPending: false });
  }, [isFocused, healthLoaded, setup.automationBannerPending, setup.automationConfirmedAt, status, uses24h, T, pushBanner]);

  const fallbackDate = health.kind === 'healthy' && health.usedFallback ? health.servedDateISO : null;
  const fallbackChecked = useRef<string | null>(null);
  useEffect(() => {
    if (!isFocused || fallbackDate !== todayISO || fallbackChecked.current === fallbackDate) return;
    fallbackChecked.current = fallbackDate;
    AsyncStorage.getItem(FALLBACK_BANNER_KEY)
      .then((explained) => {
        if (explained === fallbackDate) return;
        if (mounted.current) {
          pushBanner({ kind: 'fallback', text: T('lsBannerFallback'), icon: 'calendar', iconColor: '#0A84FF' });
        }
        return AsyncStorage.setItem(FALLBACK_BANNER_KEY, fallbackDate);
      })
      .catch(() => {});
  }, [isFocused, fallbackDate, todayISO, pushBanner, T]);

  // ── Actions ──
  const makeAutomatic = useCallback(() => {
    void updateConfig({ autoRefresh: true });
    // Not awaited: setup's step 2 waits on today's picture itself.
    void requestLockScreenRender({ priority: 'today', reason: 'studio-make-automatic' });
    const current = getLockScreenSetupSnapshot();
    // Set up on this phone before (turned off and on again): the pill takes it from here.
    if (current.completedAt && current.firstRunVerifiedAt) return;
    router.push('/lock-screen-setup');
  }, [updateConfig]);

  const [running, setRunning] = useState(false);
  const [successAt, setSuccessAt] = useState<number | null>(null);
  const runningRef = useRef(false);
  const updateNow = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    const outcome = await runLockScreenShortcut({ autoRetryNotReady: true });
    runningRef.current = false;
    if (!mounted.current) return;
    setRunning(false);
    if (outcome.kind === 'ok') {
      refresh();
      // The pill plays the check morph and the Success haptic for this.
      setSuccessAt(Date.now());
      return;
    }
    if (outcome.kind === 'cancelled') return;
    warnHaptic();
    router.push(`/lock-screen-setup?step=2&error=${outcome.kind}`);
  }, [refresh]);

  const openSetup = useCallback(() => router.push('/lock-screen-setup'), []);
  const openFix = useCallback(() => router.push('/lock-screen-setup?step=3&stale=1'), []);

  const confirmTurnOff = useCallback(() => {
    Alert.alert(T('lsOffConfirmTitle'), T('lsOffConfirmBody'), [
      { text: T('lsCancel'), style: 'cancel' },
      {
        text: T('lsOffConfirmOk'),
        style: 'destructive',
        onPress: () => {
          // The snapshot flips before the write lands, so a render pass mid-capture won't put pictures back.
          void updateConfig({ autoRefresh: false });
          try {
            clearLockScreenImages();
          } catch {
            /* nothing to clear */
          }
          Haptics.selectionAsync().catch(() => {});
        },
      },
    ]);
  }, [T, updateConfig]);

  // ── Save to Photos / Share: the selected day drawn offscreen at full size ──
  const exportRef = useRef<ViewShot>(null);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const exportSeq = useRef(0);
  const exportReady = useRef<(() => void) | null>(null);
  const exportBusy = useRef(false);
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [shareBusy, setShareBusy] = useState(false);

  const drawForExport = useCallback(
    (model: LockScreenDayModel) =>
      new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          timers.cancel(timeout);
          exportReady.current = null;
          resolve();
        };
        // Past the timeout, capture what is drawn rather than hang the button.
        const timeout = timers.after(EXPORT_READY_TIMEOUT_MS, finish);
        exportReady.current = () => {
          void nextFrames(2).then(finish);
        };
        setExportJob({ id: ++exportSeq.current, model });
      }),
    [timers],
  );
  const onExportReady = useCallback(() => exportReady.current?.(), []);

  const savePicture = useCallback(async () => {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setSaveState('busy');
    try {
      await drawForExport(selectedModel);
      const result = await saveExportCanvas(exportRef.current, { format: 'jpg', quality: SAVE_QUALITY });
      if (!mounted.current) return;
      if (result === 'saved') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setSaveState('done');
        timers.after(SAVE_CHECK_MS, () => setSaveState('idle'));
        const hint = isIOS ? T('lsSavedIosHint') : Platform.OS === 'android' ? T('lsSavedAndroidHint') : null;
        showToast(hint ? `${T('lsSaved')} · ${hint}` : T('lsSaved'), SAVED_TOAST_MS);
        return;
      }
      warnHaptic();
      setSaveState('idle');
      if (result === 'denied') {
        showToast(T('lsSaveDenied'), DENIED_TOAST_MS, {
          label: T('lsOpenSettings'),
          onPress: () => {
            Linking.openSettings().catch(() => {});
          },
        });
      } else {
        showToast(T('lsSaveError'), ERROR_TOAST_MS);
      }
    } finally {
      exportBusy.current = false;
      if (mounted.current) setExportJob(null);
    }
  }, [drawForExport, selectedModel, isIOS, T, showToast, timers]);

  const sharePicture = useCallback(async () => {
    if (exportBusy.current) return;
    exportBusy.current = true;
    setShareBusy(true);
    try {
      await drawForExport(selectedModel);
      const result = await shareExportCanvas(exportRef.current);
      if (result === 'error') warnHaptic();
    } finally {
      exportBusy.current = false;
      if (mounted.current) {
        setShareBusy(false);
        setExportJob(null);
      }
    }
  }, [drawForExport, selectedModel]);

  const runAction = useCallback(
    (action: CtaAction) => {
      switch (action) {
        case 'auto':
          makeAutomatic();
          break;
        case 'continue':
          openSetup();
          break;
        case 'update':
          void updateNow();
          break;
        case 'fix':
          openFix();
          break;
        case 'save':
          void savePicture();
          break;
        case 'share':
          void sharePicture();
          break;
      }
    },
    [makeAutomatic, openSetup, updateNow, openFix, savePicture, sharePicture],
  );

  // ── Action sheet (pill tap and ⋯) ──
  const showMenu = isIOS && !unsupported;
  const openMenu = useCallback(() => {
    if (!showMenu) return;
    const pill = lockHealthPill(health, T, { now: Date.now(), uses24h, setupCompletedAt: setup.completedAt });
    const on = config.autoRefresh;
    const items: { label: string; run: () => void; destructive?: boolean }[] = on
      ? [
          {
            label: T('lsCtaUpdate'),
            run: () => {
              lightHaptic();
              void updateNow();
            },
          },
          { label: T('lsMenuSetupGuide'), run: openSetup },
          { label: T('lsCtaShare'), run: () => void sharePicture() },
          { label: T('lsMenuTurnOff'), run: confirmTurnOff, destructive: true },
        ]
      : [
          { label: T('lsMenuSetupGuide'), run: openSetup },
          { label: T('lsCtaShare'), run: () => void sharePicture() },
        ];
    let message: string | undefined;
    if (health.kind === 'healthy') {
      if (health.usedFallback) message = T('lsSheetMsgFallback');
      else if (setup.automationConfirmedAt) message = T('lsSheetMsgAuto');
    }
    const destructive = items.findIndex((item) => item.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: pill?.text,
        message,
        options: [...items.map((item) => item.label), T('lsCancel')],
        cancelButtonIndex: items.length,
        destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
        userInterfaceStyle: 'dark',
      },
      (index) => items[index]?.run(),
    );
  }, [
    showMenu,
    health,
    T,
    uses24h,
    setup.completedAt,
    setup.automationConfirmedAt,
    config.autoRefresh,
    updateNow,
    openSetup,
    sharePicture,
    confirmTurnOff,
  ]);

  // ── ?setup=1: run "Make it automatic" once everything has loaded ──
  const mountedAt = useRef(Date.now());
  const autoSetupStarted = useRef(false);
  const makeAutomaticRef = useRef(makeAutomatic);
  makeAutomaticRef.current = makeAutomatic;
  useEffect(() => {
    if (params.setup !== '1' || autoSetupStarted.current || !healthLoaded || unsupported) return;
    autoSetupStarted.current = true;
    // Not tied to this effect's cleanup: a later re-run must not cancel it.
    timers.after(Math.max(0, AUTO_SETUP_DELAY_MS - (Date.now() - mountedAt.current)), () => {
      if (!getLockScreenConfigSnapshot().autoRefresh) {
        lightHaptic();
        makeAutomaticRef.current();
      } else if (!getLockScreenSetupSnapshot().completedAt) {
        router.push('/lock-screen-setup');
      }
    });
  }, [params.setup, healthLoaded, unsupported, timers]);

  // ── Under the CTA ──
  const updateVisible = health.kind === 'pending' || health.kind === 'healthy' || health.kind === 'stale';
  const [updateCaption, setUpdateCaption] = useState(false);
  const updateCaptionCounted = useRef(false);
  useEffect(() => {
    if (!updateVisible || updateCaptionCounted.current) return;
    updateCaptionCounted.current = true;
    AsyncStorage.getItem(UPDATE_CAPTION_KEY)
      .then((raw) => {
        const shown = Number(raw) || 0;
        if (shown >= UPDATE_CAPTION_VISITS) return;
        if (mounted.current) setUpdateCaption(true);
        return AsyncStorage.setItem(UPDATE_CAPTION_KEY, String(shown + 1));
      })
      .catch(() => {});
  }, [updateVisible]);

  const subCaption =
    Platform.OS === 'android' ? T('lsSavedAndroidHint') : updateCaption && updateVisible ? T('lsUpdateCaption') : null;

  // ── Preview entry: 0.94 → 1 with a fade, once the student's own design has loaded ──
  const entryScale = useSharedValue(ENTRY_SCALE);
  const entryOpacity = useSharedValue(0);
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  useEffect(() => {
    if (!configLoaded) return;
    if (reduceMotionRef.current) {
      entryScale.value = 1;
      entryOpacity.value = withTiming(1, { duration: REDUCED_FADE_MS, reduceMotion: ReduceMotion.Never });
    } else {
      entryScale.value = withSpring(1, ENTRY_SPRING);
      entryOpacity.value = withTiming(1, { duration: 260 });
    }
  }, [configLoaded, entryScale, entryOpacity]);
  const entryStyle = useAnimatedStyle(() => ({
    opacity: entryOpacity.value,
    transform: [{ scale: entryScale.value }],
  }));

  const ctaReady = healthLoaded || unsupported;
  const ctaOpacity = useSharedValue(0);
  useEffect(() => {
    if (ctaReady) ctaOpacity.value = withTiming(1, { duration: 180, reduceMotion: ReduceMotion.Never });
  }, [ctaReady, ctaOpacity]);
  const ctaStyle = useAnimatedStyle(() => ({ opacity: ctaOpacity.value }));

  // ── Preview callbacks ──
  const onCommitTopFrac = useCallback((topFrac: number | null) => void edit({ topFrac }), [edit]);
  const onSizeStepDown = useCallback(
    (size: LockSize) => {
      void edit({ size });
      showToast(T('lsTooTall').replace('{size}', lockSizeLabel(size, T)), TOO_TALL_MS);
    },
    [edit, showToast, T],
  );
  const onFullSizeStepDown = useCallback((size: LockSize) => void edit({ size }), [edit]);
  const onDragStateChange = useCallback((dragging: boolean) => {
    if (dragging) setDragged(true);
  }, []);
  const [fullOpen, setFullOpen] = useState(false);
  const openFull = useCallback(() => setFullOpen(true), []);
  const closeFull = useCallback(() => setFullOpen(false), []);

  // ── Caption: toast › backup › first-visit drag hint › scrubber ──
  let captionKey: string;
  let captionText: string;
  if (toast) {
    captionKey = `toast-${toast.id}`;
    captionText = toast.text;
  } else if (isBackup) {
    captionKey = 'backup';
    captionText = T('lsBackupCaption');
  } else if (firstVisit && !dragged) {
    captionKey = 'drag';
    captionText = T('lsDragHint');
  } else {
    captionKey = 'scrub';
    captionText = T('lsScrubCaption');
  }

  const primary = PRIMARY_ACTION[health.kind];
  const secondary = SECONDARY_ACTION[health.kind];
  const statusOf = (action: CtaAction): 'busy' | 'done' | null => {
    if (action === 'update') return running ? 'busy' : null;
    if (action === 'save') return saveState === 'idle' ? null : saveState;
    if (action === 'share') return shareBusy ? 'busy' : null;
    return null;
  };

  const ambient = useMemo(() => ambientSpec(config.background, config.photoPath, theme), [
    config.background,
    config.photoPath,
    theme,
  ]);

  const previewMin = windowH >= COMPACT_WINDOW_H ? PREVIEW_MIN_H : PREVIEW_MIN_H_COMPACT;
  const bottomPad = Math.max(insets.bottom, 12);
  const ctaPadBottom = subCaption ? Math.max(bottomPad - SUB_CAPTION_H, 12) : bottomPad;

  const panelProps = { config, update: edit, T, reduceMotion };

  return (
    <View style={styles.root}>
      {/* Only while focused: StatusBar entries stack by mount order, so a
          screen pushed on top (timetable-edit) would inherit white icons. */}
      {isFocused ? <StatusBar style="light" /> : null}
      {configLoaded ? <StudioAmbient spec={ambient} /> : null}

      {/* 1 · Top bar */}
      <View style={[styles.topBar, { marginTop: insets.top }]}>
        <GlassCircle icon="chevron-left" size={20} label={T('back')} onPress={goBack} />
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {T('lsTitle')}
        </Text>
        {showMenu ? (
          <GlassCircle icon="more-horizontal" size={20} label={T('lsA11yMore')} onPress={openMenu} />
        ) : (
          <View style={styles.circleSpacer} />
        )}
      </View>

      {/* 2 · Status pill (iOS; returns nothing on Android and iPad) */}
      <LockStatusPill
        health={health}
        setup={setup}
        renderState={renderState}
        T={T}
        accent={chromeAccent}
        reduceMotion={reduceMotion}
        loaded={healthLoaded}
        running={running}
        configEditedAt={configEditedAt}
        successAt={successAt}
        onPress={showMenu ? openMenu : undefined}
        style={styles.pill}
      />

      {/* 3 · Preview, with banners floating over its top edge so the frame never jumps */}
      <Animated.View style={[styles.previewWrap, { minHeight: previewMin }, entryStyle]}>
        {configLoaded ? (
          <LockPreview
            style={styles.fill}
            model={selectedModel}
            rangeModels={dayModels}
            config={config}
            W={W}
            H={H}
            s={s}
            theme={theme}
            darkMinimal={darkMinimal}
            T={T}
            dateISO={selectedDateISO}
            showCoach={firstVisit}
            onCommitTopFrac={onCommitTopFrac}
            onSizeStepDown={onSizeStepDown}
            onExpand={openFull}
            onDragStateChange={onDragStateChange}
          />
        ) : null}
        <View pointerEvents="box-none" style={styles.bannerSlot}>
          {banner ? (
            <StudioBanner key={banner.kind} item={banner} onDismiss={dismissBanner} reduceMotion={reduceMotion} />
          ) : null}
        </View>
      </Animated.View>

      {/* 4 · Caption: one line in a fixed slot, so its copy (lsBackupCaption is the
          longest) must fit a 375-pt phone at 1.2 × 0.75 of 11 pt: about 380 pt at 1×. */}
      <View style={styles.captionSlot}>
        <Animated.View key={captionKey} entering={FADE_IN} exiting={FADE_OUT} style={styles.captionRow}>
          <Text
            style={styles.caption}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.2}
            accessibilityLiveRegion={toast ? 'polite' : 'none'}
          >
            {captionText}
          </Text>
          {toast?.action ? (
            <Pressable onPress={toast.action.onPress} hitSlop={10} accessibilityRole="link">
              <Text style={[styles.captionAction, { color: chromeAccent }]} maxFontSizeMultiplier={1.2}>
                {toast.action.label}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>

      {/* 5 · Day scrubber */}
      <DayScrubber chips={dayChips} selected={dayIndex} onSelect={selectDay} reduceMotion={reduceMotion} />

      {/* 6 · Tabs, 7 · Tray */}
      <StudioTabs value={tab} onChange={setTab} T={T} reduceMotion={reduceMotion} style={styles.tabs} />
      <StudioTray tab={tab} reduceMotion={reduceMotion} style={styles.tray}>
        {!configLoaded ? null : tab === 'template' ? (
          <TemplatePicker {...panelProps} model={todayModel} theme={theme} darkMinimal={darkMinimal} W={W} H={H} s={s} />
        ) : tab === 'background' ? (
          <BackgroundPicker {...panelProps} theme={theme} />
        ) : tab === 'layout' ? (
          <LayoutPanel {...panelProps} accent={chromeAccent} />
        ) : (
          <ShowPanel
            {...panelProps}
            accent={ink.accent}
            darkMinimal={darkMinimal}
            timetableEmpty={timetable.length === 0}
          />
        )}
      </StudioTray>

      {/* 8 · CTA bar */}
      <Animated.View style={[styles.ctaBar, { paddingBottom: ctaPadBottom }, ctaStyle]}>
        <View style={styles.ctaRow}>
          <StudioButton
            kind="primary"
            label={T(CTA_LABEL[primary])}
            icon={CTA_ICON[primary]}
            status={statusOf(primary)}
            accent={ink.accent}
            onAccent={ink.onAccent}
            reduceMotion={reduceMotion}
            disabled={!ctaReady}
            onPress={() => runAction(primary)}
          />
          <StudioButton
            kind="glass"
            label={T(CTA_LABEL[secondary])}
            icon={CTA_ICON[secondary]}
            status={statusOf(secondary)}
            accent={ink.accent}
            onAccent={ink.onAccent}
            reduceMotion={reduceMotion}
            disabled={!ctaReady}
            onPress={() => runAction(secondary)}
          />
        </View>
        {subCaption ? (
          <Text style={styles.subCaption} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.2}>
            {subCaption}
          </Text>
        ) : null}
      </Animated.View>

      {/* Save / Share: the selected day at full size, offscreen but still in the window for captureRef. */}
      {exportJob ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.exportHost, { left: -(W + 200), width: W, height: H }]}
        >
          <ExportCanvas ref={exportRef} format="jpg" quality={SAVE_QUALITY} style={{ width: W, height: H }}>
            <LockCanvas
              key={exportJob.id}
              model={exportJob.model}
              config={config}
              W={W}
              H={H}
              s={s}
              theme={theme}
              darkMinimal={darkMinimal}
              T={T}
              forCapture
              onReady={onExportReady}
            />
          </ExportCanvas>
        </View>
      ) : null}

      {configLoaded ? (
        <LockFullPreview
          visible={fullOpen}
          onClose={closeFull}
          model={selectedModel}
          rangeModels={dayModels}
          config={config}
          W={W}
          H={H}
          s={s}
          theme={theme}
          darkMinimal={darkMinimal}
          T={T}
          dateISO={selectedDateISO}
          onCommitTopFrac={onCommitTopFrac}
          onSizeStepDown={onFullSizeStepDown}
        />
      ) : null}
    </View>
  );
}

// ─── Ambient backdrop ────────────────────────────────────────────────────────

interface AmbientSpec {
  key: string;
  photo: string | null;
  layers: readonly LockGradientLayer[] | null;
}

function ambientSpec(background: LockBackgroundId, photoPath: string | null, theme: ThemePalette): AmbientSpec {
  if (background === 'photo' && photoPath && lockScreenPhotoExists(photoPath)) {
    return { key: `photo:${photoPath}`, photo: photoPath, layers: null };
  }
  // A missing photo falls back to Dusk here too, as it does on the picture.
  const colors = lockBackgroundGradient(background, theme);
  return { key: colors.join(','), photo: null, layers: lockGradientLayers(colors) };
}

/**
 * The chosen background, enlarged and dimmed behind the whole editor so the
 * Studio takes on the wallpaper's colour. A new background fades in over the
 * old one, which leaves only once it is covered, so the room never dips dark.
 */
function StudioAmbient({ spec }: { spec: AmbientSpec }) {
  const [layers, setLayers] = useState<AmbientSpec[]>([spec]);

  useEffect(() => {
    setLayers((prev) => (prev[prev.length - 1].key === spec.key ? prev : [...prev.slice(-1), spec]));
  }, [spec]);

  useEffect(() => {
    if (layers.length < 2) return;
    const id = setTimeout(() => setLayers((prev) => prev.slice(-1)), AMBIENT_FADE_MS + 60);
    return () => clearTimeout(id);
  }, [layers]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <View style={[StyleSheet.absoluteFill, styles.ambientTint]}>
        {layers.map((layer) => (
          <Animated.View
            key={layer.key}
            entering={FadeIn.duration(AMBIENT_FADE_MS).reduceMotion(ReduceMotion.Never)}
            style={[StyleSheet.absoluteFill, styles.ambientLayer]}
          >
            {layer.photo ? (
              <Image
                source={{ uri: layer.photo }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                blurRadius={40}
                transition={null}
                cachePolicy="memory"
                accessible={false}
              />
            ) : (
              layer.layers?.map((g, i) => (
                <LinearGradient key={i} colors={g.colors} start={g.start} end={g.end} style={StyleSheet.absoluteFill} />
              ))
            )}
          </Animated.View>
        ))}
      </View>
      <View style={[StyleSheet.absoluteFill, styles.ambientShade]} />
    </View>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function GlassCircle({
  icon,
  size,
  label,
  onPress,
}: {
  icon: FeatherName;
  size: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.circle, pressed && styles.circlePressed]}
    >
      <Feather name={icon} size={size} color="#FFFFFF" />
    </Pressable>
  );
}

function StudioBanner({
  item,
  onDismiss,
  reduceMotion,
}: {
  item: StudioBannerItem;
  onDismiss: () => void;
  reduceMotion: boolean;
}) {
  return (
    <Animated.View
      entering={
        reduceMotion ? FadeIn.duration(REDUCED_FADE_MS).reduceMotion(ReduceMotion.Never) : FadeInDown.duration(260)
      }
      exiting={FadeOut.duration(180).reduceMotion(ReduceMotion.Never)}
      style={styles.banner}
    >
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={item.text} style={styles.bannerInner}>
        <Feather name={item.icon} size={15} color={item.iconColor} />
        <Text style={styles.bannerText} numberOfLines={3} maxFontSizeMultiplier={1.2}>
          {item.text}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function DayScrubber({
  chips,
  selected,
  onSelect,
  reduceMotion,
}: {
  chips: DayChipItem[];
  selected: number;
  onSelect: (index: number) => void;
  reduceMotion: boolean;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef(new Map<number, { x: number; width: number }>());
  const [viewW, setViewW] = useState(0);
  const [contentW, setContentW] = useState(0);

  // Keep the chosen chip in view, centred where the row allows it.
  useEffect(() => {
    const chip = layouts.current.get(selected);
    if (!chip || viewW <= 0) return;
    const maxX = Math.max(0, contentW - viewW);
    const x = Math.min(maxX, Math.max(0, chip.x + chip.width / 2 - viewW / 2));
    scrollRef.current?.scrollTo({ x, animated: !reduceMotion });
  }, [selected, viewW, contentW, reduceMotion]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrubber}
      contentContainerStyle={styles.scrubberContent}
      onLayout={(e: LayoutChangeEvent) => setViewW(e.nativeEvent.layout.width)}
      onContentSizeChange={(w) => setContentW(w)}
    >
      {chips.map((chip) => (
        <DayChip
          key={chip.index}
          chip={chip}
          selected={chip.index === selected}
          onPress={() => onSelect(chip.index)}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            layouts.current.set(chip.index, { x, width });
          }}
        />
      ))}
    </ScrollView>
  );
}

const CHIP_BG = 'rgba(255,255,255,0.08)';
const CHIP_BG_ON = '#FFFFFF';
const CHIP_TEXT = 'rgba(255,255,255,0.8)';

function DayChip({
  chip,
  selected,
  onPress,
  onLayout,
}: {
  chip: DayChipItem;
  selected: boolean;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, { duration: 180 });
  }, [selected, on]);
  const bg = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(on.value, [0, 1], [CHIP_BG, CHIP_BG_ON]) }));
  const fg = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [CHIP_TEXT, STUDIO_BG]) }));

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      accessibilityLabel={chip.a11yLabel}
      accessibilityState={{ selected }}
    >
      <Animated.View style={[styles.chip, bg]}>
        {chip.backup ? <Feather name="archive" size={12} color={selected ? STUDIO_BG : CHIP_TEXT} /> : null}
        <Animated.Text style={[styles.chipText, fg]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {chip.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function StudioButton({
  kind,
  label,
  icon,
  status,
  accent,
  onAccent,
  reduceMotion,
  disabled,
  onPress,
}: {
  kind: 'primary' | 'glass';
  /** The primary shows it; the glass square uses it as its accessibility label. */
  label: string;
  icon: SetupIcon;
  status: 'busy' | 'done' | null;
  accent: string;
  onAccent: string;
  reduceMotion: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const pressed = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() =>
    reduceMotion ? { opacity: 1 - pressed.value * 0.15 } : { transform: [{ scale: 1 - pressed.value * 0.03 }] },
  );
  const primary = kind === 'primary';
  const fg = primary ? onAccent : '#FFFFFF';
  const busy = status === 'busy';

  let glyph: React.ReactNode;
  if (busy) glyph = <ActivityIndicator size="small" color={fg} />;
  else if (status === 'done') glyph = <SetupSymbol {...CHECK_ICON} size={primary ? 18 : 20} color={fg} />;
  else glyph = <SetupSymbol {...icon} size={primary ? 18 : 20} color={fg} />;

  return (
    <AnimatedPressable
      onPress={() => {
        lightHaptic();
        onPress();
      }}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: 90 });
      }}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={[
        primary
          ? [styles.primary, { backgroundColor: accent, boxShadow: `0px 8px 24px ${withAlpha(accent, '40')}` }]
          : styles.glass,
        pressStyle,
      ]}
    >
      {primary ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.7 }}
          style={[StyleSheet.absoluteFill, styles.primarySheen]}
        />
      ) : null}
      <Animated.View key={status ?? icon.sf} entering={FADE_IN} style={styles.glyph}>
        {glyph}
      </Animated.View>
      {primary ? (
        <Animated.Text
          key={label}
          entering={FADE_IN}
          style={[styles.primaryLabel, { color: fg }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          maxFontSizeMultiplier={1.3}
        >
          {label}
        </Animated.Text>
      ) : null}
    </AnimatedPressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: STUDIO_BG,
  },
  fill: {
    flex: 1,
  },
  ambientTint: {
    opacity: AMBIENT_OPACITY,
  },
  ambientLayer: {
    transform: [{ scale: AMBIENT_SCALE }],
  },
  ambientShade: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  topBar: {
    height: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    marginHorizontal: 12,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  circlePressed: {
    opacity: 0.7,
  },
  circleSpacer: {
    width: 36,
    height: 36,
  },
  pill: {
    marginTop: 6,
    marginBottom: 4,
  },
  previewWrap: {
    flex: 1,
    marginTop: 8,
  },
  bannerSlot: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  banner: {
    alignSelf: 'stretch',
    borderRadius: 14,
    backgroundColor: 'rgba(28,29,33,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    boxShadow: '0px 10px 30px rgba(0,0,0,0.45)',
  },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bannerText: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  captionSlot: {
    height: 16,
    marginTop: 8,
    marginHorizontal: 16,
  },
  captionRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  caption: {
    flexShrink: 1,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  captionAction: {
    fontSize: 11,
    fontWeight: '800',
  },
  scrubber: {
    height: 32,
    marginTop: 10,
    flexGrow: 0,
  },
  scrubberContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabs: {
    marginTop: 12,
    marginHorizontal: 16,
  },
  tray: {
    marginTop: 12,
  },
  ctaBar: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primary: {
    flex: 1,
    height: CTA_H,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  primarySheen: {
    borderRadius: 18,
  },
  primaryLabel: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  glass: {
    width: CTA_H,
    height: CTA_H,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  glyph: {
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subCaption: {
    marginTop: 4,
    height: SUB_CAPTION_H - 4,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
  },
  exportHost: {
    position: 'absolute',
    top: 0,
  },
});

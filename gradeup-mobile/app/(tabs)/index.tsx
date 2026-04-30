import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  Alert,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { FlatList, RefreshControl } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { ThemeIcon } from '@/components/ThemeIcon';
import { formatDisplayDate, getTodayISO, isTaskPastDueNow } from '@/src/utils/date';
import { useTranslations } from '@/src/i18n';
import { getNotificationPrefs } from '@/src/storage';
import { getDaysUntilTaskDue, selectTodaysFocusTask } from '@/src/lib/taskUtils';
import {
  peakWeekFromTaskCounts,
  resolveDisplayTeachingWeeks,
  taskCountsByOpenDueWeek,
  teachingWeekNumberForDate,
} from '@/src/lib/academicWeek';
import { useDarkMinimalThemePack, useTheme, useThemeId, useThemePack } from '@/hooks/useTheme';
import { themePrefersLightOutline, type ThemeId, type ThemePalette } from '@/constants/Themes';
import { Avatar } from '@/components/Avatar';
import { useFocusEffect } from '@react-navigation/native';
import { CatLottie } from '@/components/CatLottie';
import { SpiderLottie } from '@/components/SpiderLottie';
import { SpiderHeaderWebOverlay } from '@/components/SpiderHeaderWebOverlay';
import { PurpleAuroraOverlay } from '@/components/PurpleAuroraOverlay';
const DASHBOARD_LIST = [{ key: 'home' as const }];

/** Home header: darker base + stronger waves (only these themes; blush/emerald unchanged). */
const HEADER_VISUAL_BOOST_IDS: ReadonlySet<ThemeId> = new Set(['light', 'dark', 'midnight']);

/**
 * Home header navy — same base as profile hero in light mode (`#003366`).
 * Flat gradient stops so hue matches the profile card; wave + overlay do the variation (like profile).
 */
const PROFILE_HERO_NAVY = '#003366';

const LIGHT_HOME_HEADER = {
  accent2: PROFILE_HERO_NAVY,
  primary: PROFILE_HERO_NAVY,
  secondary: PROFILE_HERO_NAVY,
  sheenAccent: '#06b6d4',
} as const;

/** Dark theme: same navy as profile reference (not cyan-teal) so header matches the deep blue look. */
const DARK_HEADER_DEEP = {
  accent2: PROFILE_HERO_NAVY,
  primary: PROFILE_HERO_NAVY,
  secondary: PROFILE_HERO_NAVY,
  sheenAccent: '#38bdf8',
} as const;

/** Darker antique gold header (midnight / black & gold) */
const MIDNIGHT_HEADER_DEEP = {
  accent2: '#4a3a0c',
  primary: '#7a6218',
  secondary: '#8f7318',
  sheenAccent: '#d4af37',
} as const;

const WEEKDAY_TO_NUM: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const GOLD = '#f59e0b';
const OVERDUE_COLOR = '#dc2626';

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDaysLeft(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T23:59:59');
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

function getDueTimeLabelRaw(
  dueDate: string,
  dueTime?: string,
): { key: 'overdue' | 'dueToday' | 'tomorrow' | 'daysLeft'; days: number } {
  const days = getDaysLeft(dueDate);
  const pastByDeadline =
    dueTime !== undefined && isTaskPastDueNow({ dueDate, dueTime: dueTime || '23:59' });
  if (days < 0 || pastByDeadline) return { key: 'overdue', days };
  if (days === 0) return { key: 'dueToday', days };
  if (days === 1) return { key: 'tomorrow', days };
  return { key: 'daysLeft', days };
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
  const int = parseInt(clean, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Stable 1–3 for mono “glyph” markers on upcoming rows (no subject hues). */
function monoInnerDotCountForSubject(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return (h % 3) + 1;
}

/** Vertical dot stack opacities for mono upcoming accent (replaces solid color bar). */
function monoUpcomingAccentDotOpacities(
  isStudy: boolean,
  days: number,
  taskPast: boolean,
): number[] {
  const n = 6;
  const base = isStudy
    ? 0.36
    : days < 0 || taskPast
      ? 0.92
      : days === 0
        ? 0.82
        : days <= 3
          ? 0.58
          : 0.38;
  return Array.from({ length: n }, (_, i) => base * (0.72 + 0.28 * (i / Math.max(n - 1, 1))));
}

type FocusStudyItem = {
  studyKey: string;
  date: string;
  time: string;
  code: string;
  room: string;
  type: 'STUDY';
  name: string;
};

function createDashboardStyles(
  theme: ThemePalette,
  isDarkMinimal: boolean,
  isSpiderTheme: boolean,
  isPurpleTheme: boolean,
) {
  const primary = theme.primary;
  const bg = theme.background;
  const card = theme.card;
  const border = theme.border;
  const text = theme.text;
  const textSecondary = theme.textSecondary;
  const bgSecondary = theme.backgroundSecondary;
  const chipTint = `${primary}33`;
  const chipBorder = `${primary}44`;
  const metaPillOutline = themePrefersLightOutline(theme) ? 'rgba(255,255,255,0.82)' : border;
  const taskCardOutline = themePrefersLightOutline(theme) ? 'rgba(255,255,255,0.38)' : border;
  const monoAccent = '#9ca3af';
  const pulseCurrentColor = isSpiderTheme ? primary : isDarkMinimal ? monoAccent : GOLD;

  return StyleSheet.create({
    container: { flex: 1 },
    content: { paddingTop: 0, paddingBottom: 100 },
    headerWrap: {
      paddingHorizontal: 16,
      paddingTop: 56,
      paddingBottom: 55,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 4,
      overflow: 'hidden',
    },
    /** Wraps week pulse card; spider is absolutely positioned so it doesn’t stretch the header. */
    peakAlertSection: {
      marginTop: 22,
      width: '100%',
      position: 'relative',
      zIndex: 1,
    },
    peakAlertBox: {
      backgroundColor: card,
      borderRadius: 18,
      paddingHorizontal: 20,
      paddingVertical: 20,
      zIndex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: border,
    },
    peakAlertSpiderWebClip: {
      borderRadius: 18,
      overflow: 'hidden',
    },
    peakAlertSpiderWebImage: {
      position: 'absolute',
      right: -80,
      top: -50,
      width: 292,
      height: 204,
      opacity: 0.52,
      tintColor: '#7f1d1d',
    },
    peakAlertPurpleBgImage: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: 350,
      height: 540,
      opacity: 0.9,
      transform: [{ translateX: -160 }, { translateY: -290 }, { rotate: '90deg' }],
    },
    peakAlertPurpleBgTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(33, 14, 90, 0.42)',
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
      color: text,
      letterSpacing: -0.3,
    },
    peakAlertLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: textSecondary,
      letterSpacing: 1.2,
      marginTop: 4,
    },
    peakAlertSubline: {
      fontSize: 11,
      fontWeight: '600',
      color: textSecondary,
      marginTop: 4,
      maxWidth: 220,
      lineHeight: 15,
    },
    peakAlertBadge: {
      backgroundColor: bgSecondary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
    },
    peakAlertBadgeMuted: {
      backgroundColor: bgSecondary,
      opacity: 0.85,
    },
    peakAlertBadgeText: {
      fontSize: 12,
      fontWeight: '800',
      color: text,
      letterSpacing: 0.4,
    },
    peakAlertBadgeTextMuted: {
      fontSize: 10,
      color: textSecondary,
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
      color: textSecondary,
      letterSpacing: 1.2,
    },
    peakAlertFinalLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: textSecondary,
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
      backgroundColor: border,
    },
    peakAlertDotCurrent: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: pulseCurrentColor,
    },
    peakAlertDotPast: {
      backgroundColor: textSecondary,
    },
    peakAlertDotPeak: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2.5,
      borderColor: '#ef4444',
      backgroundColor: 'transparent',
    },
    peakAlertDotPeakMono: {
      borderColor: '#9ca3af',
    },
    peakAlertDotPeakSpider: {
      borderColor: primary,
    },
    peakAlertDotCurrentSpider: {
      backgroundColor: `${primary}55`,
    },
    peakAlertDotCurrentPeak: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: pulseCurrentColor,
      borderWidth: 2.5,
      borderColor: '#ef4444',
    },
    peakAlertDotCurrentPeakMono: {
      borderColor: '#9ca3af',
    },
    peakAlertDotCurrentPeakSpider: {
      borderColor: primary,
      backgroundColor: `${primary}50`,
    },
    headerGradient: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerSheen: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerWave: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    monoHeaderPattern: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      overflow: 'hidden',
    },
    monoHeaderSolid: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      backgroundColor: '#2a2a2a',
      opacity: 0.94,
    },
    monoGlitchBand: {
      position: 'absolute',
      left: -20,
      right: -20,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    monoGlitchBandA: {
      top: 8,
      height: 24,
      transform: [{ rotate: '-4deg' }],
    },
    monoGlitchBandB: {
      top: 34,
      height: 18,
      transform: [{ rotate: '3deg' }],
    },
    monoGlitchBandC: {
      top: 64,
      height: 20,
      transform: [{ rotate: '-3deg' }],
    },
    monoGlitchBandD: {
      top: 96,
      height: 16,
      transform: [{ rotate: '4deg' }],
    },
    monoGlitchBandE: {
      bottom: 54,
      height: 20,
      transform: [{ rotate: '-2deg' }],
    },
    monoGlitchBandF: {
      bottom: 26,
      height: 18,
      transform: [{ rotate: '3deg' }],
    },
    monoGlitchBandG: {
      bottom: -4,
      height: 24,
      transform: [{ rotate: '-4deg' }],
    },
    monoGlitchBlock: {
      position: 'absolute',
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderRadius: 4,
    },
    monoGlitchBlockA: {
      top: 18,
      left: 52,
      width: 22,
      height: 6,
    },
    monoGlitchBlockB: {
      top: 58,
      right: 68,
      width: 18,
      height: 5,
    },
    monoGlitchBlockC: {
      bottom: 40,
      left: 120,
      width: 26,
      height: 6,
    },
    monoGlitchBlockD: {
      bottom: 14,
      right: 110,
      width: 20,
      height: 5,
    },
    catHeaderPattern: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      overflow: 'hidden',
    },
    catHeaderBubble: {
      position: 'absolute',
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.3)',
    },
    catHeaderBubbleA: { width: 210, height: 210, top: -80, left: -30 },
    catHeaderBubbleB: { width: 150, height: 150, top: 24, right: -24 },
    catHeaderBubbleC: { width: 180, height: 180, bottom: -92, left: 118 },
    catHeaderPaw: {
      position: 'absolute',
      color: 'rgba(255,255,255,0.6)',
      fontSize: 15,
    },
    catHeaderPawA: { top: 18, right: 86 },
    catHeaderPawB: { top: 62, left: 50 },
    catHeaderPawC: { bottom: 24, right: 42 },
    headerTextureOverlay: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 },
    headerLeftProfile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0,
      marginRight: 8,
      paddingVertical: 2,
    },
    /** Pull-refresh spinner — pinned to top of screen. */
    homeRefreshOverlayTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingTop: 52,
      zIndex: 20,
    },
    refreshRingOuter: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    refreshRingInner: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2.5,
      borderTopColor: 'transparent',
      borderRightColor: 'transparent',
    },
    greeting: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, flexShrink: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    subtitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    headerIconBtn: { padding: 4 },
    notifBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#ef4444', minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    notifBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800' },

    pressed: { opacity: 0.96 },

    sectionWrapper: { marginHorizontal: 20, marginBottom: 32 },
    sectionWrapperFirst: { marginTop: 24 },
    sectionHeader: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: isPurpleTheme ? text : primary },
    sectionSubcopy: {
      fontSize: 13,
      lineHeight: 19,
      color: isPurpleTheme ? text : textSecondary,
      marginBottom: 16,
      maxWidth: '92%',
    },

    focusCard: {
      borderRadius: 26,
      paddingHorizontal: 18,
      paddingVertical: 16,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: taskCardOutline,
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.045,
      shadowRadius: 16,
      elevation: 3,
    },
    focusCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    focusPillsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    focusCoursePill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    focusCoursePillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
    focusStatusPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    focusStatusPillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
    focusArrowButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: bgSecondary,
      borderWidth: 1,
      borderColor: taskCardOutline,
    },
    focusTitle: {
      fontSize: 18,
      fontWeight: '800',
      lineHeight: 23,
      color: text,
      letterSpacing: -0.4,
    },
    focusSupportText: {
      fontSize: 13,
      fontWeight: '600',
      color: textSecondary,
      marginTop: 6,
    },
    focusMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 14,
    },
    focusMetaLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      flex: 1,
      minWidth: 0,
    },
    focusMetaAvatarWrap: { flexShrink: 0, marginLeft: 4 },
    focusMetaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: bgSecondary,
      borderWidth: 1,
      borderColor: metaPillOutline,
    },
    focusMetaText: { fontSize: 13, fontWeight: '700', color: textSecondary },
    focusEmptyWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 156,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: taskCardOutline,
      borderRadius: 28,
      paddingHorizontal: 24,
    },
    focusEmptyIcon: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chipTint,
      marginBottom: 16,
    },
    focusEmpty: { fontSize: 18, fontWeight: '700', color: text, marginBottom: 6 },
    focusEmptySub: { fontSize: 14, fontWeight: '500', color: primary },

    timelineHeader: { marginBottom: 16 },
    timelineHeaderBody: { flex: 1, minWidth: 0 },
    upcomingPanel: {
      backgroundColor: bgSecondary,
      borderRadius: 26,
      padding: 16,
      borderWidth: 1,
      borderColor: taskCardOutline,
    },
    upcomingLeadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 14,
    },
    upcomingLeadBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: chipTint,
      borderWidth: 1,
      borderColor: chipBorder,
    },
    upcomingLeadBadgeText: { fontSize: 12, fontWeight: '800', color: primary, letterSpacing: 0.3 },
    upcomingSeeAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: taskCardOutline,
    },
    upcomingSeeAllText: { fontSize: 13, fontWeight: '700', color: primary },
    upcomingEmptyCard: {
      alignItems: 'center',
      paddingVertical: 24,
      paddingHorizontal: 18,
      borderRadius: 20,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: taskCardOutline,
    },
    upcomingEmptyIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chipTint,
      marginBottom: 14,
    },
    upcomingEmptyTitle: { fontSize: 16, fontWeight: '700', color: text, textAlign: 'center' },
    upcomingEmptySub: { fontSize: 13, lineHeight: 19, color: textSecondary, textAlign: 'center', marginTop: 8 },
    upcomingEmptyButton: {
      marginTop: 18,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: primary,
    },
    upcomingEmptyButtonText: { color: theme.textInverse, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
    upcomingDateRow: { marginBottom: 10 },
    upcomingDateChip: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: chipTint,
      borderWidth: 1,
      borderColor: chipBorder,
    },
    upcomingDateChipText: { fontSize: 12, fontWeight: '800', color: primary, letterSpacing: 0.3 },
    upcomingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderRadius: 22,
      paddingVertical: 16,
      paddingHorizontal: 16,
      backgroundColor: card,
      borderWidth: 1,
      borderColor: taskCardOutline,
      marginBottom: 12,
    },
    upcomingAccent: {
      width: 6,
      alignSelf: 'stretch',
      borderRadius: 999,
    },
    upcomingAccentDotsColumn: {
      width: 10,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      paddingVertical: 4,
      gap: 5,
    },
    upcomingAccentDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: text,
    },
    upcomingMonoMetaRing: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    upcomingMonoMetaInnerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    upcomingMonoMetaInnerDot: {
      width: 2.5,
      height: 2.5,
      borderRadius: 1.25,
      backgroundColor: text,
    },
    upcomingCardBody: { flex: 1, minWidth: 0 },
    upcomingCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    upcomingTimeWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    upcomingTime: { fontSize: 13, fontWeight: '700', color: textSecondary },
    upcomingTitle: {
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 22,
      color: text,
      letterSpacing: -0.3,
    },
    upcomingTitleDone: { color: textSecondary, textDecorationLine: 'line-through' },
    upcomingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
    upcomingSubjectDot: { width: 8, height: 8, borderRadius: 4 },
    upcomingMetaText: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: textSecondary },
    upcomingMetaDivider: { fontSize: 13, color: textSecondary, fontWeight: '700' },
    upcomingMoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingTop: 8,
      paddingBottom: 2,
    },
    upcomingMoreText: { fontSize: 13, fontWeight: '700', color: primary },

    studyingWidget: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 20,
      marginBottom: 20,
      marginTop: -10,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: chipTint,
      borderWidth: 1,
      borderColor: taskCardOutline,
    },
  });
}

export default function Dashboard() {
  const {
    dataReady,
    user,
    tasks,
    courses,
    academicCalendar,
    revisionSettingsList,
    completedStudyKeys,
    pinnedTaskIds,
    getSubjectColor,
    language,
    pendingClassroomTasks,
    clearPendingClassroomTasks,
    refreshRemoteData,
  } = useApp();
  const {
    friendsWithStatus,
    communityBadgeCount,
    acceptedSharedTasks,
    userId: communityUserId,
    refreshAll: refreshCommunityAll,
  } = useCommunity();
  const theme = useTheme();
  const themeId = useThemeId();
  const themePack = useThemePack();
  const isCatTheme = themePack === 'cat';
  const isMonoTheme = themePack === 'mono';
  const isSpiderTheme = themePack === 'spider';
  const isPurpleTheme = themePack === 'purple';
  const isDarkMinimal = useDarkMinimalThemePack();
  const styles = useMemo(
    () => createDashboardStyles(theme, isDarkMinimal, isSpiderTheme, isPurpleTheme),
    [theme, isDarkMinimal, isSpiderTheme, isPurpleTheme],
  );

  const headerVisualBoost = HEADER_VISUAL_BOOST_IDS.has(themeId);

  let headerPrimary: string;
  let headerAccent2: string;
  let headerSecondary: string;
  let headerSheenAccent: string;

  if (isCatTheme) {
    headerAccent2 = '#f8d49f';
    headerPrimary = '#f6c47f';
    headerSecondary = '#f7ddb8';
    headerSheenAccent = '#fff2de';
  } else if (isSpiderTheme) {
    headerAccent2 = '#140506';
    headerPrimary = '#7f1d1d';
    headerSecondary = '#b91c1c';
    headerSheenAccent = '#dc2626';
  } else if (isMonoTheme) {
    headerAccent2 = '#161616';
    headerPrimary = '#1f1f1f';
    headerSecondary = '#2a2a2a';
    headerSheenAccent = '#6b7280';
  } else if (isPurpleTheme) {
    headerAccent2 = '#f0e9ff';
    headerPrimary = '#e4d8ff';
    headerSecondary = '#d4c2ff';
    headerSheenAccent = '#ffffff';
  } else if (themeId === 'light') {
    headerAccent2 = LIGHT_HOME_HEADER.accent2;
    headerPrimary = LIGHT_HOME_HEADER.primary;
    headerSecondary = LIGHT_HOME_HEADER.secondary;
    headerSheenAccent = LIGHT_HOME_HEADER.sheenAccent;
  } else if (themeId === 'dark') {
    const base = headerVisualBoost ? DARK_HEADER_DEEP : { accent2: theme.accent2, primary: theme.primary, secondary: theme.secondary, sheenAccent: theme.accent };
    headerAccent2 = base.accent2;
    headerPrimary = base.primary;
    headerSecondary = base.secondary;
    headerSheenAccent = base.sheenAccent;
  } else if (themeId === 'midnight') {
    const base = headerVisualBoost ? MIDNIGHT_HEADER_DEEP : { accent2: theme.accent2, primary: theme.primary, secondary: theme.secondary, sheenAccent: theme.accent };
    headerAccent2 = base.accent2;
    headerPrimary = base.primary;
    headerSecondary = base.secondary;
    headerSheenAccent = base.sheenAccent;
  } else {
    headerAccent2 = theme.accent2;
    headerPrimary = theme.primary;
    headerSecondary = theme.secondary;
    headerSheenAccent = theme.accent;
  }

  /** Match profile hero: wave 0.35 + overlay rgba(0,51,102,0.35) — same recipe as profile. */
  const profileMatchTexture = themeId === 'light' || themeId === 'dark';
  const headerWaveOpacity = isCatTheme ? 0.2 : isDarkMinimal ? 0.16 : profileMatchTexture ? 0.35 : headerVisualBoost ? 0.58 : 0.35;
  const headerTextureOverlayAlpha = isCatTheme ? 0.08 : isDarkMinimal ? 0.14 : profileMatchTexture ? 0.35 : headerVisualBoost ? 0.18 : 0.35;
  const headerSheenAlpha = isCatTheme ? 0.1 : isDarkMinimal ? 0.1 : profileMatchTexture ? 0.08 : headerVisualBoost ? 0.12 : 0.22;

  const headerOnPrimary =
    isCatTheme
      ? '#5b3a22'
      : isSpiderTheme
        ? '#fef2f2'
      : isMonoTheme
        ? '#f5f5f5'
      : isPurpleTheme
        ? '#ffffff'
      :
    themeId === 'light' || themeId === 'midnight'
      ? '#ffffff'
      : themeId === 'dark' && headerVisualBoost
        ? theme.text
        : theme.textInverse;
  const T = useTranslations(language);

  useEffect(() => {
    if (pendingClassroomTasks.length === 0) return;
    const count = pendingClassroomTasks.length;
    const courseNames = [...new Set(pendingClassroomTasks.map(t => t.courseName))].join(', ');
    Alert.alert(
      'New Classroom Tasks',
      `${count} new task${count !== 1 ? 's' : ''} found in Google Classroom:\n\n${courseNames}\n\nWould you like to review and import them?`,
      [
        {
          text: 'Later',
          style: 'cancel',
          onPress: async () => {
            const { getClassroomPrefs, setClassroomPrefs } = require('@/src/storage');
            const prefs = await getClassroomPrefs();
            if (prefs) {
              const dismissed = new Set(prefs.dismissedNewTaskIds ?? []);
              pendingClassroomTasks.forEach((t: { workId: string }) => dismissed.add(t.workId));
              await setClassroomPrefs({ ...prefs, dismissedNewTaskIds: [...dismissed] });
            }
            clearPendingClassroomTasks();
          },
        },
        {
          text: 'Review',
          onPress: () => {
            clearPendingClassroomTasks();
            router.push('/classroom-sync' as any);
          },
        },
      ],
    );
  }, [pendingClassroomTasks.length]);
  const allTasks = useMemo(() => {
    const ownTaskIds = new Set(tasks.map(t => t.id));
    const sharedTasks = (acceptedSharedTasks || [])
      .filter(st => st.recipient_id === communityUserId && st.task && !ownTaskIds.has(st.task_id))
      .map(st => ({
        ...st.task!,
        isDone: st.recipient_completed,
        isSharedTask: true,
        sharedBy: st.owner_profile?.name || 'Friend',
        sharedByAvatar: st.owner_profile?.avatar_url,
      }));
    return [...tasks, ...sharedTasks];
  }, [tasks, acceptedSharedTasks, communityUserId]);

  /** Baseline from calendar (guarded vs HEA over-count) + open tasks, capped a few weeks past baseline. */
  const totalWeeks = useMemo(
    () => resolveDisplayTeachingWeeks(academicCalendar, user.startDate, allTasks),
    [academicCalendar, user.startDate, allTasks],
  );
  const pulseCalendar = useMemo(
    () => (academicCalendar ? { ...academicCalendar, totalWeeks } : null),
    [academicCalendar, totalWeeks],
  );
  /** Same teaching-week index as Planner (HEA / UITM periods + fallbacks); not only profile currentWeek */
  const [todayISO, setTodayISO] = useState(() => getTodayISO());
  useFocusEffect(
    useCallback(() => {
      setTodayISO(getTodayISO());
    }, []),
  );
  const [refreshingHome, setRefreshingHome] = useState(false);
  const [themeLoadingHold, setThemeLoadingHold] = useState(false);
  const themeLoadingStartedAtRef = useRef<number | null>(null);
  const refreshSpin = useRef(new Animated.Value(0)).current;
  const refreshPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isCatTheme && !isDarkMinimal) {
      themeLoadingStartedAtRef.current = null;
      setThemeLoadingHold(false);
      return;
    }
    if (!dataReady) {
      if (themeLoadingStartedAtRef.current == null) {
        themeLoadingStartedAtRef.current = Date.now();
      }
      return;
    }
    const startedAt = themeLoadingStartedAtRef.current;
    if (startedAt == null) return;
    const MIN_THEME_LOADING_MS = isCatTheme ? 6000 : 4200;
    const elapsed = Date.now() - startedAt;
    if (elapsed >= MIN_THEME_LOADING_MS) {
      themeLoadingStartedAtRef.current = null;
      setThemeLoadingHold(false);
      return;
    }
    setThemeLoadingHold(true);
    const timeoutId = setTimeout(() => {
      themeLoadingStartedAtRef.current = null;
      setThemeLoadingHold(false);
    }, MIN_THEME_LOADING_MS - elapsed);
    return () => clearTimeout(timeoutId);
  }, [dataReady, isCatTheme, isDarkMinimal]);
  useEffect(() => {
    if (refreshingHome) {
      const spinLoop = Animated.loop(
        Animated.timing(refreshSpin, {
          toValue: 1,
          duration: 800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(refreshPulse, {
            toValue: 1.18,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(refreshPulse, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      spinLoop.start();
      pulseLoop.start();
      return () => {
        spinLoop.stop();
        pulseLoop.stop();
        refreshSpin.setValue(0);
        refreshPulse.setValue(1);
      };
    }
  }, [refreshingHome]);
  const { height: windowHeight } = useWindowDimensions();
  const onRefreshHome = useCallback(async () => {
    setRefreshingHome(true);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const started = Date.now();
    try {
      setTodayISO(getTodayISO());
      await Promise.all([
        refreshRemoteData(),
        refreshCommunityAll().catch(() => {}),
      ]);
    } catch (e) {
      if (__DEV__) console.warn('[Home] pull refresh failed', e);
    } finally {
      const elapsed = Date.now() - started;
      const minRefreshMs = isCatTheme ? 3200 : isDarkMinimal ? 3200 : 240;
      if (elapsed < minRefreshMs) {
        await new Promise((r) => setTimeout(r, minRefreshMs - elapsed));
      }
      setRefreshingHome(false);
    }
  }, [isCatTheme, isDarkMinimal, refreshRemoteData, refreshCommunityAll]);
  const homeTeachingWeek = useMemo(
    () =>
      teachingWeekNumberForDate(
        todayISO,
        pulseCalendar,
        user.startDate,
        totalWeeks,
        user.currentWeek ?? 1,
      ),
    [todayISO, pulseCalendar, user.startDate, totalWeeks, user.currentWeek],
  );
  const semesterPhase = user.semesterPhase ?? 'teaching';
  const [todaysFocusPref, setTodaysFocusPref] = useState<'all' | 'task' | 'study' | 'exam'>('all');
  useFocusEffect(
    useCallback(() => {
      getNotificationPrefs().then((p) => setTodaysFocusPref(p.todaysFocusPref || 'all'));
    }, [])
  );

  const activeTasksForFocus = useMemo(() => {
    if (todaysFocusPref === 'task') return allTasks.filter(t => ['Assignment', 'Quiz', 'Lab', 'Project'].includes(t.type));
    if (todaysFocusPref === 'exam') return allTasks.filter(t => ['Test'].includes(t.type));
    return allTasks;
  }, [allTasks, todaysFocusPref]);

  const focusTask = useMemo(
    () => selectTodaysFocusTask(activeTasksForFocus, pinnedTaskIds),
    [activeTasksForFocus, pinnedTaskIds]
  );

  const studyingFriends = useMemo(
    () => friendsWithStatus.filter((f) => f.activity?.activity_type === 'studying'),
    [friendsWithStatus]
  );

  const taskWeekCounts = useMemo(
    () => taskCountsByOpenDueWeek(allTasks, pulseCalendar, user.startDate),
    [allTasks, pulseCalendar, user.startDate],
  );
  const { week: taskPeakWeek, max: taskPeakMax } = useMemo(
    () => peakWeekFromTaskCounts(taskWeekCounts),
    [taskWeekCounts],
  );

  const headerSemesterStatus = useMemo(() => {
    if (semesterPhase === 'no_calendar') return T('semesterNotConfigured');
    if (semesterPhase === 'before_start') return T('semesterNotStartedShort');
    if (semesterPhase === 'break_after' || user.isBreak) return T('semesterBreak') || 'Semester Break';
    return `${T('week')} ${homeTeachingWeek}`;
  }, [semesterPhase, user.isBreak, homeTeachingWeek, T]);

  const pulseMainTitle = useMemo(() => {
    if (semesterPhase === 'no_calendar') return T('semesterNotConfigured');
    if (semesterPhase === 'before_start') return T('notInSemester');
    if (semesterPhase === 'break_after' || user.isBreak) return T('semesterBreak') || 'Semester Break';
    return `${T('week')} ${homeTeachingWeek}`;
  }, [semesterPhase, user.isBreak, homeTeachingWeek, T]);

  const pulseBadgeText = useMemo(() => {
    if (semesterPhase === 'teaching' && !user.isBreak) {
      if (taskPeakMax === 0 || taskPeakWeek < 1) return T('tasksPulseNoTasks');
      return `W${taskPeakWeek} PEAK`;
    }
    if (semesterPhase === 'break_after' || user.isBreak) return T('betweenSemestersBadge');
    if (semesterPhase === 'before_start') return T('semesterNotStartedShort');
    return T('semesterNotConfigured');
  }, [semesterPhase, user.isBreak, homeTeachingWeek, taskPeakWeek, taskPeakMax, T]);

  const now = new Date();
  const todayStr = getTodayISO();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);
  const in30Str = toLocalISO(in30Days);

  const deadlineItems = allTasks
    .filter((t) => !t.isDone && t.dueDate >= todayStr && t.dueDate <= in30Str)
    .map((t) => ({
      taskId: t.id,
      date: t.dueDate,
      time: t.dueTime,
      code: t.courseId,
      room: t.type,
      type: 'DEADLINE' as const,
      name: t.title,
      isSharedTask: (t as any).isSharedTask,
      sharedBy: (t as any).sharedBy,
      sharedByAvatar: (t as any).sharedByAvatar,
    }));

  const studyItems: FocusStudyItem[] = [];
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
        const dateStr = toLocalISO(dte);
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
  const previewItems = scheduleWithinMonth.slice(0, 15);
  const hiddenUpcomingCount = Math.max(0, scheduleWithinMonth.length - previewItems.length);

  const nextStudyItem = useMemo(() => {
    const pendingStudyItems = studyItems.filter((item) => !completedStudyKeys.includes(item.studyKey));
    if (pendingStudyItems.length === 0) return null;
    return [...pendingStudyItems].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      return dateCompare !== 0 ? dateCompare : a.time.localeCompare(b.time);
    })[0];
  }, [completedStudyKeys, revisionSettingsList, todayStr, in30Str]);

  const formatSubjectName = useCallback((courseId: string) => {
    if (courseId?.startsWith('gc-course-')) {
      const found = courses.find(c => c.id === courseId);
      return found ? found.name.split(' ')[0] : courseId.replace('gc-course-', '');
    }
    return courseId;
  }, [courses]);

  const focusCard = useMemo(() => {
    let chosen: 'task' | 'study' | null = null;

    if (todaysFocusPref === 'task' || todaysFocusPref === 'exam') {
      chosen = focusTask ? 'task' : null;
    } else if (todaysFocusPref === 'study') {
      chosen = nextStudyItem ? 'study' : null;
    } else {
      // 'all' mode: pick the one that is sooner
      if (focusTask && nextStudyItem) {
        if (focusTask.task.dueDate < nextStudyItem.date) {
          chosen = 'task';
        } else if (nextStudyItem.date < focusTask.task.dueDate) {
          chosen = 'study';
        } else {
          // Same date, compare time
          const tTime = focusTask.task.dueTime || '23:59';
          const sTime = nextStudyItem.time || '23:59';
          chosen = tTime <= sTime ? 'task' : 'study';
        }
      } else if (focusTask) {
        chosen = 'task';
      } else if (nextStudyItem) {
        chosen = 'study';
      }
    }

    if (chosen === 'task' && focusTask) {
      const info = getDueTimeLabelRaw(focusTask.task.dueDate, focusTask.task.dueTime);
      const subjectColor = getSubjectColor(focusTask.task.courseId);
      const days = info.days;
      let statusColor: string;
      if (isDarkMinimal) {
        statusColor = '#9ca3af';
      } else if (info.key === 'overdue' || days === 0) {
        statusColor = '#dc2626';
      } else if (days <= 3) {
        statusColor = '#ca8a04';
      } else {
        statusColor = '#15803d';
      }
      const formattedCourse = formatSubjectName(focusTask.task.courseId);
      return {
        kind: 'task' as const,
        title: focusTask.task.title,
        code: formattedCourse,
        date: focusTask.task.dueDate,
        time: focusTask.task.dueTime,
                        accentColor: isDarkMinimal ? '#9ca3af' : subjectColor,
        statusColor,
        badgeBackground: theme.card,
        label:
          info.key === 'daysLeft'
            ? `${info.days} ${T('daysLeft')}`
            : T(info.key),
        subtitle:
          focusTask.reason === 'pinned'
            ? `${T('subject')} • ${formattedCourse}`
            : `${focusTask.task.type} • ${formattedCourse}`,
        isSharedTask: (focusTask.task as any).isSharedTask,
        sharedBy: (focusTask.task as any).sharedBy,
        sharedByAvatar: (focusTask.task as any).sharedByAvatar,
        onPress: () => router.push({ pathname: '/task-details', params: { id: focusTask.task.id } } as any),
      };
    }

    if (chosen === 'study' && nextStudyItem) {
      const info = getDueTimeLabelRaw(nextStudyItem.date);
      const subjectColor = getSubjectColor(nextStudyItem.code);
      return {
        kind: 'study' as const,
        title: nextStudyItem.name,
        code: nextStudyItem.code,
        date: nextStudyItem.date,
        time: nextStudyItem.time,
        accentColor: isDarkMinimal ? '#9ca3af' : subjectColor,
        statusColor: isDarkMinimal ? '#9ca3af' : subjectColor,
        badgeBackground: theme.card,
        label:
          info.key === 'daysLeft'
            ? `${info.days} ${T('daysLeft')}`
            : T(info.key),
        subtitle: nextStudyItem.room,
        onPress: () => router.push({ pathname: '/study-details' as any, params: { studyKey: nextStudyItem.studyKey } }),
      };
    }

    return null;
  }, [focusTask, nextStudyItem, T, getSubjectColor, theme.card, todaysFocusPref, formatSubjectName, isDarkMinimal]);

  const formatDateLabel = (dateStr: string) => formatDisplayDate(dateStr);

  /** iOS tint + Android ring: use on-header contrast (navy-on-navy was invisible). */
  const refreshSpinnerColor = headerOnPrimary;
  const refreshGlassBg = hexToRgba(
    headerOnPrimary.startsWith('#') && headerOnPrimary.length >= 7 ? headerOnPrimary : '#ffffff',
    0.13,
  );

  // ── Solution A: Loading guard ─────────────────────────────────
  // Don't render dashboard content until real data has loaded.
  // This prevents the confusing "Hello, Student" flash with empty data.
  const shouldShowLoading = !dataReady || ((isCatTheme || isDarkMinimal) && themeLoadingHold);
  if (shouldShowLoading) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.background,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        {isCatTheme || isDarkMinimal ? (
          <View style={catStyles.loadingBubble} />
        ) : null}
        {isCatTheme || isDarkMinimal ? (
          isSpiderTheme ? (
            <SpiderLottie variant="loading" style={catStyles.loadingSpiderLottie} />
          ) : (
            <CatLottie
              variant={isCatTheme ? 'loading' : 'monoLoading'}
              style={!isCatTheme && isDarkMinimal ? catStyles.loadingMonoLottie : catStyles.loadingCatLottie}
            />
          )
        ) : (
          <ActivityIndicator size="large" color={theme.primary} />
        )}
        <Text
          style={{
            color: theme.primary,
            fontSize: 18,
            fontWeight: '800',
            marginTop: 18,
            letterSpacing: -0.3,
          }}
        >
          Rencana
        </Text>
        <Text
          style={{
            color: theme.textSecondary,
            fontSize: 12,
            fontWeight: '600',
            marginTop: 6,
          }}
        >
          Loading your data...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {isCatTheme ? (
        <View style={catStyles.bgWrap} pointerEvents="none">
          <View style={[catStyles.bgBubble, catStyles.bgBubbleA]} />
          <View style={[catStyles.bgBubble, catStyles.bgBubbleB]} />
          <View style={[catStyles.bgBubble, catStyles.bgBubbleC]} />
          <Text style={[catStyles.bgPaw, catStyles.bgPawC]}>🐾</Text>
        </View>
      ) : null}
      <FlatList
        data={DASHBOARD_LIST}
        keyExtractor={(row) => row.key}
        style={styles.container}
        contentContainerStyle={[styles.content, { flexGrow: 1, minHeight: windowHeight + 1 }]}
        showsVerticalScrollIndicator={false}
        bounces
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        {...(Platform.OS === 'android'
          ? ({ overScrollMode: 'always' as const, nestedScrollEnabled: true } as const)
          : { alwaysBounceVertical: true })}
        refreshControl={
          <RefreshControl
            refreshing={refreshingHome}
            onRefresh={onRefreshHome}
            tintColor={refreshSpinnerColor}
            colors={[refreshSpinnerColor]}
            progressBackgroundColor={Platform.OS === 'android' ? refreshGlassBg : undefined}
            progressViewOffset={0}
          />
        }
        renderItem={() => (
          <>
      {/* Header: greeting + week + profile + week peak alert (white box) */}
      <View
        style={[
          styles.headerWrap,
          {
            backgroundColor: headerPrimary,
            shadowColor: headerPrimary,
          },
        ]}
      >
        <LinearGradient
          colors={[headerAccent2, headerPrimary, headerSecondary]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFillObject, styles.headerGradient]}
        />
        {isCatTheme ? (
          <View style={[StyleSheet.absoluteFillObject, styles.catHeaderPattern]} pointerEvents="none">
            <View style={[styles.catHeaderBubble, styles.catHeaderBubbleA]} />
            <View style={[styles.catHeaderBubble, styles.catHeaderBubbleB]} />
            <View style={[styles.catHeaderBubble, styles.catHeaderBubbleC]} />
            <Text style={[styles.catHeaderPaw, styles.catHeaderPawC]}>🐾</Text>
          </View>
        ) : isMonoTheme ? (
          <View style={[StyleSheet.absoluteFillObject, styles.monoHeaderSolid]} pointerEvents="none" />
        ) : isSpiderTheme ? (
          <SpiderHeaderWebOverlay />
        ) : isPurpleTheme ? (
          <PurpleAuroraOverlay variant="soft" opacity={1.0} veilColor="rgba(54, 31, 124, 0.74)" />
        ) : (
          <Image
            source={require('../../assets/images/wave-texture.png')}
            style={[StyleSheet.absoluteFillObject, styles.headerWave, { opacity: headerWaveOpacity }]}
            // iPad/TestFlight can stretch this texture too much; repeat keeps it crisp on large ratios.
            resizeMode={Platform.OS === 'ios' ? 'repeat' : 'cover'}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFillObject,
            styles.headerTextureOverlay,
            { backgroundColor: hexToRgba(headerPrimary, headerTextureOverlayAlpha) },
          ]}
        />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            styles.headerSheen,
            { backgroundColor: hexToRgba(headerSheenAccent, headerSheenAlpha) },
          ]}
        />
        <View style={styles.header}>
          <Pressable
            onPress={() => router.push('/profile' as any)}
            style={({ pressed }) => [styles.headerLeftProfile, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`${T('profile')}: ${T('hello')}, ${user.name.split(' ')[0]}`}
          >
            <ThemeIcon name="user" size={22} color={headerOnPrimary} />
            <Text style={[styles.greeting, { color: headerOnPrimary }]} numberOfLines={2}>
              {T('hello')}, {user.name.split(' ')[0]}
            </Text>
          </Pressable>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => router.push('/community/notifications' as any)}
              style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.7 }]}
            >
              <Feather name="bell" size={22} color={headerOnPrimary} />
              {communityBadgeCount > 0 && (
                <View style={[styles.notifBadge, { borderColor: headerPrimary, borderWidth: 1 }]}>
                  <Text style={styles.notifBadgeText}>
                    {communityBadgeCount > 99 ? '99+' : communityBadgeCount}
                  </Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings' as any)}
              style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.7 }]}
            >
              <Feather name="settings" size={22} color={headerOnPrimary} />
            </Pressable>
          </View>
        </View>
        {/* Week peak alert – card + (Spider) decoration in red header under bottom-right corner */}
        <View style={styles.peakAlertSection}>
        <Pressable
          style={({ pressed }) => [styles.peakAlertBox, pressed && styles.pressed]}
          onPress={() => router.push('/stress-map' as any)}
        >
          {isSpiderTheme ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, styles.peakAlertSpiderWebClip]}
            >
              <Image
                source={require('../../assets/spider-card-web.png')}
                style={styles.peakAlertSpiderWebImage}
                resizeMode="contain"
              />
            </View>
          ) : null}
          {isPurpleTheme ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, styles.peakAlertSpiderWebClip]}
            >
              <Image
                source={require('../../assets/purple-weekpulse-gradient.png')}
                style={styles.peakAlertPurpleBgImage}
                resizeMode="cover"
              />
              <View style={styles.peakAlertPurpleBgTint} />
            </View>
          ) : null}
          <View style={styles.peakAlertTop}>
            <View style={styles.peakAlertLeft}>
              <Text style={[styles.peakAlertWeek, isPurpleTheme && { color: '#ffffff' }]}>{pulseMainTitle}</Text>
              {semesterPhase === 'before_start' && user.startDate?.slice(0, 10)?.length === 10 ? (
                <Text style={styles.peakAlertSubline}>
                  {T('starts')} {formatDisplayDate(user.startDate.slice(0, 10))}
                </Text>
              ) : null}
              {semesterPhase === 'no_calendar' ? (
                <Text style={styles.peakAlertSubline}>{T('tapToSetCalendar')}</Text>
              ) : null}
              <Text style={[styles.peakAlertLabel, isPurpleTheme && { color: 'rgba(255,255,255,0.92)' }]}>
                {T('semesterPulse')}
              </Text>
            </View>
            <View
              style={[
                styles.peakAlertBadge,
                semesterPhase !== 'teaching' && styles.peakAlertBadgeMuted,
              ]}
            >
              {isCatTheme ? <CatLottie style={catStyles.peakCatLottie} /> : null}
              <Text
                style={[styles.peakAlertBadgeText, semesterPhase !== 'teaching' && styles.peakAlertBadgeTextMuted]}
                numberOfLines={semesterPhase === 'teaching' ? 1 : 3}
                adjustsFontSizeToFit
              >
                {pulseBadgeText}
              </Text>
            </View>
          </View>
          <View style={styles.peakAlertBottom}>
            <Text style={[styles.peakAlertProgressLabel, isPurpleTheme && { color: 'rgba(255,255,255,0.9)' }]}>
              {T('progress')}
            </Text>
            <Text style={[styles.peakAlertFinalLabel, isPurpleTheme && { color: 'rgba(255,255,255,0.95)' }]}>
              W{totalWeeks} {T('final')}
            </Text>
          </View>
          <View style={styles.peakAlertDots}>
            {Array.from({ length: totalWeeks }, (_, i) => {
              const weekNum = i + 1;
              let dotStyles: object[] = [styles.peakAlertDot];
              if (semesterPhase === 'teaching' && !user.isBreak) {
                const isCurrent = weekNum === homeTeachingWeek;
                const isTaskPeak = taskPeakMax > 0 && taskPeakWeek >= 1 && weekNum === taskPeakWeek;
                if (isCurrent && isTaskPeak) {
                  dotStyles = [styles.peakAlertDotCurrentPeak];
                  if (isMonoTheme) dotStyles.push(styles.peakAlertDotCurrentPeakMono);
                  else if (isSpiderTheme) dotStyles.push(styles.peakAlertDotCurrentPeakSpider);
                } else if (isCurrent) {
                  dotStyles = [styles.peakAlertDotCurrent];
                  if (isSpiderTheme) dotStyles.push(styles.peakAlertDotCurrentSpider);
                } else if (isTaskPeak) {
                  dotStyles = [styles.peakAlertDotPeak];
                  if (isMonoTheme) dotStyles.push(styles.peakAlertDotPeakMono);
                  else if (isSpiderTheme) dotStyles.push(styles.peakAlertDotPeakSpider);
                } else if (weekNum < homeTeachingWeek) {
                  dotStyles.push(styles.peakAlertDotPast);
                }
              } else if (semesterPhase === 'break_after' || user.isBreak) {
                dotStyles.push(styles.peakAlertDotPast);
              }
              return <View key={weekNum} style={dotStyles} />;
            })}
          </View>
        </Pressable>
        {isSpiderTheme ? <SpiderLottie style={catStyles.spiderBelowPeakLottie} /> : null}
        </View>
      </View>

      {/* Today's focus */}
      <View style={[styles.sectionWrapper, styles.sectionWrapperFirst]}>
        <Text style={styles.sectionHeader}>{T('todaysFocus')}</Text>
        <Text style={styles.sectionSubcopy}>
          {focusCard ? 'Your most important next move, ready to open in one tap.' : 'No urgent items right now. Planner and study are in a good place.'}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.focusCard,
            pressed && styles.pressed,
          ]}
          onPress={() => {
            if (focusCard) {
              focusCard.onPress();
            } else {
              router.push('/(tabs)/planner' as any);
            }
          }}
        >
          {focusCard ? (
            <>
              <View style={styles.focusCardHeader}>
                <View style={styles.focusPillsRow}>
                  <View style={[styles.focusCoursePill, { backgroundColor: hexToRgba(focusCard.accentColor, 0.12), borderColor: hexToRgba(focusCard.accentColor, 0.16) }]}>
                    <Text
                      style={[
                        styles.focusCoursePillText,
                        {
                          color:
                            themeId === 'dark' || themeId === 'midnight' ? theme.text : focusCard.accentColor,
                        },
                      ]}
                    >
                      {focusCard.code}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.focusStatusPill,
                      {
                        backgroundColor: focusCard.badgeBackground,
                        borderColor: hexToRgba(focusCard.statusColor, 0.3),
                      },
                    ]}
                  >
                    <Text style={[styles.focusStatusPillText, { color: focusCard.statusColor }]}>
                      {focusCard.label}
                    </Text>
                  </View>
                </View>
                <View style={styles.focusArrowButton}>
                  <Feather name="arrow-up-right" size={17} color={theme.primary} />
                </View>
              </View>
              <Text style={styles.focusTitle} numberOfLines={2}>{focusCard.title}</Text>
              <Text style={styles.focusSupportText} numberOfLines={1}>
                {focusCard.subtitle}
              </Text>
              <View style={styles.focusMetaRow}>
                <View style={styles.focusMetaLeft}>
                  <View style={styles.focusMetaPill}>
                    <Feather name="calendar" size={13} color={theme.textSecondary} />
                    <Text style={styles.focusMetaText}>{formatDisplayDate(focusCard.date)}</Text>
                  </View>
                  <View style={styles.focusMetaPill}>
                    <Feather name="clock" size={13} color={theme.textSecondary} />
                    <Text style={styles.focusMetaText}>{(focusCard.time || '').slice(0, 5)}</Text>
                  </View>
                </View>
                {focusCard.isSharedTask ? (
                  <View style={styles.focusMetaAvatarWrap}>
                    <Avatar name={focusCard.sharedBy} avatarUrl={focusCard.sharedByAvatar} size={22} />
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.focusEmptyWrap}>
              <View style={styles.focusEmptyIcon}>
                <Feather name="sun" size={22} color={theme.primary} />
              </View>
              <Text style={styles.focusEmpty}>{T('noTasksToday')}</Text>
              <Text style={styles.focusEmptySub}>{T('youreAllSet')}</Text>
            </View>
          )}
        </Pressable>
      </View>



      {/* Timeline / Upcoming */}
      <View style={styles.sectionWrapper}>
        <View style={styles.timelineHeader}>
          <View style={styles.timelineHeaderBody}>
            <Text style={styles.sectionHeader}>{T('upcoming')}</Text>
            <Text style={styles.sectionSubcopy}>A tighter view of your next deadlines and study windows.</Text>
          </View>
        </View>
        <View style={styles.upcomingPanel}>
          <View style={styles.upcomingLeadRow}>
            <View style={styles.upcomingLeadBadge}>
              <Text style={styles.upcomingLeadBadgeText}>{scheduleWithinMonth.length} items</Text>
            </View>
            <Pressable style={styles.upcomingSeeAllButton} onPress={() => router.push('/(tabs)/planner' as any)}>
              <Text style={styles.upcomingSeeAllText}>{T('seeAll')}</Text>
              <Feather name="arrow-right" size={14} color={theme.primary} />
            </Pressable>
          </View>
          {previewItems.length === 0 ? (
            <View style={styles.upcomingEmptyCard}>
              <View style={styles.upcomingEmptyIcon}>
                <Feather name="calendar" size={20} color={theme.primary} />
              </View>
              <Text style={styles.upcomingEmptyTitle}>{T('nothingIn30Days')}</Text>
              <Text style={styles.upcomingEmptySub}>New tasks and revision sessions will appear here automatically.</Text>
              <Pressable style={styles.upcomingEmptyButton} onPress={() => router.push('/(tabs)/planner' as any)}>
                <Text style={styles.upcomingEmptyButtonText}>{T('seeAll')}</Text>
              </Pressable>
            </View>
          ) : (
            previewItems.map((item, idx) => {
              const showDateHeader = idx === 0 || previewItems[idx - 1].date !== item.date;
              const isStudy = item.type === 'STUDY';
              const studyDone = isStudy && completedStudyKeys.includes((item as { studyKey?: string }).studyKey ?? '');
              const daysLeft = getDaysLeft(item.date);
              const taskPast =
                !isStudy &&
                isTaskPastDueNow({ dueDate: item.date, dueTime: item.time || '23:59' });
              let accent: string;
              if (isStudy) {
                // Study time: always dark grey accent, independent of urgency
                accent = '#4b5563';
              } else {
                // Tasks: color by how near the deadline is
                if (daysLeft < 0 || taskPast || daysLeft === 0) {
                  accent = '#dc2626'; // red – very near / overdue
                } else if (daysLeft <= 3) {
                  accent = isDarkMinimal ? '#9ca3af' : '#eab308'; // medium near
                } else {
                  accent = isDarkMinimal ? '#9ca3af' : '#22c55e'; // green – far (dark minimal: neutral grey)
                }
              }
              const monoAccentOpacities = isMonoTheme
                ? monoUpcomingAccentDotOpacities(isStudy, daysLeft, Boolean(taskPast))
                : null;
              return (
                <View key={`${item.type}-${item.date}-${item.time}-${idx}`}>
                  {showDateHeader && (
                    <View style={[styles.upcomingDateRow, idx > 0 && { marginTop: 18 }]}>
                      <View style={styles.upcomingDateChip}>
                        <Text style={styles.upcomingDateChipText}>{formatDateLabel(item.date)}</Text>
                      </View>
                    </View>
                  )}
                  <Pressable
                    style={({ pressed }) => [
                      styles.upcomingCard,
                      pressed && styles.pressed,
                    ]}
                    disabled={isStudy}
                    onPress={() => {
                      const taskId = (item as { taskId?: string }).taskId;
                      if (taskId) {
                        router.push({ pathname: '/task-details', params: { id: taskId } } as any);
                      }
                    }}
                  >
                    {isMonoTheme && monoAccentOpacities ? (
                      <View style={styles.upcomingAccentDotsColumn}>
                        {monoAccentOpacities.map((op, dotIdx) => (
                          <View key={dotIdx} style={[styles.upcomingAccentDot, { opacity: op }]} />
                        ))}
                      </View>
                    ) : (
                      <View style={[styles.upcomingAccent, { backgroundColor: accent }]} />
                    )}
                    <View style={styles.upcomingCardBody}>
                      <View style={styles.upcomingCardTop}>
                        <View style={styles.upcomingTimeWrap}>
                          <Feather name="clock" size={12} color={theme.textSecondary} />
                          <Text style={styles.upcomingTime}>{(item.time || '').slice(0, 5)}</Text>
                        </View>
                        {!isStudy ? <Feather name="chevron-right" size={18} color={theme.textSecondary} /> : null}
                      </View>
                      <Text style={[styles.upcomingTitle, studyDone && styles.upcomingTitleDone]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <View style={styles.upcomingMetaRow}>
                        {('isSharedTask' in item && item.isSharedTask) ? (
                          <Avatar name={(item as any).sharedBy} avatarUrl={(item as any).sharedByAvatar} size={18} />
                        ) : null}
                        {isMonoTheme ? (
                          <View style={styles.upcomingMonoMetaRing}>
                            <View style={styles.upcomingMonoMetaInnerRow}>
                              {Array.from({ length: monoInnerDotCountForSubject(item.code) }, (_, k) => (
                                <View key={k} style={styles.upcomingMonoMetaInnerDot} />
                              ))}
                            </View>
                          </View>
                        ) : (
                          <View style={[styles.upcomingSubjectDot, { backgroundColor: accent }]} />
                        )}
                        <Text style={styles.upcomingMetaText} numberOfLines={1}>{formatSubjectName(item.code)}</Text>
                        {!!item.room && (
                          <>
                            <Text style={styles.upcomingMetaDivider}>•</Text>
                            <Text style={styles.upcomingMetaText} numberOfLines={1}>{item.room}</Text>
                          </>
                        )}
                      </View>
                    </View>
                  </Pressable>
                </View>
              );
            })
          )}
          {hiddenUpcomingCount > 0 ? (
            <Pressable style={styles.upcomingMoreRow} onPress={() => router.push('/(tabs)/planner' as any)}>
              <Text style={styles.upcomingMoreText}>+{hiddenUpcomingCount} more items in planner</Text>
              <Feather name="arrow-right" size={15} color={theme.primary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={{ height: 48 }} />
          </>
        )}
      />
      {refreshingHome ? (
        <View style={styles.homeRefreshOverlayTop} pointerEvents="none">
          {isCatTheme || isDarkMinimal ? (
            isSpiderTheme ? (
              <SpiderLottie variant="loading" style={catStyles.refreshSpiderLottie} />
            ) : (
              <CatLottie
                variant={isCatTheme ? 'loading' : 'monoLoading'}
                style={!isCatTheme && isDarkMinimal ? catStyles.refreshMonoLottie : catStyles.refreshCatLottie}
              />
            )
          ) : (
            <Animated.View
              style={[
                styles.refreshRingOuter,
                {
                  backgroundColor: hexToRgba(headerPrimary, 0.15),
                  transform: [{ scale: refreshPulse }],
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.refreshRingInner,
                  {
                    borderBottomColor: headerOnPrimary,
                    borderLeftColor: headerOnPrimary,
                    transform: [{ rotate: refreshSpin.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }) }],
                  },
                ]}
              />
            </Animated.View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const catStyles = StyleSheet.create({
  bgWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  bgBubble: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(244,196,127,0.25)',
  },
  bgBubbleA: { width: 180, height: 180, top: -40, left: -50 },
  bgBubbleB: { width: 130, height: 130, top: 260, right: -36 },
  bgBubbleC: { width: 210, height: 210, bottom: -70, left: 40 },
  bgPaw: {
    position: 'absolute',
    fontSize: 14,
    opacity: 0.32,
  },
  bgPawA: { top: 88, right: 24 },
  bgPawB: { top: 360, left: 26 },
  bgPawC: { bottom: 120, right: 30 },
  loadingBubble: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: 'rgba(198,135,87,0.16)',
  },
  loadingCatLottie: {
    position: 'absolute',
    marginTop: -46,
    width: 92,
    height: 64,
    opacity: 0.95,
  },
  refreshCatLottie: {
    width: 70,
    height: 50,
    opacity: 0.96,
  },
  loadingMonoLottie: {
    position: 'absolute',
    marginTop: -60,
    width: 132,
    height: 92,
    opacity: 0.98,
  },
  refreshMonoLottie: {
    width: 104,
    height: 72,
    opacity: 0.98,
  },
  loadingSpiderLottie: {
    position: 'absolute',
    marginTop: -60,
    width: 124,
    height: 94,
    opacity: 0.96,
  },
  refreshSpiderLottie: {
    width: 108,
    height: 82,
    opacity: 0.96,
  },
  peakCatLottie: {
    position: 'absolute',
    left: -16,
    top: -30,
    width: 58,
    height: 42,
    opacity: 0.98,
    zIndex: 3,
  },
  /** Spider pack: crimson strip under card corner — absolute so header height stays unchanged. */
  spiderBelowPeakLottie: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: -22,
    width: 84,
    height: 64,
    opacity: 0.94,
    zIndex: 2,
  },
});

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Modal,
  Alert,
  useWindowDimensions,
  Animated as RNAnimated,
  Easing,
  PanResponder,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import TimetableMenuSheet from '@/components/TimetableMenuSheet';
import { shareTimetablePdf, type TimetablePdfOrientation } from '@/src/lib/timetablePdf';
import * as WebBrowser from 'expo-web-browser';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useDarkMinimalThemePack, useTheme, useThemePack } from '@/hooks/useTheme';
import {
  ACIDLING_SPRITE_URL,
  NOIR_WEBLING_SPRITE_URL,
  DIO_CAT_SPRITE_URL,
  PlaygroundCodexPet,
  type CodexPetAnimationName,
} from '@/components/PlaygroundCodexPet';
import { useTranslations } from '@/src/i18n';
import { useResponsive } from '@/hooks/useResponsive';
import * as roomsApi from '@/src/lib/campusRoomsApi';
import { getUniversityById } from '@/src/lib/universities';
import { getSlotColorForSubjectCode, getTimetableEntryColor } from '@/src/lib/timetableSlotColors';
import type { TimetableEntry, DayOfWeek } from '@/src/types';
import {
  type WeekStartsOn,
  getTimetableSlotDetailsVisibility,
  setTimetableSlotDetailsVisibility,
  type TimetableSlotDetailsVisibility,
  getHasSeenNonUitmTimetableIntro,
  setHasSeenNonUitmTimetableIntro,
} from '@/src/storage';

const DAY_META: Record<DayOfWeek, { shortKey: string; fullKey: string }> = {
  Monday: { shortKey: 'monday', fullKey: 'mondayFull' },
  Tuesday: { shortKey: 'tuesday', fullKey: 'tuesdayFull' },
  Wednesday: { shortKey: 'wednesday', fullKey: 'wednesdayFull' },
  Thursday: { shortKey: 'thursday', fullKey: 'thursdayFull' },
  Friday: { shortKey: 'friday', fullKey: 'fridayFull' },
  Saturday: { shortKey: 'saturday', fullKey: 'saturdayFull' },
  Sunday: { shortKey: 'sunday', fullKey: 'sundayFull' },
};

const DAYS_MON_FIRST: DayOfWeek[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
const DAYS_SUN_FIRST: DayOfWeek[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

function orderedDays(weekStartsOn: WeekStartsOn) {
  const order = weekStartsOn === 'sunday' ? DAYS_SUN_FIRST : DAYS_MON_FIRST;
  return order.map((key) => ({ key, ...DAY_META[key] }));
}

const HOUR_HEIGHT = 56;
const START_HOUR = 7;
// END_HOUR is exclusive. Use 23 so the 22:00 row is visible.
const END_HOUR = 23;
const TIME_GUTTER = 46;
const DAY_COLUMN_MIN_W = 84;
/** gridRoot paddingHorizontal 6 + 6 */
const GRID_OUTER_H_PAD = 12;
const CAT_PLAYGROUND_SIZE = 120;
const MONO_PLAYGROUND_SIZE = 56;


/** Last PDF orientation, so the export panel opens on the one the student used. */
const PDF_ORIENTATION_KEY = 'timetable_pdf_orientation';

/** Set by the lock screen Studio on its first mount; until then the menu shows a NEW badge. */
const LOCK_STUDIO_SEEN_KEY = 'lock_screen_studio_seen_v1';

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** True if [hour, hour+1) on `day` has no overlapping class. */
function hourRangeFreeForDay(day: DayOfWeek, hour: number, items: TimetableEntry[]): boolean {
  const rangeStart = hour * 60;
  const rangeEnd = (hour + 1) * 60;
  for (const e of items) {
    if (e.day !== day) continue;
    const es = timeToMinutes(e.startTime);
    const ee = timeToMinutes(e.endTime);
    if (es < rangeEnd && ee > rangeStart) return false;
  }
  return true;
}

function entryDisplayTitle(e: TimetableEntry): string {
  const d = e.displayName?.trim();
  return d || e.subjectName;
}

/**
 * Compact cards normally show only the course code. An explicit display name
 * is a user override, so it must remain visible even when "Show course name"
 * is disabled.
 */
function entryPrimaryLabel(e: TimetableEntry, showCourseName: boolean): string {
  const customName = e.displayName?.trim();
  return !showCourseName && customName ? customName : e.subjectCode;
}

/**
 * The course name is worth a line only when it says something the code line
 * doesn't. Some timetables store the code as the subject name (UM: "ISP613"),
 * and printing it again under itself read as a bug.
 */
function titleAddsToLabel(title: string, label: string): boolean {
  const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase();
  const t = norm(title);
  return t.length > 0 && t !== norm(label);
}

function entrySlotColor(e: TimetableEntry, subjectColors: Record<string, string>): string {
  return getTimetableEntryColor(e, subjectColors);
}

function formatRoomDisplay(location: string | undefined | null, onlineLabel: string): string {
  const t = location?.trim();
  if (t && t !== '-') return t;
  return onlineLabel;
}

type WeekGridMetaParts = {
  room: string | null;
  lecturer: string | null;
  group: string | null;
};

/**
 * Room / lecturer / group for week grid (same visibility rules as before).
 */
function weekGridMetaParts(
  entry: TimetableEntry,
  v: TimetableSlotDetailsVisibility,
  slotHeight: number,
  hasCourseTitle: boolean,
  onlineLabel: string,
): WeekGridMetaParts | null {
  const minH = hasCourseTitle ? 48 : 32;
  if (slotHeight < minH) return null;
  const room = v.room ? formatRoomDisplay(entry.location, onlineLabel) : null;
  const lecturer = v.lecturer && entry.lecturer && entry.lecturer !== '-' ? entry.lecturer.trim() : null;
  const group = v.group && entry.group ? String(entry.group).trim() : null;
  if (!room && !lecturer && !group) return null;
  return { room, lecturer, group };
}

/** Joined meta string — kept so older bundles / stale code paths do not throw. Prefer weekGridMetaParts + WeekGridSlotMetaText. */
function weekGridDenseMeta(
  entry: TimetableEntry,
  v: TimetableSlotDetailsVisibility,
  slotHeight: number,
  hasCourseTitle: boolean,
  onlineLabel: string,
): string | null {
  const p = weekGridMetaParts(entry, v, slotHeight, hasCourseTitle, onlineLabel);
  if (!p) return null;
  const segments: string[] = [];
  if (p.room) segments.push(p.room);
  if (p.lecturer) segments.push(p.lecturer);
  if (p.group) segments.push(p.group);
  return segments.length ? segments.join(' · ') : null;
}

/** Separate caps so a multi-line room does not steal the lecturer's line budget. */
function weekGridMetaLineCaps(slotHeight: number): { roomLines: number; lectLines: number } {
  if (slotHeight < 36) return { roomLines: 1, lectLines: 1 };
  if (slotHeight < 52) return { roomLines: 2, lectLines: 2 };
  if (slotHeight < 80) return { roomLines: 3, lectLines: 4 };
  if (slotHeight < 112) return { roomLines: 3, lectLines: 5 };
  return { roomLines: 4, lectLines: 6 };
}

const JS_TO_DAY: DayOfWeek[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export default function TimetableScreen() {
  const { language, timetable, user, weekStartsOn, saveTimetableOnly, subjectColors } = useApp();
  const theme = useTheme();
  const themePack = useThemePack();
  const isCatTheme = themePack === 'cat';
  const isSpiderTheme = themePack === 'spider';
  const isCodexPlaygroundPet = themePack === 'cat' || themePack === 'mono' || themePack === 'spider'; // All premium themes now use the Codex pet system
  const playgroundPetSize = isCodexPlaygroundPet ? MONO_PLAYGROUND_SIZE : CAT_PLAYGROUND_SIZE;
  const isPurpleTheme = themePack === 'purple';
  const purplePageBg = '#f3efff';
  const isDarkMinimal = useDarkMinimalThemePack();
  const { twoPane, masterPaneWidth } = useResponsive();
  const T = useTranslations(language);
  const resolveSlotColor = useCallback(
    (entry: TimetableEntry) => (isDarkMinimal ? '#9ca3af' : entrySlotColor(entry, subjectColors)),
    [isDarkMinimal, subjectColors],
  );

  const { width: winW, height: winH } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<'week' | 'list'>('week');
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfOrientation, setPdfOrientation] = useState<TimetablePdfOrientation>('portrait');
  // null until read, so the NEW badge never flashes for someone who already opened the Studio.
  const [lockStudioSeen, setLockStudioSeen] = useState<boolean | null>(null);
  const [slotDetails, setSlotDetails] = useState<TimetableSlotDetailsVisibility>({
    courseName: false,
    scrollAllDaysInCompact: false,
    room: true,
    lecturer: true,
    group: true,
  });
  /** When true, week grid shows + on free hours and class cards open the editor. */
  const [gridEditMode, setGridEditMode] = useState(false);
  const [showNonUitmIntro, setShowNonUitmIntro] = useState(false);
  const [selectedClass, setSelectedClass] = useState<TimetableEntry | null>(null);
  // Crowdsourced campus-map lookup for the selected class's room.
  const [matchedRoom, setMatchedRoom] = useState<roomsApi.MatchedRoom | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  useEffect(() => {
    getTimetableSlotDetailsVisibility().then(setSlotDetails);
  }, []);

  // The Studio sets the flag on its first mount, so re-check each time the menu
  // opens (the tab stays mounted across that visit); once seen, stop reading.
  // Keyed on the combined flag so the first answer doesn't trigger a second read.
  const checkLockStudioSeen = menuOpen && !lockStudioSeen;
  useEffect(() => {
    if (!checkLockStudioSeen) return;
    let alive = true;
    AsyncStorage.getItem(LOCK_STUDIO_SEEN_KEY)
      .then((value) => {
        if (alive) setLockStudioSeen(value != null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [checkLockStudioSeen]);

  useEffect(() => {
    AsyncStorage.getItem(PDF_ORIENTATION_KEY)
      .then((value) => {
        if (value === 'portrait' || value === 'landscape') setPdfOrientation(value);
      })
      .catch(() => {});
  }, []);

  // Resolve where the selected class is held from the crowdsourced room map.
  useEffect(() => {
    const loc = selectedClass?.location?.trim();
    if (!selectedClass || !user.universityId || !loc || loc === '-') {
      setMatchedRoom(null);
      setMatchLoading(false);
      return;
    }
    let cancelled = false;
    setMatchedRoom(null);
    setMatchLoading(true);
    roomsApi
      .matchRoom(loc)
      .then((m) => {
        if (!cancelled) setMatchedRoom(m);
      })
      .catch(() => {
        if (!cancelled) setMatchedRoom(null);
      })
      .finally(() => {
        if (!cancelled) setMatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClass, user.universityId]);

  useEffect(() => {
    let cancelled = false;
    if (timetable.length > 0 || user.universityId === 'uitm') {
      setShowNonUitmIntro(false);
      return;
    }
    getHasSeenNonUitmTimetableIntro().then((seen) => {
      if (!cancelled && !seen) setShowNonUitmIntro(true);
    });
    return () => {
      cancelled = true;
    };
  }, [timetable.length, user.universityId]);

  const patchSlotDetails = useCallback((patch: Partial<TimetableSlotDetailsVisibility>) => {
    setSlotDetails((prev) => {
      const next = { ...prev, ...patch };
      void setTimetableSlotDetailsVisibility(next);
      return next;
    });
  }, []);

  const daysOrdered = useMemo(() => orderedDays(weekStartsOn), [weekStartsOn]);

  /**
   * Full week when course names on (may scroll).
   * Compact + “scroll all days”: all 7 columns, horizontal scroll.
   * Compact otherwise: first five days of the week (Settings → week starts on…), no horizontal scroll.
   */
  // Columns are sized so five days fit the screen; only "All 7 days" switches
  // to the narrow scrolling columns. Showing course names used to force that
  // too, which pushed Friday off the edge for anyone who just wanted names.
  // A weekend day that actually has a class is kept, off to the right — the
  // grid scrolls sideways to it rather than squeezing every column thinner.
  const daysForWeekGrid = useMemo(() => {
    if (slotDetails.scrollAllDaysInCompact) return daysOrdered;
    return daysOrdered.filter((d, i) => i < 5 || timetable.some((e) => e.day === d.key));
  }, [daysOrdered, slotDetails.scrollAllDaysInCompact, timetable]);

  const dayColumnWidth = useMemo(() => {
    const n = Math.max(1, daysForWeekGrid.length);
    if (slotDetails.scrollAllDaysInCompact) return DAY_COLUMN_MIN_W;
    const innerW = winW - GRID_OUTER_H_PAD - TIME_GUTTER;
    return Math.max(50, Math.floor(innerW / Math.min(5, n)));
  }, [slotDetails.scrollAllDaysInCompact, daysForWeekGrid.length, winW]);

  const todayDayKey = useMemo(() => JS_TO_DAY[new Date().getDay()], []);

  const hasData = timetable.length > 0;
  const linkedButEmpty = !hasData && Boolean(user.universityId || user.lastSync);
  const uniName = user.universityId
    ? getUniversityById(user.universityId)?.shortName ?? user.university
    : null;

  const gridBodyHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
  const gridContentWidth = TIME_GUTTER + daysForWeekGrid.length * dayColumnWidth;
  const gridScrollMaxH = Math.max(280, Math.min(gridBodyHeight + 8, winH - (Platform.OS === 'ios' ? 210 : 190)));


  /**
   * Playground cat hops between subject slots in week view.
   * Coordinates are derived from current grid geometry.
   */
  const playgroundTargets = useMemo(() => {
    if (!isCatTheme && !isCodexPlaygroundPet) return [] as Array<{ x: number; y: number }>;
    const targets: Array<{ x: number; y: number }> = [];
    daysForWeekGrid.forEach(({ key }, dayIdx) => {
      const items = timetable
        .filter((e) => e.day === key)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      items.forEach((entry) => {
        const startMin = timeToMinutes(entry.startTime);
        const endMin = timeToMinutes(entry.endTime);
        const top = ((startMin / 60) - START_HOUR) * HOUR_HEIGHT;
        const slotHeight = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 26);
        const petSize = playgroundPetSize;
        const petHalf = petSize / 2;
        const platformX = TIME_GUTTER + dayIdx * dayColumnWidth + dayColumnWidth / 2 - petHalf;
        // Land on the "top surface" of the card, not inside it.
        const platformY = top - petSize * 0.92;
        targets.push({
          x: Math.max(TIME_GUTTER - 8, platformX),
          y: Math.max(14, platformY),
        });
      });
    });
    return targets;
  }, [isCatTheme, isCodexPlaygroundPet, playgroundPetSize, daysForWeekGrid, timetable, dayColumnWidth]);

  const catX = useRef(new RNAnimated.Value(TIME_GUTTER + 8)).current;
  const catY = useRef(new RNAnimated.Value(64)).current;
  const catHop = useRef(new RNAnimated.Value(0)).current;
  const catScale = useRef(new RNAnimated.Value(1)).current;
  const catXCurrent = useRef(TIME_GUTTER + 8);
  const catYCurrent = useRef(64);
  const catLaneY = useRef(64);
  const catHoldUntilMs = useRef(0);
  const [catDragging, setCatDragging] = useState(false);
  const [codexPetAnim, setCodexPetAnim] = useState<CodexPetAnimationName>('idle');
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const shouldPlaygroundPet =
    (isCatTheme || isCodexPlaygroundPet) && viewMode === 'week' && !gridEditMode && playgroundTargets.length > 0;
  const shouldAutoPlaygroundPet = shouldPlaygroundPet && !catDragging;

  const clamp = useCallback((v: number, min: number, max: number) => Math.max(min, Math.min(max, v)), []);

  useEffect(() => {
    const xId = catX.addListener(({ value }) => {
      catXCurrent.current = value;
    });
    const yId = catY.addListener(({ value }) => {
      catYCurrent.current = value;
    });
    return () => {
      catX.removeListener(xId);
      catY.removeListener(yId);
    };
  }, [catX, catY]);

  const catPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => shouldPlaygroundPet,
        onStartShouldSetPanResponderCapture: () => shouldPlaygroundPet,
        onMoveShouldSetPanResponder: () => shouldPlaygroundPet,
        onMoveShouldSetPanResponderCapture: () => shouldPlaygroundPet,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          setCatDragging(true);
          if (isCodexPlaygroundPet) setCodexPetAnim('idle');
          catHop.setValue(0);
          catScale.setValue(1.04);
          dragStartX.current = catXCurrent.current;
          dragStartY.current = catYCurrent.current;
          catX.stopAnimation();
          catY.stopAnimation();
        },
        onPanResponderMove: (_evt, gestureState) => {
          const maxX = Math.max(TIME_GUTTER + 8, gridContentWidth - playgroundPetSize - 8);
          const maxY = Math.max(16, gridBodyHeight - playgroundPetSize - 6);
          catX.setValue(clamp(dragStartX.current + gestureState.dx, TIME_GUTTER - 8, maxX));
          catY.setValue(clamp(dragStartY.current + gestureState.dy, 14, maxY));
        },
        onPanResponderRelease: () => {
          // Snap drop to the nearest valid subject-top lane with a spring.
          if (playgroundTargets.length > 0) {
            const nearest = playgroundTargets.reduce((best, t) => {
              const d = Math.abs(t.y - catYCurrent.current) + Math.abs(t.x - catXCurrent.current) * 0.2;
              return d < best.d ? { d, t } : best;
            }, { d: Number.POSITIVE_INFINITY, t: playgroundTargets[0] });
            catLaneY.current = nearest.t.y;
            RNAnimated.parallel([
              RNAnimated.spring(catX, { toValue: nearest.t.x, friction: 7, tension: 60, useNativeDriver: true }),
              RNAnimated.spring(catY, { toValue: nearest.t.y, friction: 7, tension: 60, useNativeDriver: true }),
            ]).start();
          } else {
            catLaneY.current = catYCurrent.current;
          }
          catHoldUntilMs.current = Date.now() + 4500;
          setCatDragging(false);
          RNAnimated.spring(catScale, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          if (playgroundTargets.length > 0) {
            const nearest = playgroundTargets.reduce((best, t) => {
              const d = Math.abs(t.y - catYCurrent.current) + Math.abs(t.x - catXCurrent.current) * 0.2;
              return d < best.d ? { d, t } : best;
            }, { d: Number.POSITIVE_INFINITY, t: playgroundTargets[0] });
            catLaneY.current = nearest.t.y;
            RNAnimated.parallel([
              RNAnimated.spring(catX, { toValue: nearest.t.x, friction: 7, tension: 60, useNativeDriver: true }),
              RNAnimated.spring(catY, { toValue: nearest.t.y, friction: 7, tension: 60, useNativeDriver: true }),
            ]).start();
          } else {
            catLaneY.current = catYCurrent.current;
          }
          catHoldUntilMs.current = Date.now() + 4500;
          setCatDragging(false);
          RNAnimated.spring(catScale, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }).start();
        },
      }),
    [
      shouldPlaygroundPet,
      isCodexPlaygroundPet,
      playgroundPetSize,
      catHop,
      catScale,
      catX,
      catY,
      clamp,
      gridContentWidth,
      gridBodyHeight,
      playgroundTargets,
    ],
  );

  useEffect(() => {
    if (!shouldPlaygroundPet || playgroundTargets.length === 0 || catDragging) return;
    const laneHasTargets = playgroundTargets.some((t) => Math.abs(t.y - catLaneY.current) <= 10);
    if (laneHasTargets) return;
    const nearest = playgroundTargets.reduce((best, t) => {
      const d = Math.abs(t.y - catYCurrent.current) + Math.abs(t.x - catXCurrent.current) * 0.2;
      return d < best.d ? { d, t } : best;
    }, { d: Number.POSITIVE_INFINITY, t: playgroundTargets[0] });
    catLaneY.current = nearest.t.y;
    catY.setValue(nearest.t.y);
    catX.setValue(nearest.t.x);
  }, [shouldPlaygroundPet, playgroundTargets, catDragging, catX, catY]);

  useEffect(() => {
    if (!shouldAutoPlaygroundPet) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (cancelled || playgroundTargets.length === 0) return;
      const sameLaneTargets = playgroundTargets.filter((t) => Math.abs(t.y - catLaneY.current) <= 10);
      if (sameLaneTargets.length === 0) {
        const nearest = playgroundTargets.reduce((best, t) => {
          const d = Math.abs(t.y - catYCurrent.current);
          return d < best.d ? { d, t } : best;
        }, { d: Number.POSITIVE_INFINITY, t: playgroundTargets[0] });
        catLaneY.current = nearest.t.y;
        catY.setValue(nearest.t.y);
        timer = setTimeout(run, 2200);
        return;
      }
      const target = sameLaneTargets[Math.floor(Math.random() * sameLaneTargets.length)];
      // Stay on current top-lane and walk horizontally only.
      catY.setValue(catLaneY.current);
      const fromX = catXCurrent.current;
      const goingRight = target.x >= fromX;
      if (isCodexPlaygroundPet) {
        setCodexPetAnim(goingRight ? 'running-right' : 'running-left');
      }
      RNAnimated.timing(catX, {
        toValue: target.x,
        duration: 2200 + Math.random() * 1200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (cancelled || !finished) return;
        if (isCodexPlaygroundPet) setCodexPetAnim('idle');

        // Occasionally hop when idle
        if (Math.random() > 0.5) {
          if (isCodexPlaygroundPet) setCodexPetAnim('jumping');
          RNAnimated.sequence([
            RNAnimated.timing(catHop, { toValue: -16, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            RNAnimated.timing(catHop, { toValue: 0, duration: 210, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]).start(({ finished: f2 }) => {
            if (f2 && isCodexPlaygroundPet) setCodexPetAnim('idle');
          });
        }

        timer = setTimeout(run, 2800 + Math.random() * 2400);
      });
    };
    const waitMs = Math.max(0, catHoldUntilMs.current - Date.now());
    timer = setTimeout(run, waitMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      catX.stopAnimation();
      catY.stopAnimation();
      catHop.stopAnimation();
      catScale.stopAnimation();
    };
  }, [shouldAutoPlaygroundPet, isCodexPlaygroundPet, playgroundTargets, catX, catY, catHop, catScale]);

  useEffect(() => {
    if (!shouldAutoPlaygroundPet || !isCodexPlaygroundPet) return;
    const hop = () => {
      setCodexPetAnim('jumping');
      RNAnimated.sequence([
        RNAnimated.timing(catHop, { toValue: -18, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        RNAnimated.timing(catHop, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setCodexPetAnim('idle');
      });
    };
    const id = setInterval(hop, 9000 + Math.random() * 5000);
    return () => clearInterval(id);
  }, [shouldAutoPlaygroundPet, isCodexPlaygroundPet, catHop]);

  const allDaysGrouped = useMemo(() => {
    return daysOrdered
      .map(({ key }) => ({
        day: key,
        items: timetable
          .filter((e) => e.day === key)
          .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
      }))
      .filter((g) => g.items.length > 0);
  }, [timetable, daysOrdered]);

  /* ── Empty state ──────────────────────────────────── */
  if (!hasData) {
    const dismissNonUitmIntro = async () => {
      await setHasSeenNonUitmTimetableIntro(true);
      setShowNonUitmIntro(false);
    };
    const isUitm = user.universityId === 'uitm' ||
      (user.university || '').toLowerCase().includes('uitm') ||
      (user.university || '').toLowerCase().includes('mara');

    const featureCards = [
      { icon: 'zap' as const, color: '#6366f1', bg: '#eef2ff', label: 'Auto-import', desc: isUitm ? 'Fetch via Student ID' : 'Scan timetable image' },
      { icon: 'clock' as const, color: '#0ea5e9', bg: '#e0f2fe', label: 'Track Schedule', desc: 'Never miss a class' },
      { icon: 'smartphone' as const, color: '#10b981', bg: '#dcfce7', label: 'Home Widget', desc: 'Glance from home screen' },
    ];

    return (
      <View style={[s.container, { backgroundColor: isPurpleTheme ? purplePageBg : theme.background }]}>
        {isPurpleTheme ? (
          <Image
            source={require('../../assets/purple-task-bg-blur.png')}
            style={s.purpleBgImage}
            resizeMode="cover"
          />
        ) : null}
        {isCatTheme ? (
          <View style={s.catBgWrap} pointerEvents="none">
            <View style={[s.catBgBubble, s.catBgBubbleA]} />
            <View style={[s.catBgBubble, s.catBgBubbleB]} />
            <View style={[s.catBgBubble, s.catBgBubbleC]} />
            <Text style={[s.catBgPaw, s.catBgPawA]}>🐾</Text>
            <Text style={[s.catBgPaw, s.catBgPawB]}>🐾</Text>
          </View>
        ) : null}
        {renderHeader(true)}
        {renderTimetableMenu()}
        <Modal
          visible={showNonUitmIntro}
          transparent
          animationType="fade"
          onRequestClose={dismissNonUitmIntro}
        >
          <Pressable style={s.introModalBackdrop} onPress={dismissNonUitmIntro}>
            <Pressable
              style={[s.introModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[s.introModalTitle, { color: theme.text }]}>{T('nonUitmTimetableIntroTitle')}</Text>
              <Text style={[s.introModalBody, { color: theme.textSecondary }]}>{T('nonUitmTimetableIntroBody')}</Text>
              <Text style={[s.introModalPrivacy, { color: theme.textSecondary }]}>
                {T('nonUitmTimetableIntroPrivacyNote')}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  s.introModalPrimary,
                  { backgroundColor: theme.primary },
                  pressed && { opacity: 0.88 },
                ]}
                onPress={async () => {
                  await dismissNonUitmIntro();
                  router.push('/timetable-import' as any);
                }}
              >
                <Feather name="upload-cloud" size={18} color={theme.textInverse} style={{ marginRight: 8 }} />
                <Text style={[s.introModalPrimaryText, { color: theme.textInverse }]}>
                  {T('nonUitmTimetableIntroUpload')}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.introModalSecondary, pressed && { opacity: 0.7 }]}
                onPress={dismissNonUitmIntro}
              >
                <Text style={[s.introModalSecondaryText, { color: theme.primary }]}>
                  {T('nonUitmTimetableIntroLater')}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.emptyScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero ── */}
          <View style={s.emptyHero}>
            <View style={[s.emptyHeroBadge, { backgroundColor: `${theme.primary}15` }]}>
              <View style={[s.emptyHeroIconRing, { borderColor: `${theme.primary}30` }]}>
                <Feather name="calendar" size={36} color={theme.primary} />
              </View>
            </View>
            <Text style={[s.emptyHeroTitle, { color: theme.text }]}>Your Timetable</Text>
            <Text style={[s.emptyHeroSub, { color: theme.textSecondary }]}>
              {isUitm
                ? 'Connect with your Student ID to auto-import all your classes instantly'
                : 'Scan your timetable image and let AI extract every class for you'}
            </Text>
          </View>

          {/* ── Feature Cards ── */}
          <View style={s.emptyFeatureRow}>
            {featureCards.map((f) => (
              <View key={f.label} style={[s.emptyFeatureCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={[s.emptyFeatureIconWrap, { backgroundColor: f.bg }]}>
                  <Feather name={f.icon} size={18} color={f.color} />
                </View>
                <Text style={[s.emptyFeatureLabel, { color: theme.text }]}>{f.label}</Text>
                <Text style={[s.emptyFeatureDesc, { color: theme.textSecondary }]}>{f.desc}</Text>
              </View>
            ))}
          </View>

          {/* ── Primary CTA ── */}
          <Pressable
            style={({ pressed }) => [s.emptyPrimaryBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.88 }]}
            onPress={() => {
              if (isUitm) {
                router.push('/university-connect' as any);
              } else {
                router.push('/timetable-import' as any);
              }
            }}
          >
            <View style={s.emptyPrimaryBtnInner}>
              <Feather name={isUitm ? 'zap' : 'upload-cloud'} size={20} color="#fff" />
              <View style={{ marginLeft: 12 }}>
                <Text style={s.emptyPrimaryBtnTitle}>
                  {linkedButEmpty ? 'Re-sync Timetable' : isUitm ? 'Generate via Student ID' : 'Scan Timetable Image'}
                </Text>
                <Text style={s.emptyPrimaryBtnSub}>
                  {isUitm ? 'Uses public UiTM sources · Fast & free' : 'AI-powered extraction · Takes ~10s'}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" style={{ marginLeft: 'auto' }} />
            </View>
          </Pressable>

          {/* ── Manual entry fallback ── */}
          <Pressable
            style={({ pressed }) => [s.emptySecondaryBtn, { borderColor: theme.border, backgroundColor: theme.card }, pressed && { opacity: 0.75 }]}
            onPress={() => router.push('/timetable-edit' as any)}
          >
            <Feather name="edit-2" size={16} color={theme.textSecondary} style={{ marginRight: 8 }} />
            <Text style={[s.emptySecondaryBtnText, { color: theme.textSecondary }]}>Or add classes manually</Text>
          </Pressable>


        </ScrollView>
      </View>
    );
  }

  /* ── Header ───────────────────────────────────────── */
  function renderHeader(showMenu: boolean) {
    const purpleHeaderText = '#ffffff';
    const purpleHeaderSubText = 'rgba(255,255,255,0.9)';
    const headerMainColor = isPurpleTheme ? purpleHeaderText : theme.text;
    const headerSubColor = isPurpleTheme ? purpleHeaderSubText : theme.textSecondary;
    const headerIconColor = isPurpleTheme ? purpleHeaderText : theme.primary;
    return (
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <View style={s.headerLeft}>
          <View style={[s.headerIconWrap, { backgroundColor: `${theme.primary}10` }]}>
            <Feather name="calendar" size={20} color={headerIconColor} />
          </View>
          <View>
            <Text style={[s.headerTitle, { color: headerMainColor }]}>{(T as any)('timetableHeader') || 'Timetable'}</Text>
            <Text style={[s.headerSub, { color: headerSubColor }]}>
              {uniName ? uniName : (T as any)('timetableSubtitle')}
            </Text>
          </View>
        </View>
        {showMenu && (
          <View style={s.headerActions}>
            <Pressable
              onPress={() => router.push('/campus-map' as any)}
              style={({ pressed }) => [s.headerIconBtn, pressed && { opacity: 0.7 }]}
              hitSlop={10}
              accessibilityLabel={T('campusMapTitle')}
            >
              <Feather name="map-pin" size={20} color={headerIconColor} />
            </Pressable>
            <Pressable
              onPress={() => {
                if (!hasData) {
                  router.push('/timetable-edit' as any);
                  return;
                }
                setGridEditMode((v) => !v);
              }}
              style={({ pressed }) => [
                s.headerIconBtn,
                hasData && gridEditMode && { backgroundColor: `${theme.primary}22` },
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={10}
              accessibilityLabel={
                hasData
                  ? gridEditMode
                    ? T('timetableEditModeDone')
                    : T('timetableEditModeStart')
                  : T('timetableEditClasses')
              }
            >
              <Feather name="edit-2" size={20} color={headerIconColor} />
            </Pressable>
            <Pressable
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [s.headerIconBtn, pressed && { opacity: 0.7 }]}
              hitSlop={10}
              accessibilityLabel="Menu"
            >
              <Feather name="more-vertical" size={22} color={headerMainColor} />
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  async function exportPdf(orientation: TimetablePdfOrientation) {
    if (exportingPdf) return;
    setExportingPdf(true);
    setPdfOrientation(orientation);
    AsyncStorage.setItem(PDF_ORIENTATION_KEY, orientation).catch(() => {});
    try {
      await shareTimetablePdf({
        timetable,
        subjectColors,
        days: daysOrdered.map((d) => d.key),
        title: T('timetablePdfTitle'),
        subtitle: [uniName, new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })]
          .filter(Boolean)
          .join(' · '),
        show: slotDetails,
        onlineLabel: T('timetableRoomOnline'),
        orientation,
      });
      setMenuOpen(false);
    } catch {
      Alert.alert(T('timetableExportPdfError'));
    } finally {
      setExportingPdf(false);
    }
  }

  function confirmResetTimetable() {
    Alert.alert(
      'Reset Timetable',
      'This will remove all your classes and return to the initial setup. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await saveTimetableOnly([]);
            } catch {
              Alert.alert('Could not reset timetable', 'Please try again.');
            }
          },
        },
      ],
    );
  }

  function renderTimetableMenu() {
    // Each place closes the sheet first, so it is gone before the next screen slides in.
    const go = (action: () => void) => () => {
      setMenuOpen(false);
      action();
    };
    return (
      <TimetableMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        theme={theme}
        T={T}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        slotDetails={slotDetails}
        onSlotDetailsChange={patchSlotDetails}
        lockScreenIsNew={lockStudioSeen === false}
        onEditClasses={go(() => router.push('/timetable-edit' as any))}
        onLockScreen={go(() => router.push('/lock-wallpaper' as any))}
        pdfOrientation={pdfOrientation}
        onExportPdf={(orientation) => void exportPdf(orientation)}
        exportingPdf={exportingPdf}
        onReset={go(confirmResetTimetable)}
      />
    );
  }

  function renderClassDetailsModal(forPane = false) {
    if (!selectedClass) return null;
    const color = resolveSlotColor(selectedClass);
    const inSidePane = twoPane && viewMode === 'list';
    // Root-level call while a side pane is active: the pane renders the detail instead.
    if (inSidePane && !forPane) return null;
    const cardInner = (
      <Pressable style={[s.detailsModalCard, inSidePane && s.detailsSidePaneCard, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={(e) => e.stopPropagation()}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color, marginRight: 8 }} />
              <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text }}>{selectedClass.subjectCode}</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 16 }}>{entryDisplayTitle(selectedClass)}</Text>
            
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Feather name="clock" size={16} color={theme.primary} />
                <Text style={{ color: theme.text, fontSize: 15 }}>{(T as any)(DAY_META[selectedClass.day].fullKey)}, {selectedClass.startTime} - {selectedClass.endTime}</Text>
              </View>
              {selectedClass.location && selectedClass.location !== '-' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Feather name="map-pin" size={16} color={theme.primary} />
                  <Text style={{ color: theme.text, fontSize: 15 }}>{selectedClass.location}</Text>
                </View>
              )}

              {/* Crowdsourced campus-map location for this room */}
              {selectedClass.location && selectedClass.location !== '-' && user.universityId ? (
                matchedRoom ? (
                  <>
                    <Pressable
                      onPress={() => {
                        const room = selectedClass.location;
                        setSelectedClass(null);
                        router.push({ pathname: '/campus-map', params: { q: room } } as any);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        backgroundColor: theme.primary + '14',
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                      }}
                    >
                      <Feather name="map" size={16} color={theme.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.primary, fontSize: 14, fontWeight: '700' }}>
                          {[matchedRoom.building, matchedRoom.level].filter(Boolean).join(' · ') || T('campusMapOnMap')}
                        </Text>
                        {matchedRoom.description ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                            {matchedRoom.description}
                          </Text>
                        ) : null}
                      </View>
                      <Feather name="chevron-right" size={18} color={theme.primary} />
                    </Pressable>

                    {matchedRoom.source_file_url ? (
                      <View
                        style={{
                          borderRadius: 12,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: theme.border,
                          overflow: 'hidden',
                          backgroundColor: theme.backgroundSecondary ?? theme.background,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            letterSpacing: 0.4,
                            textTransform: 'uppercase',
                            color: theme.textSecondary,
                            paddingHorizontal: 12,
                            paddingTop: 10,
                            paddingBottom: 6,
                          }}
                        >
                          {T('campusMapReferenceTitle')}
                        </Text>
                        {roomsApi.isCampusRoomPdfRef(matchedRoom) ? (
                          <Pressable
                            onPress={() => {
                              void WebBrowser.openBrowserAsync(matchedRoom.source_file_url!);
                            }}
                            style={({ pressed }) => [
                              {
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 12,
                                paddingHorizontal: 12,
                                paddingVertical: 14,
                              },
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <View
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                backgroundColor: theme.primary + '18',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Feather name="file-text" size={22} color={theme.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
                                {T('campusMapViewPdf')}
                              </Text>
                              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>
                                {T('campusMapReferenceHint')}
                              </Text>
                            </View>
                            <Feather name="external-link" size={16} color={theme.textSecondary} />
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() => {
                              void WebBrowser.openBrowserAsync(matchedRoom.source_file_url!);
                            }}
                            style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                          >
                            <Image
                              source={{ uri: matchedRoom.source_file_url }}
                              style={{ width: '100%', height: 140, backgroundColor: theme.border + '40' }}
                              resizeMode="cover"
                            />
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                paddingVertical: 10,
                              }}
                            >
                              <Feather name="maximize-2" size={14} color={theme.primary} />
                              <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>
                                {T('campusMapViewImage')}
                              </Text>
                            </View>
                          </Pressable>
                        )}
                      </View>
                    ) : null}
                  </>
                ) : matchLoading ? null : (
                  <Pressable
                    onPress={() => {
                      const room = selectedClass.location;
                      setSelectedClass(null);
                      router.push({ pathname: '/campus-map-upload', params: { prefillCode: room } } as any);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}
                  >
                    <Feather name="plus-circle" size={15} color={theme.textSecondary} />
                    <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
                      {T('campusMapAddThisRoom')}
                    </Text>
                  </Pressable>
                )
              ) : null}
              {selectedClass.lecturer && selectedClass.lecturer !== '-' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Feather name="user" size={16} color={theme.primary} />
                  <Text style={{ color: theme.text, fontSize: 15 }}>{selectedClass.lecturer}</Text>
                </View>
              )}
              {selectedClass.group && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Feather name="users" size={16} color={theme.primary} />
                  <Text style={{ color: theme.text, fontSize: 15 }}>Group: {selectedClass.group}</Text>
                </View>
              )}
            </View>

            <Pressable
              style={{ marginTop: 24, alignSelf: 'flex-end', padding: 8 }}
              onPress={() => setSelectedClass(null)}
            >
              <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 16 }}>Close</Text>
            </Pressable>
      </Pressable>
    );
    if (inSidePane) return cardInner;
    return (
      <Modal visible={!!selectedClass} transparent animationType="fade" onRequestClose={() => setSelectedClass(null)}>
        <Pressable style={s.detailsModalOverlay} onPress={() => setSelectedClass(null)}>
          {cardInner}
        </Pressable>
      </Modal>
    );
  }

  /* ── Week grid: one column per day (scroll horizontally if needed) ─ */
  function renderWeekGrid() {
    const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
    const hScrollWeekOrCompactAllDays = slotDetails.scrollAllDaysInCompact || daysForWeekGrid.length > 5;
    const minTableW = hScrollWeekOrCompactAllDays ? Math.max(gridContentWidth, winW) : gridContentWidth;

    return (
      <View style={s.gridRoot}>
        <ScrollView
          horizontal
          scrollEnabled={hScrollWeekOrCompactAllDays}
          showsHorizontalScrollIndicator={hScrollWeekOrCompactAllDays}
          nestedScrollEnabled
          style={s.gridHScroll}
          contentContainerStyle={{ minWidth: minTableW }}
        >
          <View style={{ width: minTableW }}>
            <View style={[s.gridHeaderRow, { borderBottomColor: theme.border }]}>
              <View style={[s.gridCorner, { width: TIME_GUTTER }]} />
              {daysForWeekGrid.map(({ key, shortKey }) => {
                const count = timetable.filter((e) => e.day === key).length;
                return (
                  <View
                    key={key}
                    style={[
                      s.gridColHead,
                      {
                        width: dayColumnWidth,
                        borderLeftColor: theme.border,
                        backgroundColor: theme.backgroundSecondary ?? theme.card,
                      },
                    ]}
                  >
                    <Text style={[s.gridColHeadLabel, { color: theme.primary }]}>{(T as any)(shortKey)}</Text>
                    {count > 0 ? (
                      <View style={[s.gridColCount, { backgroundColor: theme.primary }]}>
                        <Text style={[s.gridColCountText, isDarkMinimal && { color: theme.textInverse }]}>{count}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <ScrollView
              style={{ maxHeight: gridScrollMaxH }}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              bounces={false}
            >
              <View style={[s.gridBodyRow, { minHeight: gridBodyHeight }]}>
                <View style={[s.gridTimeCol, { width: TIME_GUTTER }]}>
                  {hours.map((h) => (
                    <View key={h} style={{ height: HOUR_HEIGHT, paddingTop: 2 }}>
                      <Text style={[s.gridHourText, { color: isPurpleTheme ? '#4f5f86' : theme.textSecondary }]}>
                        {h.toString().padStart(2, '0')}:00
                      </Text>
                    </View>
                  ))}
                </View>

                {daysForWeekGrid.map(({ key }) => {
                  const items = timetable
                    .filter((e) => e.day === key)
                    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
                  return (
                    <View
                      key={key}
                      style={[
                        s.gridDayCol,
                        {
                          width: dayColumnWidth,
                          minHeight: gridBodyHeight,
                          borderLeftColor: theme.border,
                          backgroundColor: 'transparent',
                        },
                      ]}
                    >
                      {hours.map((h) => (
                        <View
                          key={h}
                          style={[
                            s.gridHourLine,
                            {
                              top: (h - START_HOUR) * HOUR_HEIGHT,
                              backgroundColor: theme.border,
                            },
                          ]}
                        />
                      ))}
                      {gridEditMode &&
                        hours.map((h) => {
                          if (!hourRangeFreeForDay(key, h, items)) return null;
                          const startLabel = `${String(h).padStart(2, '0')}:00`;
                          return (
                            <Pressable
                              key={`add-${key}-${h}`}
                              style={[
                                s.gridAddCell,
                                {
                                  top: (h - START_HOUR) * HOUR_HEIGHT,
                                  height: HOUR_HEIGHT,
                                },
                              ]}
                              onPress={() =>
                                router.push({
                                  pathname: '/timetable-edit',
                                  params: { addDay: key, addStart: startLabel },
                                } as any)
                              }
                              hitSlop={4}
                            >
                              <View style={[s.gridAddChip, { backgroundColor: `${theme.primary}12`, borderColor: theme.border }]}>
                                <Feather name="plus" size={15} color={theme.primary} />
                              </View>
                            </Pressable>
                          );
                        })}
                      {items.map((entry) => {
                        const startMin = timeToMinutes(entry.startTime);
                        const endMin = timeToMinutes(entry.endTime);
                        const top = ((startMin / 60) - START_HOUR) * HOUR_HEIGHT;
                        const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 26);
                        const color = resolveSlotColor(entry);
                        const title = entryDisplayTitle(entry);
                        const primaryLabel = entryPrimaryLabel(entry, slotDetails.courseName);
                        const hasTitle = Boolean(
                          slotDetails.courseName && height > 38 && titleAddsToLabel(title, primaryLabel),
                        );
                        const metaParts = weekGridMetaParts(
                          entry,
                          slotDetails,
                          height,
                          hasTitle,
                          T('timetableRoomOnline'),
                        );
                        const stackTight = hasTitle || Boolean(metaParts);
                        const slotBody = (
                          <View
                            style={[
                              s.gridSlotInner,
                              stackTight ? s.gridSlotInnerStacked : s.gridSlotInnerCodeOnly,
                            ]}
                          >
                            <Text
                              style={[
                                s.gridSlotCode,
                                !slotDetails.courseName && s.gridSlotCodeCompact,
                                { color },
                              ]}
                              numberOfLines={2}
                            >
                              {primaryLabel}
                            </Text>
                            {hasTitle ? (
                              <Text
                                style={[s.gridSlotTitle, { color: theme.text }]}
                                numberOfLines={height > 90 ? 4 : 2}
                              >
                                {title}
                              </Text>
                            ) : null}
                            {metaParts ? (
                              <WeekGridSlotMetaText
                                parts={metaParts}
                                theme={theme}
                                slotHeight={height}
                              />
                            ) : null}
                          </View>
                        );
                        const slotStyle = [
                          s.gridSlot,
                          {
                            top,
                            height,
                            backgroundColor: color + '32',
                            borderLeftColor: color,
                            zIndex: 2,
                          },
                        ];
                        return gridEditMode ? (
                          <Pressable
                            key={entry.id}
                            style={slotStyle}
                            onPress={() =>
                              router.push({
                                pathname: '/timetable-edit',
                                params: { entryId: entry.id },
                              } as any)
                            }
                          >
                            {slotBody}
                          </Pressable>
                        ) : (
                          <Pressable key={entry.id} style={slotStyle} onPress={() => setSelectedClass(entry)}>
                            {slotBody}
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
                {shouldPlaygroundPet ? (
                  <RNAnimated.View
                    {...catPanResponder.panHandlers}
                    style={[
                      s.playgroundCatLayer,
                      isCodexPlaygroundPet ? s.playgroundMonoLayer : null,
                      {
                        transform: [
                          { translateX: catX },
                          { translateY: RNAnimated.add(catY, catHop) },
                          { scale: catScale },
                        ],
                      },
                    ]}
                  >
                    <PlaygroundCodexPet
                      spriteUri={isCatTheme ? DIO_CAT_SPRITE_URL : (isSpiderTheme ? NOIR_WEBLING_SPRITE_URL : ACIDLING_SPRITE_URL)}
                      animation={codexPetAnim}
                      size={playgroundPetSize}
                    />
                  </RNAnimated.View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ── List view ────────────────────────────────────── */
  function renderListView() {
    const listScroll = (
      <ScrollView style={s.listScroll} contentContainerStyle={s.listContent}>
        {allDaysGrouped.map(({ day, items }) => {
          const fullKey = DAY_META[day as DayOfWeek].fullKey;
          const isToday = day === todayDayKey;
          return (
            <View
              key={day}
              style={[
                s.listDayBox,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  shadowColor: '#000',
                },
              ]}
            >
              <View
                style={[
                  s.listDayBoxHeader,
                  { backgroundColor: isToday ? `${theme.primary}18` : theme.backgroundSecondary ?? theme.background },
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text style={[s.listDayBoxTitle, { color: theme.primary }]}>{(T as any)(fullKey)}</Text>
                {isToday ? (
                  <View style={[s.listTodayPill, { backgroundColor: theme.primary }]}>
                    <Text style={s.listTodayPillText}>{T('timetableToday')}</Text>
                  </View>
                ) : null}
              </View>
              <View style={s.listDayBoxBody}>
                {items.map((e) => {
                  const color = resolveSlotColor(e);
                  const title = entryDisplayTitle(e);
                  const primaryLabel = entryPrimaryLabel(e, slotDetails.courseName);
                  const cardStyle = [s.listCard, { backgroundColor: theme.background, borderLeftColor: color }];
                  const cardInner = (
                    <>
                      <View style={s.listTimeCol}>
                        <Text style={[s.listTime, { color: theme.primary }]}>{e.startTime}</Text>
                        <Text style={[s.listTimeDash, { color: theme.textSecondary }]}>-</Text>
                        <Text style={[s.listTime, { color: theme.primary }]}>{e.endTime}</Text>
                      </View>
                      <View style={s.listCardBody}>
                        <Text style={[s.listCode, { color }]} numberOfLines={2}>{primaryLabel}</Text>
                        {slotDetails.courseName && titleAddsToLabel(title, primaryLabel) ? (
                          <Text style={[s.listName, { color: theme.text }]} numberOfLines={2}>
                            {title}
                          </Text>
                        ) : null}
                        {slotDetails.room && (
                          <View style={s.listMeta}>
                            <Text style={[s.listMetaLabel, { color: theme.primary }]}>{T('timetableRoom')}:</Text>
                            <Text style={[s.listMetaValue, { color: theme.textSecondary }]}>
                              {formatRoomDisplay(e.location, T('timetableRoomOnline'))}
                            </Text>
                          </View>
                        )}
                        {slotDetails.lecturer && e.lecturer && e.lecturer !== '-' && (
                          <View style={s.listMeta}>
                            <Text style={[s.listMetaLabel, { color: theme.primary }]}>{T('timetableLecturer')}:</Text>
                            <Text style={[s.listMetaValue, { color: theme.textSecondary }]} numberOfLines={2}>{e.lecturer}</Text>
                          </View>
                        )}
                        {slotDetails.group && e.group && (
                          <View style={s.listMeta}>
                            <Text style={[s.listMetaLabel, { color: theme.primary }]}>{T('timetableGroup')}:</Text>
                            <Text style={[s.listMetaValue, { color: theme.textSecondary }]}>{e.group}</Text>
                          </View>
                        )}
                      </View>
                    </>
                  );
                  return gridEditMode ? (
                    <Pressable
                      key={e.id}
                      style={cardStyle}
                      onPress={() =>
                        router.push({
                          pathname: '/timetable-edit',
                          params: { entryId: e.id },
                        } as any)
                      }
                    >
                      {cardInner}
                    </Pressable>
                  ) : (
                    <Pressable key={e.id} style={cardStyle} onPress={() => setSelectedClass(e)}>
                      {cardInner}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );

    if (!twoPane) return listScroll;

    return (
      <View style={s.listTwoPane}>
        <View style={[s.listMasterPane, { width: masterPaneWidth, borderRightColor: theme.border }]}>
          {listScroll}
        </View>
        <View style={s.listDetailPane}>
          {selectedClass ? (
            <ScrollView contentContainerStyle={s.listDetailPaneContent} showsVerticalScrollIndicator={false}>
              {renderClassDetailsModal(true)}
            </ScrollView>
          ) : (
            <View style={s.listDetailEmpty}>
              <Feather name="calendar" size={40} color={theme.textSecondary} />
              <Text style={{ color: theme.textSecondary, marginTop: 12, fontSize: 15, fontWeight: '600' }}>
                {(T as any)('timetableSelectClassDetail') || 'Select a class to see details'}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: isPurpleTheme ? purplePageBg : theme.background }]}>
      {isPurpleTheme ? (
        <Image
          source={require('../../assets/purple-task-bg-blur.png')}
          style={s.purpleBgImage}
          resizeMode="cover"
        />
      ) : null}
      {isCatTheme ? (
        <View style={s.catBgWrap} pointerEvents="none">
          <View style={[s.catBgBubble, s.catBgBubbleA]} />
          <View style={[s.catBgBubble, s.catBgBubbleB]} />
          <View style={[s.catBgBubble, s.catBgBubbleC]} />
          <Text style={[s.catBgPaw, s.catBgPawA]}>🐾</Text>
          <Text style={[s.catBgPaw, s.catBgPawB]}>🐾</Text>
        </View>
      ) : null}
      {renderHeader(true)}
      {renderTimetableMenu()}
      {renderClassDetailsModal()}
      {viewMode === 'week' ? renderWeekGrid() : renderListView()}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  purpleBgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.5,
    zIndex: 0,
  },
  catBgWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  catBgBubble: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(198,135,87,0.11)',
  },
  catBgBubbleA: { width: 160, height: 160, top: 92, left: -34 },
  catBgBubbleB: { width: 120, height: 120, top: 340, right: -22 },
  catBgBubbleC: { width: 190, height: 190, bottom: -64, left: 58 },
  catBgPaw: {
    position: 'absolute',
    fontSize: 14,
    opacity: 0.24,
  },
  catBgPawA: { top: 220, right: 18 },
  catBgPawB: { bottom: 140, left: 22 },
  floatingCat: {
    position: 'absolute',
    right: 12,
    bottom: 114,
    width: 70,
    height: 50,
    opacity: 0.94,
    zIndex: 5,
  },
  playgroundCatLayer: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  playgroundMonoLayer: {
    width: MONO_PLAYGROUND_SIZE,
    height: MONO_PLAYGROUND_SIZE,
    borderRadius: MONO_PLAYGROUND_SIZE / 2,
  },
  playgroundCatAsset: {
    width: 120,
    height: 120,
  },
  playgroundMonoAsset: {
    width: MONO_PLAYGROUND_SIZE,
    height: MONO_PLAYGROUND_SIZE,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 64 : 48,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 1000,
  },
  detailsModalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  headerIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  gridRoot: { flex: 1, paddingHorizontal: 6, paddingBottom: 12 },
  gridHScroll: { flexGrow: 1 },
  gridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  gridCorner: {},
  gridColHead: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  gridColHeadLabel: { fontSize: 12, fontWeight: '800' },
  gridColCount: {
    marginTop: 4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridColCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  gridBodyRow: { flexDirection: 'row' },
  gridTimeCol: { paddingRight: 2 },
  gridHourText: { fontSize: 10, fontWeight: '600' },
  gridDayCol: {
    position: 'relative',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  gridHourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  gridAddCell: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  gridAddChip: {
    minWidth: 28,
    minHeight: 28,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.92,
  },
  gridSlot: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderRadius: 6,
    borderLeftWidth: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  gridSlotInner: { flex: 1, minHeight: 0, width: '100%' },
  gridSlotInnerStacked: { justifyContent: 'flex-start', gap: 1 },
  gridSlotInnerCodeOnly: { justifyContent: 'center' },
  gridSlotCode: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  gridSlotCodeCompact: { fontSize: 12, lineHeight: 14, letterSpacing: 0.35 },
  gridSlotTitle: { fontSize: 8, fontWeight: '600', lineHeight: 12 },
  /** Room on its own row(s); lecturer/group below — independent line limits. */
  gridSlotMetaColumn: { width: '100%', gap: 2 },
  gridSlotMetaRoom: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
  gridSlotMetaLect: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '500',
  },
  gridEmptyCol: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  gridEmptyText: { fontSize: 12 },
  listScroll: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40 },
  listTwoPane: { flex: 1, flexDirection: 'row' },
  listMasterPane: { flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth },
  listDetailPane: { flex: 1, minWidth: 0 },
  listDetailPaneContent: { padding: 20, paddingTop: 24, alignItems: 'stretch' },
  listDetailEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  detailsSidePaneCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  listDayBox: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
    overflow: 'hidden',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  listDayBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listDayBoxTitle: { fontSize: 16, fontWeight: '800', flex: 1 },
  listTodayPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  listTodayPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  listDayBoxBody: { padding: 12, paddingTop: 10 },
  listCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderLeftWidth: 3,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  listTimeCol: { alignItems: 'center', width: 50, paddingTop: 2 },
  listTimeDash: { fontSize: 10 },
  listCardBody: { flex: 1 },
  listCode: { fontSize: 14, fontWeight: '800' },
  listName: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  listTime: { fontSize: 13, fontWeight: '700' },
  listMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  listMetaLabel: { fontSize: 12, fontWeight: '600', fontStyle: 'italic' },
  listMetaValue: { fontSize: 12, flex: 1 },
  introModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  introModalCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  introModalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10, letterSpacing: -0.3 },
  introModalBody: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  introModalPrivacy: { fontSize: 12, lineHeight: 17, marginBottom: 18, opacity: 0.9 },
  introModalPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  introModalPrimaryText: { fontSize: 16, fontWeight: '700' },
  introModalSecondary: { alignItems: 'center', paddingVertical: 10 },
  introModalSecondaryText: { fontSize: 15, fontWeight: '600' },
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 14,
  },
  connectBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // ── New rich empty state styles ──
  emptyScrollContent: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 8 },
  emptyHero: { alignItems: 'center', paddingTop: 24, paddingBottom: 28 },
  emptyHeroBadge: {
    width: 100, height: 100, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyHeroIconRing: {
    width: 80, height: 80, borderRadius: 24, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyHeroTitle: { fontSize: 24, fontWeight: '800', marginBottom: 10, letterSpacing: -0.3 },
  emptyHeroSub: { fontSize: 14, textAlign: 'center', lineHeight: 21, maxWidth: 300 },
  emptyFeatureRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  emptyFeatureCard: {
    flex: 1, borderRadius: 16, padding: 14, borderWidth: 1, alignItems: 'center',
  },
  emptyFeatureIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  emptyFeatureLabel: { fontSize: 12, fontWeight: '700', marginBottom: 3, textAlign: 'center' },
  emptyFeatureDesc: { fontSize: 11, textAlign: 'center', lineHeight: 15 },
  emptyPrimaryBtn: { borderRadius: 18, padding: 18, marginBottom: 12 },
  emptyPrimaryBtnInner: { flexDirection: 'row', alignItems: 'center' },
  emptyPrimaryBtnTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  emptyPrimaryBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  emptySecondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: 14, paddingVertical: 13, marginBottom: 24,
  },
  emptySecondaryBtnText: { fontSize: 14, fontWeight: '600' },
  emptyWidgetCard: { borderRadius: 20, borderWidth: 1.5, padding: 20 },
  emptyWidgetCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  emptyWidgetIconWrap: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  emptyWidgetTitle: { fontSize: 16, fontWeight: '800' },
  emptyWidgetSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  emptyWidgetSteps: { gap: 12, marginBottom: 18 },
  emptyWidgetStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  emptyWidgetStepNum: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
  },
  emptyWidgetStepNumText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  emptyWidgetStepText: { fontSize: 13, lineHeight: 20, flex: 1 },
  emptyWidgetPreview: {
    borderRadius: 14, borderWidth: 1, padding: 14, gap: 10,
  },
  emptyWidgetPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  emptyWidgetPreviewDay: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  emptyWidgetPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyWidgetPreviewTime: { fontSize: 12, fontWeight: '700', width: 40 },
  emptyWidgetPreviewLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  emptyWidgetPreviewRoom: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  emptyWidgetPreviewRoomText: { fontSize: 11, fontWeight: '700' },
  emptyWidgetPreviewFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: 1, paddingTop: 10, marginTop: 2 },
  emptyWidgetPreviewFooterText: { fontSize: 11, color: '#10b981', fontWeight: '600' },
});

function WeekGridSlotMetaText({
  parts,
  theme,
  slotHeight,
  isHorizontal,
}: {
  parts: WeekGridMetaParts;
  theme: { text: string; textSecondary: string };
  slotHeight: number;
  isHorizontal?: boolean;
}) {
  const { room, lecturer, group } = parts;
  const { roomLines, lectLines } = weekGridMetaLineCaps(slotHeight);
  // The horizontal (landscape) layout keeps one joined line; the grid gives the
  // group its own line so a section code like "CDCS2596A" shrinks, never breaks.
  const tail = isHorizontal ? [lecturer, group].filter(Boolean).join(' · ') : lecturer;
  if (!room && !tail && !group) return null;
  return (
    <View style={[s.gridSlotMetaColumn, isHorizontal && { flexDirection: 'row', gap: 8, marginTop: 0 }]}>
      {room ? (
        <Text
          style={[s.gridSlotMetaRoom, { color: theme.text }]}
          numberOfLines={isHorizontal ? 1 : roomLines}
          ellipsizeMode="tail"
        >
          {room}
        </Text>
      ) : null}
      {tail ? (
        <Text
          style={[s.gridSlotMetaLect, { color: theme.textSecondary, flex: isHorizontal ? 1 : undefined }]}
          numberOfLines={isHorizontal ? 1 : lectLines}
          ellipsizeMode="tail"
        >
          {tail}
        </Text>
      ) : null}
      {!isHorizontal && group ? (
        <Text
          style={[s.gridSlotMetaLect, { color: theme.textSecondary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {group}
        </Text>
      ) : null}
    </View>
  );
}

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Modal,
  useWindowDimensions,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { getUniversityById } from '@/src/lib/universities';
import { getSlotColorForSubjectCode } from '@/src/lib/timetableSlotColors';
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
const END_HOUR = 22;
const TIME_GUTTER = 46;
const DAY_COLUMN_MIN_W = 84;
/** gridRoot paddingHorizontal 6 + 6 */
const GRID_OUTER_H_PAD = 12;

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

function entrySlotColor(e: TimetableEntry): string {
  const c = e.slotColor?.trim();
  return c || getSlotColorForSubjectCode(e.subjectCode);
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
  const { language, timetable, user, weekStartsOn } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const { width: winW, height: winH } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<'week' | 'list'>('week');
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpg'>('png');
  const [exportPreset, setExportPreset] = useState<'screen' | 'portrait' | 'landscape'>('portrait');
  const [exporting, setExporting] = useState(false);
  const exportShotRef = useRef<ViewShot | null>(null);
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

  useEffect(() => {
    getTimetableSlotDetailsVisibility().then(setSlotDetails);
  }, []);

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
  const daysForWeekGrid = useMemo(() => {
    if (slotDetails.courseName) return daysOrdered;
    if (slotDetails.scrollAllDaysInCompact) return daysOrdered;
    return daysOrdered.slice(0, 5);
  }, [daysOrdered, slotDetails.courseName, slotDetails.scrollAllDaysInCompact]);

  const dayColumnWidth = useMemo(() => {
    const n = Math.max(1, daysForWeekGrid.length);
    if (slotDetails.courseName) return DAY_COLUMN_MIN_W;
    if (slotDetails.scrollAllDaysInCompact) return DAY_COLUMN_MIN_W;
    const innerW = winW - GRID_OUTER_H_PAD - TIME_GUTTER;
    return Math.max(50, Math.floor(innerW / n));
  }, [slotDetails.courseName, slotDetails.scrollAllDaysInCompact, daysForWeekGrid.length, winW]);

  const todayDayKey = useMemo(() => JS_TO_DAY[new Date().getDay()], []);

  const hasData = timetable.length > 0;
  const linkedButEmpty = !hasData && Boolean(user.universityId || user.lastSync);
  const uniName = user.universityId
    ? getUniversityById(user.universityId)?.shortName ?? user.university
    : null;

  const gridBodyHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
  const gridContentWidth = TIME_GUTTER + daysForWeekGrid.length * dayColumnWidth;
  const gridScrollMaxH = Math.max(280, Math.min(gridBodyHeight + 8, winH - (Platform.OS === 'ios' ? 210 : 190)));

  const exportSize = useMemo(() => {
    // Wallpaper-friendly defaults (high-res) + screen option.
    if (exportPreset === 'screen') {
      return { label: 'Current screen', width: Math.round(winW), height: Math.round(winH) };
    }
    if (exportPreset === 'landscape') {
      return { label: 'Wallpaper (landscape)', width: 2400, height: 1080 };
    }
    return { label: 'Wallpaper (portrait)', width: 1080, height: 2400 };
  }, [exportPreset, winW, winH]);

  const naturalGrid = useMemo(() => {
    // Natural grid width: compact 5-day fits screen; full week or compact+scroll is wider than screen.
    const scrollsHorizontally =
      slotDetails.courseName ||
      (!slotDetails.courseName && slotDetails.scrollAllDaysInCompact);
    const w = scrollsHorizontally ? Math.max(gridContentWidth, winW) : gridContentWidth;
    const h = 48 + gridBodyHeight; // header row + grid body
    return { w, h };
  }, [gridContentWidth, winW, gridBodyHeight, slotDetails.courseName, slotDetails.scrollAllDaysInCompact]);

  const exportScale = useMemo(() => {
    return Math.min(exportSize.width / naturalGrid.w, exportSize.height / naturalGrid.h);
  }, [exportSize.width, exportSize.height, naturalGrid.w, naturalGrid.h]);

  const previewScale = useMemo(() => {
    // Preview box is limited; scale down to fit visually.
    const pw = winW - 32 - 28; // panel padding + frame padding-ish
    const ph = 220;
    return Math.min(pw / naturalGrid.w, ph / naturalGrid.h);
  }, [winW, naturalGrid.w, naturalGrid.h]);

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
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        {renderHeader(true)}
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
        <View style={s.emptyWrap}>
          <View style={[s.emptyIcon, { backgroundColor: theme.card }]}>
            <Feather name="calendar" size={40} color={theme.textSecondary} style={{ opacity: 0.5 }} />
          </View>
          <Text style={[s.emptyTitle, { color: theme.text }]}>{(T as any)('timetableHeader') || 'Timetable'}</Text>
          <Text style={[s.emptySub, { color: theme.textSecondary }]}>
            {linkedButEmpty ? T('timetableLinkedEmptyHint') : T('connectUniversityPrompt')}
          </Text>
          <Pressable
            style={({ pressed }) => [s.connectBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/university-connect' as any)}
          >
            <Feather name="zap" size={18} color={theme.textInverse} style={{ marginRight: 8 }} />
            <Text style={s.connectBtnText}>
              {linkedButEmpty ? T('resync') : 'Generate Timetable'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* ── Header ───────────────────────────────────────── */
  function renderHeader(showMenu: boolean) {
    return (
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <View style={s.headerLeft}>
          <View style={[s.headerIconWrap, { backgroundColor: `${theme.primary}10` }]}>
            <Feather name="calendar" size={20} color={theme.primary} />
          </View>
          <View>
            <Text style={[s.headerTitle, { color: theme.text }]}>{(T as any)('timetableHeader') || 'Timetable'}</Text>
            <Text style={[s.headerSub, { color: theme.textSecondary }]}>
              {uniName ? uniName : (T as any)('timetableSubtitle')}
            </Text>
          </View>
        </View>
        {showMenu && (
          <View style={s.headerActions}>
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
              <Feather name="edit-2" size={20} color={theme.primary} />
            </Pressable>
            <Pressable
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [s.headerIconBtn, pressed && { opacity: 0.7 }]}
              hitSlop={10}
              accessibilityLabel="Menu"
            >
              <Feather name="more-vertical" size={22} color={theme.text} />
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  function renderTimetableMenu() {
    return (
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={s.menuModalRoot}>
          <Pressable style={s.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={[s.menuPopover, { backgroundColor: theme.card, borderColor: theme.border }]} pointerEvents="box-none">
            <Pressable
              style={({ pressed }) => [s.menuItem, pressed && { opacity: 0.85 }]}
              onPress={() => {
                setMenuOpen(false);
                router.push('/timetable-edit' as any);
              }}
            >
              <Feather name="clipboard" size={18} color={theme.primary} />
              <Text style={[s.menuItemText, { color: theme.text }]}>{T('timetableEditClasses')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.menuItem, pressed && { opacity: 0.85 }]}
              onPress={() => {
                setMenuOpen(false);
                setExportOpen(true);
              }}
            >
              <Feather name="download" size={18} color={theme.primary} />
              <Text style={[s.menuItemText, { color: theme.text }]}>Download as wallpaper</Text>
            </Pressable>
            <View style={[s.menuDivider, { backgroundColor: theme.border }]} />
            <Pressable
              style={({ pressed }) => [s.menuItem, pressed && { opacity: 0.85 }]}
              onPress={() => {
                setViewMode('week');
                setMenuOpen(false);
              }}
            >
              <Feather name="grid" size={18} color={theme.primary} />
              <Text style={[s.menuItemText, { color: theme.text }]}>{T('timetableGridView')}</Text>
              {viewMode === 'week' && <Feather name="check" size={18} color={theme.primary} />}
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.menuItem, pressed && { opacity: 0.85 }]}
              onPress={() => {
                setViewMode('list');
                setMenuOpen(false);
              }}
            >
              <Feather name="list" size={18} color={theme.primary} />
              <Text style={[s.menuItemText, { color: theme.text }]}>{T('timetableListView')}</Text>
              {viewMode === 'list' && <Feather name="check" size={18} color={theme.primary} />}
            </Pressable>
            <View style={[s.menuDivider, { backgroundColor: theme.border }]} />
            <View style={s.menuSwitchRow}>
              <Feather name="book-open" size={18} color={theme.primary} />
              <Text style={[s.menuItemText, { color: theme.text }]}>{T('timetableCardShowCourseName')}</Text>
              <Switch
                value={slotDetails.courseName}
                onValueChange={(courseName) => patchSlotDetails({ courseName })}
                trackColor={{ false: theme.border, true: `${theme.primary}55` }}
                thumbColor={slotDetails.courseName ? theme.primary : theme.textSecondary}
              />
            </View>
            <View style={s.menuSwitchRow}>
              <Feather name="map-pin" size={18} color={theme.primary} />
              <Text style={[s.menuItemText, { color: theme.text }]}>{T('timetableCardShowRoom')}</Text>
              <Switch
                value={slotDetails.room}
                onValueChange={(room) => patchSlotDetails({ room })}
                trackColor={{ false: theme.border, true: `${theme.primary}55` }}
                thumbColor={slotDetails.room ? theme.primary : theme.textSecondary}
              />
            </View>
            <View style={s.menuSwitchRow}>
              <Feather name="user" size={18} color={theme.primary} />
              <Text style={[s.menuItemText, { color: theme.text }]}>{T('timetableCardShowLecturer')}</Text>
              <Switch
                value={slotDetails.lecturer}
                onValueChange={(lecturer) => patchSlotDetails({ lecturer })}
                trackColor={{ false: theme.border, true: `${theme.primary}55` }}
                thumbColor={slotDetails.lecturer ? theme.primary : theme.textSecondary}
              />
            </View>
            {!slotDetails.courseName ? (
              <View style={s.menuSwitchRow}>
                <Feather name="sidebar" size={18} color={theme.primary} />
                <Text style={[s.menuItemText, { color: theme.text, flex: 1 }]}>
                  {T('timetableScrollAllDaysCompact')}
                </Text>
                <Switch
                  value={slotDetails.scrollAllDaysInCompact}
                  onValueChange={(scrollAllDaysInCompact) => patchSlotDetails({ scrollAllDaysInCompact })}
                  trackColor={{ false: theme.border, true: `${theme.primary}55` }}
                  thumbColor={slotDetails.scrollAllDaysInCompact ? theme.primary : theme.textSecondary}
                />
              </View>
            ) : null}
            <View style={[s.menuSwitchRow, s.menuSwitchRowLast]}>
              <Feather name="users" size={18} color={theme.primary} />
              <Text style={[s.menuItemText, { color: theme.text }]}>{T('timetableCardShowGroup')}</Text>
              <Switch
                value={slotDetails.group}
                onValueChange={(group) => patchSlotDetails({ group })}
                trackColor={{ false: theme.border, true: `${theme.primary}55` }}
                thumbColor={slotDetails.group ? theme.primary : theme.textSecondary}
              />
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  async function saveExportedImage() {
    if (exporting) return;
    setExporting(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setExporting(false);
        return;
      }
      if (!exportShotRef.current) {
        setExporting(false);
        return;
      }
      const uri = await captureRef(exportShotRef.current, {
        format: exportFormat,
        quality: exportFormat === 'jpg' ? 0.95 : 1,
        result: 'tmpfile',
      });
      await MediaLibrary.saveToLibraryAsync(uri);
      setExportOpen(false);
    } catch {
      // ignore
    } finally {
      setExporting(false);
    }
  }

  function renderExportModal() {
    if (!exportOpen) return null;

    return (
      <Modal visible={exportOpen} transparent animationType="fade" onRequestClose={() => setExportOpen(false)}>
        <View style={s.exportRoot}>
          <Pressable style={s.exportBackdrop} onPress={() => !exporting && setExportOpen(false)} />
          <View style={[s.exportPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.exportTitle, { color: theme.text }]}>Download timetable</Text>
            <Text style={[s.exportSub, { color: theme.textSecondary }]}>
              Choose a size for wallpaper. We’ll export the full timetable grid.
            </Text>

            <View style={s.exportOptionsRow}>
              {(['portrait', 'landscape', 'screen'] as const).map((id) => {
                const active = exportPreset === id;
                const label = id === 'portrait' ? 'Portrait' : id === 'landscape' ? 'Landscape' : 'Screen';
                return (
                  <Pressable
                    key={id}
                    onPress={() => setExportPreset(id)}
                    style={({ pressed }) => [
                      s.exportChip,
                      { borderColor: theme.border, backgroundColor: theme.background },
                      active && { backgroundColor: theme.primary, borderColor: theme.primary },
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={[s.exportChipText, { color: active ? theme.textInverse : theme.text }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={s.exportOptionsRow}>
              {(['png', 'jpg'] as const).map((id) => {
                const active = exportFormat === id;
                const label = id.toUpperCase();
                return (
                  <Pressable
                    key={id}
                    onPress={() => setExportFormat(id)}
                    style={({ pressed }) => [
                      s.exportChip,
                      { borderColor: theme.border, backgroundColor: theme.background },
                      active && { backgroundColor: theme.primary, borderColor: theme.primary },
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={[s.exportChipText, { color: active ? theme.textInverse : theme.text }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[s.exportPreviewFrame, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <View style={s.exportPreviewInner}>
                <View
                  style={{
                    width: Math.floor(naturalGrid.w * previewScale),
                    height: Math.floor(naturalGrid.h * previewScale),
                    transform: [{ scale: previewScale }],
                  }}
                >
                  {renderWeekGridStatic(naturalGrid.w)}
                </View>
              </View>
            </View>

            <View style={s.exportActions}>
              <Pressable
                style={({ pressed }) => [
                  s.exportBtn,
                  { borderColor: theme.border, backgroundColor: theme.background },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => setExportOpen(false)}
                disabled={exporting}
              >
                <Text style={[s.exportBtnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  s.exportBtn,
                  s.exportBtnPrimary,
                  { borderColor: theme.primary, backgroundColor: theme.primary },
                  (exporting || pressed) && { opacity: 0.9 },
                ]}
                onPress={() => void saveExportedImage()}
                disabled={exporting}
              >
                <Text style={[s.exportBtnText, { color: theme.textInverse }]}>{exporting ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Hidden full-size capture canvas (not constrained by preview frame). */}
        <View style={s.exportHiddenCanvas} pointerEvents="none">
          <ViewShot
            ref={(r) => {
              exportShotRef.current = r;
            }}
            options={{ format: exportFormat, quality: exportFormat === 'jpg' ? 0.95 : 1, result: 'tmpfile' }}
            style={{
              width: exportSize.width,
              height: exportSize.height,
              backgroundColor: theme.background,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: naturalGrid.w,
                height: naturalGrid.h,
                transform: [{ scale: exportScale }],
              }}
            >
              {renderWeekGridStatic(naturalGrid.w)}
            </View>
          </ViewShot>
        </View>
      </Modal>
    );
  }

  /* ── Week grid: one column per day (scroll horizontally if needed) ─ */
  function renderWeekGrid() {
    const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
    const hScrollWeekOrCompactAllDays =
      slotDetails.courseName ||
      (!slotDetails.courseName && slotDetails.scrollAllDaysInCompact);
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
                        <Text style={s.gridColCountText}>{count}</Text>
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
                      <Text style={[s.gridHourText, { color: theme.textSecondary }]}>
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
                              borderBottomColor: theme.border,
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
                        const color = entrySlotColor(entry);
                        const title = entryDisplayTitle(entry);
                        const hasTitle = Boolean(slotDetails.courseName && height > 38);
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
                              {entry.subjectCode}
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
                          <View key={entry.id} style={slotStyle}>
                            {slotBody}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    );
  }

  function renderWeekGridStatic(minTableW: number) {
    const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
    return (
      <View style={[s.gridRoot, { paddingHorizontal: 0, paddingBottom: 0 }]}>
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
                      <Text style={s.gridColCountText}>{count}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          <View style={[s.gridBodyRow, { minHeight: gridBodyHeight }]}>
            <View style={[s.gridTimeCol, { width: TIME_GUTTER }]}>
              {hours.map((h) => (
                <View key={h} style={{ height: HOUR_HEIGHT, paddingTop: 2 }}>
                  <Text style={[s.gridHourText, { color: theme.textSecondary }]}>
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
                          borderBottomColor: theme.border,
                        },
                      ]}
                    />
                  ))}
                  {items.map((entry) => {
                    const startMin = timeToMinutes(entry.startTime);
                    const endMin = timeToMinutes(entry.endTime);
                    const top = ((startMin / 60) - START_HOUR) * HOUR_HEIGHT;
                    const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 26);
                    const color = entrySlotColor(entry);
                    const title = entryDisplayTitle(entry);
                    const hasTitle = Boolean(slotDetails.courseName && height > 38);
                    const metaParts = weekGridMetaParts(
                      entry,
                      slotDetails,
                      height,
                      hasTitle,
                      T('timetableRoomOnline'),
                    );
                    const stackTight = hasTitle || Boolean(metaParts);
                    return (
                      <View
                        key={entry.id}
                        style={[
                          s.gridSlot,
                          {
                            top,
                            height,
                            backgroundColor: color + '32',
                            borderLeftColor: color,
                          },
                        ]}
                      >
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
                            {entry.subjectCode}
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
                      </View>
                    );
                  })}
                  {items.length === 0 && (
                    <View style={[s.gridEmptyCol, { top: gridBodyHeight * 0.35 }]}>
                      <Text style={[s.gridEmptyText, { color: theme.textSecondary }]}>—</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  }

  /* ── List view ────────────────────────────────────── */
  function renderListView() {
    return (
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
                  const color = entrySlotColor(e);
                  const title = entryDisplayTitle(e);
                  const cardStyle = [s.listCard, { backgroundColor: theme.background, borderLeftColor: color }];
                  const cardInner = (
                    <>
                      <View style={s.listTimeCol}>
                        <Text style={[s.listTime, { color: theme.primary }]}>{e.startTime}</Text>
                        <Text style={[s.listTimeDash, { color: theme.textSecondary }]}>-</Text>
                        <Text style={[s.listTime, { color: theme.primary }]}>{e.endTime}</Text>
                      </View>
                      <View style={s.listCardBody}>
                        <Text style={[s.listCode, { color }]}>{e.subjectCode}</Text>
                        {slotDetails.courseName ? (
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
                    <View key={e.id} style={cardStyle}>
                      {cardInner}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {renderHeader(true)}
      {renderTimetableMenu()}
      {renderExportModal()}
      {viewMode === 'week' ? renderWeekGrid() : renderListView()}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
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
  menuModalRoot: {
    flex: 1,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  menuPopover: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 108 : 92,
    right: 12,
    minWidth: 268,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: { flex: 1, fontSize: 15, fontWeight: '600' },
  menuSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    paddingRight: 12,
  },
  menuSwitchRowLast: { paddingBottom: 12 },
  menuDivider: { height: StyleSheet.hairlineWidth, marginLeft: 46 },
  headerIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  exportRoot: { flex: 1 },
  exportBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  exportPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: Platform.OS === 'ios' ? 100 : 84,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  exportTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
  exportSub: { fontSize: 13, fontWeight: '600', marginTop: 6, lineHeight: 18 },
  exportOptionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  exportChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportChipText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.2 },
  exportPreviewFrame: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 12,
    height: 220,
  },
  exportPreviewInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  exportHiddenCanvas: {
    position: 'absolute',
    left: -10000,
    top: -10000,
    width: 1,
    height: 1,
  },
  exportActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  exportBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtnPrimary: { flex: 1.3 },
  exportBtnText: { fontSize: 13, fontWeight: '900' },
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
    height: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
});

function WeekGridSlotMetaText({
  parts,
  theme,
  slotHeight,
}: {
  parts: WeekGridMetaParts;
  theme: { text: string; textSecondary: string };
  slotHeight: number;
}) {
  const { room, lecturer, group } = parts;
  const { roomLines, lectLines } = weekGridMetaLineCaps(slotHeight);
  const tail = [lecturer, group].filter(Boolean).join(' · ');
  if (!room && !tail) return null;
  return (
    <View style={s.gridSlotMetaColumn}>
      {room ? (
        <Text
          style={[s.gridSlotMetaRoom, { color: theme.text }]}
          numberOfLines={roomLines}
          ellipsizeMode="tail"
        >
          {room}
        </Text>
      ) : null}
      {tail ? (
        <Text
          style={[s.gridSlotMetaLect, { color: theme.textSecondary }]}
          numberOfLines={lectLines}
          ellipsizeMode="tail"
        >
          {tail}
        </Text>
      ) : null}
    </View>
  );
}

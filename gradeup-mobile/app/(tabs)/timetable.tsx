import React, { useState, useMemo, useEffect, useCallback } from 'react';
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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function entryDisplayTitle(e: TimetableEntry): string {
  const d = e.displayName?.trim();
  return d || e.subjectName;
}

function entrySlotColor(e: TimetableEntry): string {
  const c = e.slotColor?.trim();
  return c || getSlotColorForSubjectCode(e.subjectCode);
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
  const [slotDetails, setSlotDetails] = useState<TimetableSlotDetailsVisibility>({
    room: true,
    lecturer: true,
    group: true,
  });

  useEffect(() => {
    getTimetableSlotDetailsVisibility().then(setSlotDetails);
  }, []);

  const patchSlotDetails = useCallback((patch: Partial<TimetableSlotDetailsVisibility>) => {
    setSlotDetails((prev) => {
      const next = { ...prev, ...patch };
      void setTimetableSlotDetailsVisibility(next);
      return next;
    });
  }, []);

  const daysOrdered = useMemo(() => orderedDays(weekStartsOn), [weekStartsOn]);

  const todayDayKey = useMemo(() => JS_TO_DAY[new Date().getDay()], []);

  const hasData = timetable.length > 0;
  const linkedButEmpty = !hasData && Boolean(user.universityId || user.lastSync);
  const uniName = user.universityId
    ? getUniversityById(user.universityId)?.shortName ?? user.university
    : null;

  const gridBodyHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
  const gridContentWidth = TIME_GUTTER + daysOrdered.length * DAY_COLUMN_MIN_W;
  const gridScrollMaxH = Math.max(280, Math.min(gridBodyHeight + 8, winH - (Platform.OS === 'ios' ? 210 : 190)));

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
    return (
      <View style={[s.container, { backgroundColor: theme.background }]}>
        {renderHeader(false)}
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
            <Feather name="globe" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.connectBtnText}>
              {linkedButEmpty ? T('resync') : T('connectUniversity')}
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
          <Pressable
            onPress={() => setMenuOpen(true)}
            style={({ pressed }) => [s.menuBtn, pressed && { opacity: 0.7 }]}
            hitSlop={12}
          >
            <Feather name="more-vertical" size={22} color={theme.text} />
          </Pressable>
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
              <Feather name="edit-2" size={18} color={theme.primary} />
              <Text style={[s.menuItemText, { color: theme.text }]}>{T('timetableEditClasses')}</Text>
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

  /* ── Week grid: one column per day (scroll horizontally if needed) ─ */
  function renderWeekGrid() {
    const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
    const minTableW = Math.max(gridContentWidth, winW);

    return (
      <View style={s.gridRoot}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          nestedScrollEnabled
          style={s.gridHScroll}
          contentContainerStyle={{ minWidth: minTableW }}
        >
          <View style={{ width: minTableW }}>
            <View style={[s.gridHeaderRow, { borderBottomColor: theme.border }]}>
              <View style={[s.gridCorner, { width: TIME_GUTTER }]} />
              {daysOrdered.map(({ key, shortKey }) => {
                const isToday = key === todayDayKey;
                const count = timetable.filter((e) => e.day === key).length;
                return (
                  <View
                    key={key}
                    style={[
                      s.gridColHead,
                      {
                        width: DAY_COLUMN_MIN_W,
                        borderLeftColor: theme.border,
                        backgroundColor: isToday ? `${theme.primary}14` : theme.backgroundSecondary ?? theme.card,
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

                {daysOrdered.map(({ key }) => {
                  const items = timetable
                    .filter((e) => e.day === key)
                    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
                  const isToday = key === todayDayKey;
                  return (
                    <View
                      key={key}
                      style={[
                        s.gridDayCol,
                        {
                          width: DAY_COLUMN_MIN_W,
                          minHeight: gridBodyHeight,
                          borderLeftColor: theme.border,
                          backgroundColor: isToday ? `${theme.primary}0A` : 'transparent',
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
                        return (
                          <View
                            key={entry.id}
                            style={[
                              s.gridSlot,
                              {
                                top,
                                height,
                                backgroundColor: color + '24',
                                borderLeftColor: color,
                              },
                            ]}
                          >
                            <Text style={[s.gridSlotCode, { color }]} numberOfLines={2}>
                              {entry.subjectCode}
                            </Text>
                            {height > 38 && (
                              <Text style={[s.gridSlotTitle, { color: theme.text }]} numberOfLines={height > 90 ? 4 : 2}>
                                {title}
                              </Text>
                            )}
                            {height > 48 && (
                              <Text style={[s.gridSlotWhen, { color: theme.textSecondary }]} numberOfLines={1}>
                                {entry.startTime}–{entry.endTime}
                              </Text>
                            )}
                            {slotDetails.room && height > 72 && entry.location && entry.location !== '-' && (
                              <Text style={[s.gridSlotMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                                {T('timetableRoom')}: {entry.location}
                              </Text>
                            )}
                            {slotDetails.lecturer && height > 88 && entry.lecturer && entry.lecturer !== '-' && (
                              <Text style={[s.gridSlotMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                                {T('timetableLecturer')}: {entry.lecturer}
                              </Text>
                            )}
                            {slotDetails.group && height > 102 && entry.group && (
                              <Text style={[s.gridSlotMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                                {T('timetableGroup')}: {entry.group}
                              </Text>
                            )}
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
            </ScrollView>
          </View>
        </ScrollView>
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
                  return (
                    <View
                      key={e.id}
                      style={[s.listCard, { backgroundColor: theme.background, borderLeftColor: color }]}
                    >
                      <View style={s.listTimeCol}>
                        <Text style={[s.listTime, { color: theme.primary }]}>{e.startTime}</Text>
                        <Text style={[s.listTimeDash, { color: theme.textSecondary }]}>-</Text>
                        <Text style={[s.listTime, { color: theme.primary }]}>{e.endTime}</Text>
                      </View>
                      <View style={s.listCardBody}>
                        <Text style={[s.listCode, { color }]}>{e.subjectCode}</Text>
                        <Text style={[s.listName, { color: theme.text }]} numberOfLines={2}>{title}</Text>
                        {slotDetails.room && e.location && e.location !== '-' && (
                          <View style={s.listMeta}>
                            <Text style={[s.listMetaLabel, { color: theme.primary }]}>{T('timetableRoom')}:</Text>
                            <Text style={[s.listMetaValue, { color: theme.textSecondary }]}>{e.location}</Text>
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
  menuBtn: {
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
  gridSlot: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: 8,
    borderLeftWidth: 3,
    paddingHorizontal: 5,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  gridSlotCode: { fontSize: 10, fontWeight: '800', lineHeight: 13 },
  gridSlotTitle: { fontSize: 9, fontWeight: '600', marginTop: 1, lineHeight: 12 },
  gridSlotWhen: { fontSize: 8, marginTop: 2 },
  gridSlotMeta: { fontSize: 7, marginTop: 2, lineHeight: 10 },
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

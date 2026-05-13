import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import {
  CALENDAR_IMPORT_MAX_EVENTS,
  calendarEventToTask,
  ensureCalendarPermission,
  fetchEventsInRange,
  getEventCalendars,
} from '@/src/lib/calendarImport';
import type { Calendar as DeviceCalendar, Event as DeviceEvent } from 'expo-calendar';
import { isAtLeastPlus } from '@/src/lib/flashcardGenerationLimits';

type RangePreset = 'week' | 'month' | 'semester';

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeekSunday(d: Date): Date {
  const s = startOfWeekMonday(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function parseYMD(s: string): Date | null {
  const t = s.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function ImportCalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, addTask, academicCalendar, user } = useApp();
  const T = useTranslations(language);

  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  const [loadingCals, setLoadingCals] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rangePreset, setRangePreset] = useState<RangePreset>('month');
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  const semesterRange = useMemo(() => {
    if (!academicCalendar?.isActive) return null;
    const start = parseYMD(academicCalendar.startDate);
    const end = parseYMD(academicCalendar.endDate);
    if (!start || !end) return null;
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [academicCalendar]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    if (rangePreset === 'week') {
      return { rangeStart: startOfWeekMonday(now), rangeEnd: endOfWeekSunday(now) };
    }
    if (rangePreset === 'month') {
      return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) };
    }
    if (semesterRange) {
      return { rangeStart: semesterRange.start, rangeEnd: semesterRange.end };
    }
    return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(now) };
  }, [rangePreset, semesterRange]);

  const calendarTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of calendars) m.set(c.id, c.title || c.name || 'Calendar');
    return m;
  }, [calendars]);

  const loadCalendars = useCallback(async () => {
    setLoadingCals(true);
    try {
      const ok = await ensureCalendarPermission();
      setPermissionGranted(ok);
      if (!ok) {
        setCalendars([]);
        return;
      }
      const list = await getEventCalendars();
      setCalendars(list);
      setSelectedIds(new Set(list.map((c) => c.id)));
    } catch {
      Alert.alert('', T('importCalendarLoadError'));
      setCalendars([]);
    } finally {
      setLoadingCals(false);
    }
  }, [T]);

  useEffect(() => {
    void loadCalendars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshEvents = useCallback(async () => {
    if (!permissionGranted || selectedIds.size === 0) {
      setEvents([]);
      return;
    }
    setLoadingEvents(true);
    try {
      const ids = [...selectedIds];
      const raw = await fetchEventsInRange(ids, rangeStart, rangeEnd);
      raw.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
      setEvents(raw);
      setSelectedEventIds(new Set(raw.map((e) => e.id)));
    } catch {
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [permissionGranted, selectedIds, rangeStart, rangeEnd]);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);

  const capped = useMemo(() => {
    if (events.length <= CALENDAR_IMPORT_MAX_EVENTS) return { list: events, truncated: false };
    return { list: events.slice(0, CALENDAR_IMPORT_MAX_EVENTS), truncated: true };
  }, [events]);

  const toggleCalendar = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEvent = (id: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatEventDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(language === 'ms' ? 'ms-MY' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const selectPreset = (p: RangePreset) => {
    if (p === 'semester' && !semesterRange) {
      Alert.alert('', T('semesterNotConfigured'));
      return;
    }
    setRangePreset(p);
  };

  const runImport = async () => {
    if (capped.list.length === 0) return;
    if (capped.truncated) {
      Alert.alert(
        '',
        T('importCalendarTooMany').replace('{n}', String(CALENDAR_IMPORT_MAX_EVENTS)),
        [
          { text: T('cancel'), style: 'cancel' },
          { text: T('importCalendarImport'), onPress: () => void doImport() },
        ],
      );
      return;
    }
    await doImport();
  };

  const doImport = async () => {
    setImporting(true);
    const toImport = capped.list.filter((e) => selectedEventIds.has(e.id));
    if (toImport.length === 0) {
      setImporting(false);
      return;
    }
    try {
      for (const ev of toImport) {
        const calTitle = calendarTitleById.get(ev.calendarId) ?? 'Calendar';
        const task = calendarEventToTask(ev, ev.calendarId, calTitle);
        addTask(task);
      }
      Alert.alert('', T('importCalendarDone'), [
        { text: T('done'), onPress: () => router.back() },
      ]);
    } finally {
      setImporting(false);
    }
  };

  if (!isAtLeastPlus(user?.subscriptionPlan)) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Feather name="arrow-left" size={22} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{T('importCalendarTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.deniedBody}>
          <Feather name="lock" size={48} color={theme.primary} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={[styles.bodyText, { color: theme.text, textAlign: 'center', fontWeight: 'bold', fontSize: 18 }]}>
            {(T as any)('importCalendarUpgradeTitle') || 'Plus / Pro Feature'}
          </Text>
          <Text style={[styles.bodyText, { color: theme.textSecondary, textAlign: 'center' }]}>
            {(T as any)('importCalendarUpgradeBody') || 'Importing tasks directly from your device calendar is exclusively available for Plus and Pro users.'}
          </Text>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.primary, marginTop: 24 }]}
            onPress={() => router.push('/subscription-plans' as never)}
          >
            <Text style={[styles.primaryBtnText, { color: theme.textInverse }]}>
              {T('aiMonthlyLimitUpgrade') || 'Upgrade'}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (permissionGranted === false && !loadingCals) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Feather name="arrow-left" size={22} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{T('importCalendarTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.deniedBody}>
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{T('importCalendarPermissionBody')}</Text>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => void loadCalendars()}
          >
            <Text style={[styles.primaryBtnText, { color: theme.textInverse }]}>{T('importCalendarGrantAccess')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{T('importCalendarTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loadingCals ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : calendars.length === 0 ? (
        <View style={styles.centered}>
          <Text style={{ color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 24 }}>
            {T('importCalendarNoCalendars')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{T('importCalendarDateRange')}</Text>
          <View style={styles.chipRow}>
            {(['week', 'month', 'semester'] as const).map((p) => {
              const active = rangePreset === p;
              const disabled = p === 'semester' && !semesterRange;
              return (
                <Pressable
                  key={p}
                  disabled={disabled}
                  onPress={() => selectPreset(p)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.primary : theme.card,
                      opacity: disabled ? 0.4 : 1,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontWeight: '600',
                      fontSize: 13,
                      color: active ? theme.textInverse : theme.text,
                    }}
                  >
                    {p === 'week'
                      ? T('importCalendarRangeThisWeek')
                      : p === 'month'
                        ? T('importCalendarRangeThisMonth')
                        : T('importCalendarRangeSemester')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 20 }]}>
            {T('importCalendarSelectCalendars')}
          </Text>
          <FlatList
            data={calendars}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const on = selectedIds.has(item.id);
              return (
                <Pressable
                  onPress={() => toggleCalendar(item.id)}
                  style={[styles.calRow, { borderBottomColor: theme.border, backgroundColor: theme.card }]}
                >
                  <View style={[styles.check, { borderColor: theme.primary, backgroundColor: on ? theme.primary : 'transparent' }]}>
                    {on ? <Feather name="check" size={16} color={theme.textInverse} /> : null}
                  </View>
                  <Text style={[styles.calTitle, { color: theme.text }]} numberOfLines={2}>
                    {item.title || item.name || '—'}
                  </Text>
                </Pressable>
              );
            }}
          />

          <View style={[styles.previewCard, { backgroundColor: theme.card, marginTop: 20 }]}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginBottom: 8 }]}>
              {T('importCalendarPreview')}
            </Text>
            {loadingEvents ? (
              <ActivityIndicator color={theme.primary} />
            ) : capped.list.length === 0 ? (
              <Text style={{ color: theme.textSecondary }}>{T('importCalendarNoEvents')}</Text>
            ) : (
              <View style={{ gap: 12 }}>
                {capped.list.map((ev) => {
                  const isSel = selectedEventIds.has(ev.id);
                  return (
                    <Pressable
                      key={ev.id}
                      onPress={() => toggleEvent(ev.id)}
                      style={[
                        styles.eventItem,
                        {
                          borderColor: isSel ? theme.primary : theme.border,
                          backgroundColor: isSel ? theme.backgroundSecondary : 'transparent',
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.eventTitle, { color: theme.text }]} numberOfLines={1}>
                          {ev.title}
                        </Text>
                        <Text style={[styles.eventDate, { color: theme.textSecondary }]}>
                          {formatEventDate(String(ev.startDate))}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.eventCheck,
                          {
                            borderColor: theme.primary,
                            backgroundColor: isSel ? theme.primary : 'transparent',
                          },
                        ]}
                      >
                        {isSel && <Feather name="check" size={14} color={theme.textInverse} />}
                      </View>
                    </Pressable>
                  );
                })}
                {capped.truncated ? (
                  <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: 13 }}>
                    {T('importCalendarTooMany').replace('{n}', String(CALENDAR_IMPORT_MAX_EVENTS))}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          <Pressable
            disabled={importing || selectedEventIds.size === 0 || loadingEvents}
            onPress={() => void runImport()}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: theme.primary,
                marginTop: 24,
                marginHorizontal: 16,
                opacity: importing || selectedEventIds.size === 0 || loadingEvents ? 0.5 : 1,
              },
            ]}
          >
            {importing ? (
              <ActivityIndicator color={theme.textInverse} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: theme.textInverse }]}>
                {T('importCalendarImport')} ({selectedEventIds.size})
              </Text>
            )}
          </Pressable>
          {Platform.OS === 'ios' ? null : (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              {T('importFromCalendarSub')}
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  deniedBody: { padding: 24, gap: 20 },
  bodyText: { fontSize: 15, lineHeight: 22 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginHorizontal: 16, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  previewCard: { marginHorizontal: 16, padding: 16, borderRadius: 16 },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  eventTitle: { fontSize: 15, fontWeight: '700' },
  eventDate: { fontSize: 12, marginTop: 2 },
  eventCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBig: { fontSize: 32, fontWeight: '800' },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 17, fontWeight: '700' },
  hint: { textAlign: 'center', marginTop: 16, paddingHorizontal: 24, fontSize: 13 },
});

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Dimensions,
  TextInput,
  FlatList,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { getAcademicProgressFromCalendar, getAcademicProgress } from '@/src/lib/academicUtils';
import {
  searchUniversities,
  getUniversityById,
  getMalaysianUniversities,
  inferSemesterFromStudentId,
  type UniversityItem,
} from '@/src/lib/universities';
import type { AcademicLevel } from '@/src/types';
import { fetchUitmAcademicCalendar, type UitmCalendarVariant } from '@/src/lib/uitmAcademicCalendar';
import {
  fetchLatestCalendarForUniversity,
  fetchAllCalendarOffersForUniversity,
  offerToCalendarPatch,
  type UniversityCalendarOffer,
} from '@/src/lib/universityCalendarOffersDb';

const SCREEN_W = Dimensions.get('window').width;
const GRID_GAP = 6;

function inferAcademicLevelFromOfferLabel(label: string): AcademicLevel {
  const s = String(label || '').toLowerCase();
  if (s.includes('foundation')) return 'Foundation';
  if (s.includes('diploma')) return 'Diploma';
  if (s.includes('bachelor') || s.includes('sarjana muda') || s.includes('first degree')) return 'Bachelor';
  if (s.includes('phd') || s.includes('doktor') || s.includes('doctorate')) return 'PhD';
  if (s.includes('master') || s.includes('sarjana')) return 'Master';
  return 'Other';
}

export default function AcademicCalendarScreen() {
  const theme = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const { academicCalendar, user, language, updateAcademicCalendar, updateProfile, clearAcademicCalendar } = useApp();
  const T = useTranslations(language);
  const insets = useSafeAreaInsets();
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayMonthCursor = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  }, []);
  const modalMaxH = useMemo(() => {
    const h = Dimensions.get('window').height;
    return Math.max(420, h - (insets.top + 120));
  }, [insets.top]);
  const [configOpen, setConfigOpen] = useState(false);
  const [cfgBusy, setCfgBusy] = useState(false);
  const [uniGateOpen, setUniGateOpen] = useState(false);
  const [uniSearch, setUniSearch] = useState('');
  const [uniOptions, setUniOptions] = useState<UniversityItem[]>([]);
  const [weekAlignOpen, setWeekAlignOpen] = useState(false);
  const [alignBusy, setAlignBusy] = useState(false);
  const [alignPickWeek, setAlignPickWeek] = useState(1);

  const [cfgLevel, setCfgLevel] = useState<AcademicLevel>(() => user.academicLevel ?? 'Bachelor');
  const [cfgMode, setCfgMode] = useState<'Full-time' | 'Part-time' | 'Unknown'>(() => {
    const v = (user.studyMode ?? '').toLowerCase();
    if (v.includes('part') || v.includes('separuh')) return 'Part-time';
    if (v.includes('full') || v.includes('sepenuh')) return 'Full-time';
    return 'Unknown';
  });
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [adminOffers, setAdminOffers] = useState<UniversityCalendarOffer[]>([]);
  const [cfgSelectedOfferId, setCfgSelectedOfferId] = useState('');
  const [offersLoading, setOffersLoading] = useState(false);
  const [cfgVariant, setCfgVariant] = useState<UitmCalendarVariant>(() => {
    const label = String(academicCalendar?.semesterLabel ?? '');
    if (/kedah\/kelantan\/terengganu/i.test(label)) return 'kkt';
    if (/standard/i.test(label)) return 'standard';
    return 'auto';
  });
  const [cfgStudentId, setCfgStudentId] = useState(() => (user.studentId || '').trim());

  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const base = String(academicCalendar?.startDate ?? '').slice(0, 10);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(base) ? new Date(`${base}T00:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [filter, setFilter] = useState<'all' | 'registration' | 'lecture' | 'exam' | 'break'>('all');
  const [selectedDayISO, setSelectedDayISO] = useState<string>('');
  const [gridWidth, setGridWidth] = useState<number>(() => Math.max(280, SCREEN_W - 32));

  const activeDateIsInAcademicCalendar = useMemo(() => {
    const ss = String(todayISO).slice(0, 10);
    const a = String(academicCalendar?.startDate ?? '').slice(0, 10);
    const b = String(academicCalendar?.endDate ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ss) || !/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return false;
    return ss >= a && ss <= b;
  }, [academicCalendar?.startDate, academicCalendar?.endDate, todayISO]);

  useFocusEffect(
    useCallback(() => {
      // When user opens this screen from Settings, show and select the current date by default.
      if (!academicCalendar?.startDate || !academicCalendar?.endDate) {
        setMonthCursor(todayMonthCursor);
        setSelectedDayISO(todayISO);
        return;
      }

      // If today is outside the semester range, jump to the semester start month so users
      // immediately see events (common for newly-published future calendars).
      if (!activeDateIsInAcademicCalendar) {
        const a = String(academicCalendar.startDate).slice(0, 10);
        const d = /^\d{4}-\d{2}-\d{2}$/.test(a) ? new Date(`${a}T00:00:00`) : new Date();
        setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
        setSelectedDayISO(a);
        return;
      }

      setMonthCursor(todayMonthCursor);
      setSelectedDayISO(todayISO);
    }, [academicCalendar?.startDate, academicCalendar?.endDate, activeDateIsInAcademicCalendar, todayISO, todayMonthCursor]),
  );

  useEffect(() => {
    setUniGateOpen(!user.universityId);
  }, [user.universityId]);

  useEffect(() => {
    let cancelled = false;
    void getMalaysianUniversities().then((list) => {
      if (!cancelled) setUniOptions(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (configOpen) setCfgStudentId((user.studentId || '').trim());
  }, [configOpen, user.studentId]);

  useEffect(() => {
    const uniId = user.universityId;
    if (!configOpen || !uniId || uniId === 'uitm') {
      setAdminOffers([]);
      setCfgSelectedOfferId('');
      setOffersLoading(false);
      return;
    }
    let cancelled = false;
    setOffersLoading(true);
    void (async () => {
      try {
        const list = await fetchAllCalendarOffersForUniversity(uniId);
        if (cancelled) return;
        setAdminOffers(list);
        const curStart = String(academicCalendar?.startDate ?? '').slice(0, 10);
        const curLabel = String(academicCalendar?.semesterLabel ?? '');
        const match = list.find((o) => o.startDate === curStart && o.semesterLabel === curLabel);
        const pick = match ?? list[0];
        setCfgSelectedOfferId(pick?.id ?? '');
        if (pick) setCfgLevel(inferAcademicLevelFromOfferLabel(pick.semesterLabel));
      } catch {
        if (!cancelled) setAdminOffers([]);
      } finally {
        if (!cancelled) setOffersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configOpen, user.universityId, academicCalendar?.startDate, academicCalendar?.semesterLabel]);

  const uniSearchResults = useMemo(() => {
    const base = uniOptions.length > 0 ? uniOptions : searchUniversities('');
    const q = uniSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.shortName.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    );
  }, [uniOptions, uniSearch]);

  const openWeekAlign = useCallback(() => {
    if (!academicCalendar?.startDate) return;
    const raw = getAcademicProgressFromCalendar(academicCalendar, user.startDate, {
      ignoreTeachingWeekOffset: true,
    });
    const cap = Math.max(1, academicCalendar.totalWeeks ?? 14);
    setAlignPickWeek(Math.max(1, Math.min(cap, raw.week)));
    setWeekAlignOpen(true);
  }, [academicCalendar, user.startDate]);

  const presentWeekAlignFlow = useCallback(() => {
    if (!academicCalendar?.startDate) return;
    const off = academicCalendar.teachingWeekOffset ?? 0;
    if (off !== 0) {
      Alert.alert(
        'Week number adjusted',
        'Your teaching week was shifted from the default for this calendar. Pick the week you are in today so it matches the real semester.',
        [{ text: 'Continue', onPress: () => openWeekAlign() }],
      );
      return;
    }
    openWeekAlign();
  }, [academicCalendar, openWeekAlign]);

  const onHeaderAlignPress = useCallback(() => {
    if (!academicCalendar?.startDate) {
      Alert.alert('No calendar', 'Save your semester configuration first so dates are available.');
      return;
    }
    presentWeekAlignFlow();
  }, [academicCalendar?.startDate, presentWeekAlignFlow]);

  const openWeekAlignFromConfig = useCallback(() => {
    setConfigOpen(false);
    setTimeout(() => presentWeekAlignFlow(), 0);
  }, [presentWeekAlignFlow]);

  const saveWeekAlign = useCallback(async () => {
    if (!academicCalendar || alignBusy) return;
    setAlignBusy(true);
    try {
      const raw = getAcademicProgressFromCalendar(academicCalendar, user.startDate, {
        ignoreTeachingWeekOffset: true,
      });
      const newOffset = alignPickWeek - raw.week;
      const { id: _id, userId: _uid, createdAt: _ca, ...rest } = academicCalendar;
      await updateAcademicCalendar({
        ...rest,
        teachingWeekOffset: newOffset,
        isActive: true,
      });
      setWeekAlignOpen(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save week alignment');
    } finally {
      setAlignBusy(false);
    }
  }, [academicCalendar, alignBusy, alignPickWeek, updateAcademicCalendar, user.startDate]);

  const changeUniversity = useCallback(async () => {
    if (cfgBusy) return;
    setCfgBusy(true);
    try {
      await clearAcademicCalendar();
      await updateProfile({ universityId: null, university: null });
      setConfigOpen(false);
      setUniGateOpen(true);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not change university');
    } finally {
      setCfgBusy(false);
    }
  }, [cfgBusy, clearAcademicCalendar, updateProfile]);

  const onConfirmUniversity = useCallback(
    async (item: UniversityItem) => {
      if (cfgBusy) return;
      setCfgBusy(true);
      try {
        await updateProfile({
          universityId: item.id,
          university: item.name,
        });
        setUniGateOpen(false);
        setUniSearch('');
        const today = new Date().toISOString().slice(0, 10);
        if (item.id === 'uitm') {
          const grp: 'A' | 'B' = user.academicLevel === 'Foundation' ? 'A' : 'B';
          const official = await fetchUitmAcademicCalendar(grp, { targetDateISO: today, variant: 'auto' });
          if (official?.startDate && official?.endDate) {
            await updateAcademicCalendar({
              semesterLabel: official.semesterLabel,
              startDate: official.startDate,
              endDate: official.endDate,
              totalWeeks: official.totalWeeks ?? 14,
              periods: official.periods,
              teachingWeekOffset: 0,
              isActive: true,
            });
          } else {
            Alert.alert('Calendar sync', 'Could not load UiTM HEA calendar. Check your connection and try Semester configuration.');
          }
        } else {
          const adminOffer = await fetchLatestCalendarForUniversity(item.id);
          if (adminOffer) {
            await updateAcademicCalendar({
              ...offerToCalendarPatch(adminOffer),
              teachingWeekOffset: 0,
              isActive: true,
            });
          } else {
            Alert.alert(
              'No university calendar',
              'There is no academic calendar published for your university in the app yet. Ask your administrator to publish one, or try again later.',
            );
          }
        }
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Could not save university');
      } finally {
        setCfgBusy(false);
      }
    },
    [cfgBusy, updateProfile, updateAcademicCalendar, user.academicLevel],
  );

  const cellW = useMemo(() => {
    const w = Math.max(280, gridWidth);
    const totalGap = GRID_GAP * 6;
    return Math.max(34, Math.floor((w - totalGap) / 7));
  }, [gridWidth]);

  const progress = useMemo(() => {
    if (academicCalendar?.periods && academicCalendar.periods.length > 0) {
      return getAcademicProgressFromCalendar(academicCalendar, user.startDate);
    }
    return getAcademicProgress(academicCalendar?.startDate ?? user.startDate ?? '', academicCalendar?.totalWeeks ?? 14);
  }, [academicCalendar, user.startDate]);

  const group = useMemo<'A' | 'B' | null>(() => {
    const label = String(academicCalendar?.semesterLabel ?? '');
    if (/group\s*a/i.test(label)) return 'A';
    if (/group\s*b/i.test(label)) return 'B';
    return null;
  }, [academicCalendar?.semesterLabel]);

  const periods = academicCalendar?.periods ?? [];

  const recommendedGroup = useMemo<'A' | 'B'>(() => (cfgLevel === 'Foundation' ? 'A' : 'B'), [cfgLevel]);

  const saveConfiguration = useCallback(async () => {
    if (cfgBusy) return;
    if (!user.universityId) {
      Alert.alert('University required', 'Please confirm your university first.');
      return;
    }
    try {
      setCfgBusy(true);
      setSyncStatus('');
      const studyMode = cfgMode === 'Unknown' ? '' : cfgMode === 'Full-time' ? 'Full-time' : 'Part-time';

      const uniId = user.universityId;
      const sid = cfgStudentId.trim();
      const hint = inferSemesterFromStudentId(uniId, sid);
      const today = new Date().toISOString().slice(0, 10);
      const groupForHea: 'A' | 'B' = recommendedGroup;

      if (uniId === 'uitm') {
        await updateProfile({
          academicLevel: cfgLevel,
          studyMode,
          ...(hint?.currentSemester != null ? { currentSemester: hint.currentSemester } : {}),
          heaTermCode: null,
          studentId: sid,
        });
        const official = await fetchUitmAcademicCalendar(groupForHea, { targetDateISO: today, variant: cfgVariant });
        if (official?.startDate && official?.endDate) {
          await updateAcademicCalendar({
            semesterLabel: official.semesterLabel,
            startDate: official.startDate,
            endDate: official.endDate,
            totalWeeks: official.totalWeeks ?? (academicCalendar?.totalWeeks ?? 14),
            periods: official.periods,
            teachingWeekOffset: 0,
            isActive: true,
          });
          setSyncStatus(`Auto-synced: ${official.semesterLabel}`);
        } else {
          setSyncStatus('HEA fetch returned no data — check internet');
        }
        setConfigOpen(false);
        return;
      }

      const selected =
        adminOffers.find((o) => o.id === cfgSelectedOfferId) ?? (adminOffers.length > 0 ? adminOffers[0] : null);
      await updateProfile({
        studyMode,
        ...(hint?.currentSemester != null ? { currentSemester: hint.currentSemester } : {}),
        heaTermCode: null,
        studentId: sid,
        ...(selected ? { academicLevel: inferAcademicLevelFromOfferLabel(selected.semesterLabel) } : {}),
      });

      if (selected) {
        await updateAcademicCalendar({
          ...offerToCalendarPatch(selected),
          teachingWeekOffset: 0,
          isActive: true,
        });
        setSyncStatus(`Applied: ${selected.semesterLabel}`);
      } else {
        setSyncStatus('No administrator calendar for this university yet.');
        Alert.alert(
          'No university calendar',
          'There is no academic calendar published for your university in the app yet. Ask your administrator to publish one.',
        );
      }
      setConfigOpen(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save configuration');
    } finally {
      setCfgBusy(false);
    }
  }, [
    academicCalendar,
    adminOffers,
    cfgBusy,
    cfgLevel,
    cfgMode,
    cfgSelectedOfferId,
    cfgStudentId,
    cfgVariant,
    recommendedGroup,
    updateAcademicCalendar,
    updateProfile,
    user.universityId,
  ]);

  const monthLabel = useMemo(() => {
    const m = monthCursor.toLocaleString(undefined, { month: 'long' });
    return `${m} ${monthCursor.getFullYear()}`;
  }, [monthCursor]);

  const monthGrid = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const first = new Date(year, month, 1);
    const firstDow = first.getDay();
    const gridStart = new Date(year, month, 1 - firstDow);
    const days: { date: Date; iso: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ date: d, iso, inMonth: d.getMonth() === month });
    }
    return days;
  }, [monthCursor]);

  const filterMatches = useCallback((t: string): boolean => {
    const type = String(t || '');
    if (filter === 'all') return true;
    if (filter === 'registration') return type === 'registration';
    if (filter === 'lecture') return type === 'lecture';
    if (filter === 'break') return type === 'break' || type === 'special_break';
    return type === 'exam' || type === 'test' || type === 'revision';
  }, [filter]);

  const periodsForDay = useCallback((iso: string) => {
    const ss = String(iso).slice(0, 10);
    return periods.filter((p) => {
      if (!filterMatches(p.type)) return false;
      const a = String(p.startDate).slice(0, 10);
      const b = String(p.endDate).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) && ss >= a && ss <= b;
    });
  }, [periods, filterMatches]);

  const periodsForDayAll = useCallback((iso: string) => {
    const ss = String(iso).slice(0, 10);
    return periods.filter((p) => {
      const a = String(p.startDate).slice(0, 10);
      const b = String(p.endDate).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b) && ss >= a && ss <= b;
    });
  }, [periods]);

  const markerColorForType = useCallback((t: string): string => {
    const type = String(t || '');
    if (type === 'registration') return '#8b5cf6';
    if (type === 'lecture') return '#22c55e';
    if (type === 'exam' || type === 'test' || type === 'revision') return '#ef4444';
    if (type === 'break' || type === 'special_break') return '#22d3ee';
    return theme.textSecondary;
  }, [theme.textSecondary]);

  const markerBgForType = useCallback((t: string): string => {
    const type = String(t || '');
    if (type === 'registration') return 'rgba(139, 92, 246, 0.15)';
    if (type === 'lecture') return 'rgba(34, 197, 94, 0.15)';
    if (type === 'exam' || type === 'test' || type === 'revision') return 'rgba(239, 68, 68, 0.15)';
    if (type === 'break' || type === 'special_break') return 'rgba(34, 211, 238, 0.15)';
    return 'transparent';
  }, []);

  const categoryForType = useCallback((t: string): 'registration' | 'lecture' | 'exam' | 'break' | 'other' => {
    const type = String(t || '');
    if (type === 'registration') return 'registration';
    if (type === 'lecture') return 'lecture';
    if (type === 'break' || type === 'special_break') return 'break';
    if (type === 'exam' || type === 'test' || type === 'revision') return 'exam';
    return 'other';
  }, []);

  const primaryCategory = useCallback((hits: { type: string }[]): 'registration' | 'lecture' | 'exam' | 'break' | 'other' => {
    const cats = new Set(hits.map((h) => categoryForType(h.type)));
    if (cats.has('exam')) return 'exam';
    if (cats.has('break')) return 'break';
    if (cats.has('lecture')) return 'lecture';
    if (cats.has('registration')) return 'registration';
    return 'other';
  }, [categoryForType]);

  const splitLabel = useCallback((label: string) => {
    const parts = String(label || '').split('•').map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) return { tags: [parts[0]], text: parts.slice(1).join(' • ') };
    return { tags: [] as string[], text: String(label || '').trim() };
  }, []);

  const tagColor = useCallback((tag: string): string => {
    const t = tag.toLowerCase();
    if (t.includes('all') || t.includes('semua')) return '#3b82f6';
    if (t.includes('bachelor') || t.includes('sarjana muda')) return '#f97316';
    if (t.includes('pre-diploma') || t.includes('pra')) return '#ec4899';
    if (t.includes('diploma')) return '#06b6d4';
    if (t.includes('master') || t.includes('sarjana')) return '#a855f7';
    if (t.includes('phd') || t.includes('kedoktoran')) return '#14b8a6';
    return theme.textSecondary;
  }, [theme.textSecondary]);

  const selectedDayItems = useMemo(() => {
    if (!selectedDayISO) return [];
    return periodsForDayAll(selectedDayISO);
  }, [selectedDayISO, periodsForDayAll]);

  const selectedDayGrouped = useMemo(() => {
    const groupDefs: { id: 'registration' | 'lecture' | 'exam' | 'break' | 'other'; title: string }[] = [
      { id: 'registration', title: 'Registration' },
      { id: 'lecture', title: 'Lecture' },
      { id: 'exam', title: 'Examination' },
      { id: 'break', title: 'Break' },
      { id: 'other', title: 'Other' },
    ];
    const byCat = new Map<string, typeof selectedDayItems>();
    for (const g of groupDefs) byCat.set(g.id, []);
    for (const p of selectedDayItems) {
      const cat = categoryForType(p.type);
      const arr = byCat.get(cat);
      if (arr) arr.push(p);
    }
    return { groupDefs, byCat };
  }, [selectedDayItems, categoryForType]);

  const filterColors: Record<string, { dot: string; label: string }> = {
    registration: { dot: '#8b5cf6', label: 'Registration' },
    lecture: { dot: '#22c55e', label: 'Lecture' },
    exam: { dot: '#ef4444', label: 'Examination' },
    break: { dot: '#22d3ee', label: 'Break' },
  };

  return (
    <View style={s.safe}>
      <View style={[s.header, { paddingTop: Math.max(10, insets.top) }]}>
        <Pressable style={s.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>Academic calendar</Text>
          <Text style={s.sub} numberOfLines={2}>
            {user.universityId
              ? `${getUniversityById(user.universityId)?.shortName ?? user.university ?? ''} · `
              : 'Confirm university · '}
            {user.universityId === 'uitm' && group ? `Group ${group} · ` : ''}
            {progress.semesterPhase === 'before_start'
              ? 'Before semester'
              : progress.semesterPhase === 'break_after'
                ? 'Semester break'
                : `Week ${progress.week} of ${academicCalendar?.totalWeeks ?? 14}`}
          </Text>
        </View>
        <Pressable style={s.editBtn} onPress={() => setConfigOpen(true)} disabled={!user.universityId}>
          <Feather name="sliders" size={16} color={user.universityId ? theme.primary : theme.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}>
        {/* Legend */}
        <View style={s.legendRow}>
          {Object.entries(filterColors).map(([, v]) => (
            <View key={v.label} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: v.dot }]} />
              <Text style={[s.legendText, { color: theme.textSecondary }]}>{v.label}</Text>
            </View>
          ))}
        </View>

        {/* Filters */}
        <View style={s.filterRow}>
          {[
            { id: 'all', label: 'All' },
            { id: 'registration', label: 'Registration' },
            { id: 'lecture', label: 'Lecture' },
            { id: 'exam', label: 'Examination' },
            { id: 'break', label: 'Break' },
          ].map((opt) => (
            <Pressable
              key={opt.id}
              style={[
                s.filterChip,
                {
                  borderColor: filter === (opt.id as any) ? theme.primary : theme.border,
                  backgroundColor: filter === (opt.id as any) ? theme.primary : 'transparent',
                },
              ]}
              onPress={() => setFilter(opt.id as any)}
            >
              <Text style={[s.filterChipText, { color: filter === (opt.id as any) ? theme.textInverse : theme.text }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Month nav */}
        <View style={s.monthRow}>
          <Pressable onPress={() => setMonthCursor((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))} hitSlop={8}>
            <Feather name="chevron-left" size={22} color={theme.text} />
          </Pressable>
          <Text style={[s.monthTitle, { color: theme.text }]}>{monthLabel}</Text>
          <Pressable onPress={() => setMonthCursor((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))} hitSlop={8}>
            <Feather name="chevron-right" size={22} color={theme.text} />
          </Pressable>
        </View>

        {/* Day-of-week header */}
        <View
          style={s.dowRow}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (Number.isFinite(w) && w > 0) setGridWidth(w);
          }}
        >
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
            <Text
              key={`${d}-${i}`}
              style={[s.dowText, { color: theme.textSecondary, width: cellW }]}
              numberOfLines={1}
            >
              {d}
            </Text>
          ))}
        </View>

        {/* Grid */}
        <View style={s.grid}>
          {monthGrid.map((d) => {
            const dd = d.date.getDate();
            const isToday = d.iso === todayISO;
            const isSelected = d.iso === selectedDayISO;
            const hits = periodsForDay(d.iso);
            const cats = Array.from(new Set(hits.map((h) => categoryForType(h.type)))).filter((c) => c !== 'other');
            const dominant = hits.length > 0 ? primaryCategory(hits as any) : 'other';
            const bg =
              filter !== 'all'
                ? (hits.length > 0 ? markerBgForType(filter === 'break' ? 'break' : filter) : 'transparent')
                : (dominant === 'other' ? 'transparent' : markerBgForType(dominant));
            return (
              <Pressable
                key={d.iso}
                style={[
                  s.cell,
                  { width: cellW, height: cellW + 10 },
                  !d.inMonth && { opacity: 0.35 },
                  bg !== 'transparent' && { backgroundColor: bg },
                  isToday && { borderColor: theme.primary, borderWidth: 2 },
                  isSelected && { borderColor: theme.text, borderWidth: 2 },
                ]}
                onPress={() => setSelectedDayISO(d.iso)}
              >
                <Text style={[s.cellText, { color: isToday ? theme.primary : theme.text }]}>{dd}</Text>
                {cats.length > 0 ? (
                  <View style={s.dotRow}>
                    {cats.slice(0, 4).map((c) => (
                      <View key={c} style={[s.dot, { backgroundColor: markerColorForType(c) }]} />
                    ))}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {periods.length === 0 ? (
          <Text style={[s.empty, { marginTop: 12 }]}>
            {user.universityId
              ? user.universityId === 'uitm'
                ? 'No periods loaded yet. Open Semester configuration and Save to sync from HEA.'
                : 'No calendar segments yet. If your university publishes one in the app, open Semester configuration (sliders) and Save.'
              : 'Confirm your university above to load the correct official calendar.'}
          </Text>
        ) : null}

        {/* Inline day details (like bilauitmcuti hover panel) */}
        {selectedDayISO ? (
          <View style={[s.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[s.detailDate, { color: theme.text }]}>{selectedDayISO}</Text>
              <Pressable onPress={() => setSelectedDayISO('')} hitSlop={8}>
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Text style={[s.detailSub, { color: theme.textSecondary }]}>
              {selectedDayItems.length} event{selectedDayItems.length !== 1 ? 's' : ''}
            </Text>

            {selectedDayItems.length === 0 ? (
              <Text style={[s.empty, { marginTop: 8 }]}>No events on this date.</Text>
            ) : (
              selectedDayGrouped.groupDefs.map((g) => {
                const items = selectedDayGrouped.byCat.get(g.id) ?? [];
                if (items.length === 0) return null;
                return (
                  <View key={g.id} style={{ marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <View style={[s.catDot, { backgroundColor: markerColorForType(g.id) }]} />
                      <Text style={[s.catTitle, { color: theme.text }]}>
                        {g.title} ({items.length})
                      </Text>
                    </View>
                    {items.map((p, idx) => {
                      const { tags, text } = splitLabel(p.label || '');
                      return (
                        <View key={`${g.id}-${idx}`} style={s.eventRow}>
                          <View style={[s.eventDot, { backgroundColor: markerColorForType(p.type) }]} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            {tags.length > 0 ? (
                              <View style={s.tagRow}>
                                {tags.map((t) => (
                                  <View key={t} style={[s.tagChip, { borderColor: tagColor(t), backgroundColor: tagColor(t) + '18' }]}>
                                    <Text style={[s.tagText, { color: tagColor(t) }]}>{t}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                            <Text style={[s.eventTitle, { color: theme.text }]} numberOfLines={4}>
                              {text || String(p.type)}
                            </Text>
                            {p.startDate !== p.endDate ? (
                              <Text style={[s.eventSub, { color: theme.textSecondary }]}>
                                {String(p.startDate).slice(0, 10)} → {String(p.endDate).slice(0, 10)}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {syncStatus ? (
          <Text style={[s.syncText, { color: theme.textSecondary }]}>{syncStatus}</Text>
        ) : null}
      </ScrollView>

      {/* Config modal */}
      <Modal visible={configOpen} transparent animationType="fade" onRequestClose={() => setConfigOpen(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfigOpen(false)} />
          <View style={{ width: '100%', maxWidth: 360, marginTop: insets.top + 10 }}>
            <ScrollView
              style={[s.modalCard, { backgroundColor: theme.card, maxHeight: modalMaxH }]}
              contentContainerStyle={{ paddingBottom: 14 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Text style={[s.modalTitle, { color: theme.text }]}>Semester configuration</Text>
              <Text style={[s.modalSub, { color: theme.textSecondary }]}>
                {user.universityId === 'uitm'
                  ? 'Choose your level and study mode so we select the correct HEA calendar segment.'
                  : 'Official dates come from calendars published for your university. Student ID is optional — we use it when we can infer your intake from it.'}
              </Text>

              <View style={s.divider} />
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Student ID / matric</Text>
              <Text style={[s.modalSub, { color: theme.textSecondary }]}>
                Optional. Used when the app can infer your semester or year from your ID; if not, your selections still apply.
              </Text>
              <TextInput
                value={cfgStudentId}
                onChangeText={setCfgStudentId}
                placeholder="e.g. matric number"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
                style={[s.input, { marginTop: 8, borderColor: theme.border, color: theme.text, backgroundColor: theme.backgroundSecondary }]}
              />

              {user.universityId === 'uitm' ? (
                <>
              <View style={s.divider} />
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>State variant</Text>
              <Text style={[s.modalSub, { color: theme.textSecondary }]}>
                HEA shows a starred (*) date range for Kedah/Kelantan/Terengganu.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {([
                  { id: 'auto', label: 'Auto' },
                  { id: 'standard', label: 'Standard' },
                  { id: 'kkt', label: 'Kedah/Kelantan/Terengganu*' },
                ] as { id: UitmCalendarVariant; label: string }[]).map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={() => setCfgVariant(opt.id)}
                    style={[s.filterChip, { borderColor: theme.border, backgroundColor: cfgVariant === opt.id ? theme.primary : theme.card }]}
                  >
                    <Text style={[s.filterChipText, { color: cfgVariant === opt.id ? theme.textInverse : theme.text }]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
                </>
              ) : null}

              <View style={s.divider} />
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>
                {user.universityId === 'uitm' ? 'Program level' : 'Official calendar'}
              </Text>
              {user.universityId === 'uitm' ? (
                <>
                  <Text style={[s.modalSub, { color: theme.textSecondary }]}>
                    UiTM uses HEA groups: Foundation → Group A; other levels → Group B.
                  </Text>
                  {(['Foundation', 'Diploma', 'Bachelor', 'Master', 'PhD', 'Other'] as AcademicLevel[]).map((lvl) => (
                    <Pressable key={lvl} style={s.optRow} onPress={() => setCfgLevel(lvl)}>
                      <Feather name="check-circle" size={18} color={cfgLevel === lvl ? theme.primary : theme.textSecondary} />
                      <Text style={[s.optText, { color: theme.text }]}>{lvl}</Text>
                      <Text style={[s.optBadge, { color: theme.textSecondary }]}>{lvl === 'Foundation' ? 'Group A' : 'Group B'}</Text>
                    </Pressable>
                  ))}
                </>
              ) : offersLoading ? (
                <ActivityIndicator style={{ marginTop: 12 }} color={theme.primary} />
              ) : adminOffers.length === 0 ? (
                <Text style={[s.modalSub, { color: theme.textSecondary, marginTop: 8 }]}>
                  No calendars are published for this university yet. Save still updates study mode and student ID; ask your admin to publish calendars here.
                </Text>
              ) : (
                <>
                  <Text style={[s.modalSub, { color: theme.textSecondary }]}>
                    Only calendars published for your university are listed ({adminOffers.length} option{adminOffers.length !== 1 ? 's' : ''}).
                  </Text>
                  {adminOffers.map((o) => (
                    <Pressable
                      key={o.id}
                      style={s.optRow}
                      onPress={() => {
                        setCfgSelectedOfferId(o.id);
                        setCfgLevel(inferAcademicLevelFromOfferLabel(o.semesterLabel));
                      }}
                    >
                      <Feather
                        name="check-circle"
                        size={18}
                        color={cfgSelectedOfferId === o.id ? theme.primary : theme.textSecondary}
                      />
                      <Text style={[s.optText, { color: theme.text }]} numberOfLines={3}>
                        {o.semesterLabel}
                      </Text>
                    </Pressable>
                  ))}
                </>
              )}

              <View style={s.divider} />
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Study mode</Text>
              {(['Full-time', 'Part-time', 'Unknown'] as const).map((m) => (
                <Pressable key={m} style={s.optRow} onPress={() => setCfgMode(m)}>
                  <Feather name="check-circle" size={18} color={cfgMode === m ? theme.primary : theme.textSecondary} />
                  <Text style={[s.optText, { color: theme.text }]}>{m}</Text>
                </Pressable>
              ))}

              <View style={s.divider} />
              <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Align with current week</Text>
              <Text style={[s.modalSub, { color: theme.textSecondary }]}>
                If the week shown in the header does not match the week you are actually in, pick your real teaching week. This does not change lecture or exam dates — only which week number we show you.
              </Text>
              <Pressable
                style={[
                  s.saveBtn,
                  {
                    marginTop: 8,
                    backgroundColor: theme.card,
                    borderWidth: 1,
                    borderColor: theme.border,
                  },
                  (!academicCalendar?.startDate || cfgBusy) && { opacity: 0.45 },
                ]}
                onPress={openWeekAlignFromConfig}
                disabled={!academicCalendar?.startDate || cfgBusy}
              >
                <Text style={{ fontWeight: '800', color: theme.text }}>Open week alignment…</Text>
              </Pressable>

              <Pressable style={[s.saveBtn, { backgroundColor: theme.primary }, cfgBusy && { opacity: 0.85 }]} onPress={saveConfiguration} disabled={cfgBusy}>
                {cfgBusy ? <ActivityIndicator color={theme.textInverse} /> : <Text style={[s.saveBtnText, { color: theme.textInverse }]}>Save</Text>}
              </Pressable>

              <Pressable
                style={[
                  s.saveBtn,
                  {
                    marginTop: 10,
                    backgroundColor: theme.card,
                    borderWidth: 1,
                    borderColor: theme.border,
                  },
                ]}
                onPress={changeUniversity}
                disabled={cfgBusy}
              >
                <Text style={[s.saveBtnText, { color: theme.text }]}>Change university</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={uniGateOpen} animationType="slide" onRequestClose={() => {}}>
        <View style={[s.uniGateSafe, { paddingTop: insets.top + 12, backgroundColor: theme.background }]}>
          <Text style={[s.modalTitle, { color: theme.text, fontSize: 20 }]}>Confirm your university</Text>
          <Text style={[s.modalSub, { color: theme.textSecondary, marginTop: 8 }]}>
            We load your academic calendar from official sources: UiTM uses HEA; other universities use calendars published by your app administrator (for example UM).
          </Text>
          <TextInput
            value={uniSearch}
            onChangeText={setUniSearch}
            placeholder="Search university…"
            placeholderTextColor={theme.textSecondary}
            style={[s.uniSearchInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
          />
          {cfgBusy ? <ActivityIndicator style={{ marginTop: 16 }} color={theme.primary} /> : null}
          <FlatList
            data={uniSearchResults}
            keyExtractor={(item) => item.id}
            style={{ flex: 1, marginTop: 12 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={[s.uniRow, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={() => void onConfirmUniversity(item)}
                disabled={cfgBusy}
              >
                <Text style={{ fontSize: 20 }}>{item.logoEmoji ?? '🏫'}</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: theme.text, fontWeight: '800' }}>{item.shortName}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                    {item.name}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
            )}
          />
        </View>
      </Modal>

      <Modal visible={weekAlignOpen} transparent animationType="fade" onRequestClose={() => setWeekAlignOpen(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setWeekAlignOpen(false)} />
          <View
            style={[
              s.modalCard,
              {
                backgroundColor: theme.card,
                maxHeight: modalMaxH,
                paddingTop: 12,
                marginTop: insets.top + 40,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.modalTitle, { color: theme.text }]} numberOfLines={1}>
                  Align with current week
                </Text>
                <Text style={[s.modalSub, { color: theme.textSecondary }]} numberOfLines={3}>
                  Choose the teaching week you are in today. Dates stay the same; only the week number changes.
                </Text>
              </View>
              <Pressable
                onPress={() => setWeekAlignOpen(false)}
                hitSlop={10}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border }}
              >
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={{ maxHeight: 320, marginTop: 12 }}
              contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, columnGap: 10, paddingBottom: 2 }}
              showsVerticalScrollIndicator={false}
            >
              {Array.from({ length: Math.max(1, academicCalendar?.totalWeeks ?? 14) }, (_, i) => i + 1).map((n) => (
                <Pressable
                  key={n}
                  style={[
                    s.alignWeekBtn,
                    {
                      borderColor: theme.border,
                      backgroundColor: alignPickWeek === n ? theme.primary : theme.backgroundSecondary,
                    },
                  ]}
                  onPress={() => setAlignPickWeek(n)}
                >
                  <Text style={[s.alignWeekText, { color: alignPickWeek === n ? theme.textInverse : theme.text }]}>{n}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() => setWeekAlignOpen(false)}
                style={[
                  s.saveBtn,
                  {
                    flex: 1,
                    backgroundColor: theme.card,
                    borderWidth: 1,
                    borderColor: theme.border,
                    marginTop: 0,
                  },
                ]}
              >
                <Text style={{ fontWeight: '900', color: theme.text }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveWeekAlign()}
                disabled={alignBusy}
                style={[s.saveBtn, { flex: 1, backgroundColor: theme.primary, opacity: alignBusy ? 0.85 : 1, marginTop: 0 }]}
              >
                {alignBusy ? (
                  <ActivityIndicator color={theme.textInverse} />
                ) : (
                  <Text style={[s.saveBtnText, { color: theme.textInverse }]}>Apply</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function styles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    header: { paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontWeight: '900', color: theme.text, letterSpacing: -0.3 },
    sub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: theme.textSecondary },
    editBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    uniGateSafe: { flex: 1, paddingHorizontal: 16, paddingBottom: 16 },
    uniSearchInput: {
      marginTop: 12,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      fontSize: 15,
      fontWeight: '600',
    },
    uniRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 8,
    },

    legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8, marginBottom: 4 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 12, fontWeight: '700' },

    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 14 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
    filterChipText: { fontSize: 12, fontWeight: '800' },

    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 12 },
    monthTitle: { fontSize: 18, fontWeight: '900' },

    dowRow: { flexDirection: 'row', marginBottom: 6, justifyContent: 'space-between', columnGap: GRID_GAP },
    dowText: { textAlign: 'center', fontSize: 12, fontWeight: '800' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: GRID_GAP, rowGap: GRID_GAP },
    cell: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
    },
    cellText: { fontSize: 14, fontWeight: '900' },
    dotRow: { flexDirection: 'row', gap: 3, marginTop: 4 },
    dot: { width: 6, height: 6, borderRadius: 3 },

    empty: { fontSize: 13, lineHeight: 18, color: theme.textSecondary, fontWeight: '600' },
    syncText: { fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center' },

    detailCard: { marginTop: 16, borderRadius: 16, borderWidth: 1, padding: 16 },
    detailDate: { fontSize: 18, fontWeight: '900' },
    detailSub: { fontSize: 13, fontWeight: '700', marginTop: 2 },
    catDot: { width: 12, height: 12, borderRadius: 6 },
    catTitle: { fontSize: 14, fontWeight: '900' },
    eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
    eventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    eventTitle: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
    eventSub: { fontSize: 12, fontWeight: '600', marginTop: 3 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    tagChip: { borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    tagText: { fontSize: 11, fontWeight: '900' },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: 20, justifyContent: 'flex-start', alignItems: 'center' },
    modalCard: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
    modalTitle: { fontSize: 16, fontWeight: '900' },
    modalSub: { fontSize: 12, marginTop: 4, fontWeight: '600', lineHeight: 16 },
    divider: { height: 1, backgroundColor: theme.border, marginVertical: 14, opacity: 0.6 },
    fieldLabel: { fontSize: 12, fontWeight: '900', marginBottom: 4, letterSpacing: 0.4 },
    optRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
    optText: { flex: 1, fontSize: 14, fontWeight: '800' },
    optBadge: { fontSize: 12, fontWeight: '800' },
    input: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, fontWeight: '800' },
    inputSmall: { width: 70, height: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, fontWeight: '800', textAlign: 'center' },
    semGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 6 },
    semBtn: { width: 42, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    semText: { fontSize: 13, fontWeight: '900' },
    alignWeekBtn: {
      width: '18.4%',
      minWidth: 52,
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alignWeekText: { fontSize: 14, fontWeight: '900' },
    saveBtn: { marginTop: 14, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
    saveBtnText: { fontSize: 15, fontWeight: '900' },
  });
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState as RNAppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { currentUserId, scopedKey } from '@/src/lib/scopedStorage';
import {
  fetchAllCalendarOffersForUniversity,
  offerToCalendarPatch,
  type UniversityCalendarOffer,
} from '@/src/lib/universityCalendarOffersDb';
import { resolveUniversityIdForCalendar } from '@/src/lib/universities';
import { CalendarOfferOption } from '@/components/calendar/CalendarOfferOption';

/**
 * An applied calendar is a frozen copy — nothing moves a student to the next semester when the
 * old one ends, so planners quietly go stale and every week number, task bucket and reminder
 * drifts. 880 students were sitting on finished semesters when this was written.
 *
 * The database cannot fix that on its own: it does not record which semester a student is
 * actually taking, so a bulk migration has to guess, and guessing at that scale means hundreds of
 * wrong answers (short semesters handed to students on the regular one, and so on). Asking is
 * both correct and self-maintaining — it works for every future session too.
 */

/** Days after a semester ends before the prompt appears — exam resits and late marks run over. */
const STALE_GRACE_DAYS = 7;

const DISMISS_KEY = '@stale_calendar_dismissed_v1';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysSince(iso: string): number | null {
  const trimmed = String(iso ?? '').trim().slice(0, 10);
  if (!ISO_DATE.test(trimmed)) return null;
  const end = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - end.getTime()) / 864e5);
}

function isRunningToday(offer: UniversityCalendarOffer): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return offer.startDate <= today && today <= offer.endDate;
}

/**
 * Running semesters first, then the soonest to start. An offer with no timeline sinks to the
 * bottom — applying one leaves the planner as empty as the stale calendar it replaced.
 */
function sortForPicker(offers: UniversityCalendarOffer[]): UniversityCalendarOffer[] {
  return [...offers].sort((a, b) => {
    const aHasTimeline = (a.periods?.length ?? 0) > 0;
    const bHasTimeline = (b.periods?.length ?? 0) > 0;
    if (aHasTimeline !== bHasTimeline) return aHasTimeline ? -1 : 1;
    const aRunning = isRunningToday(a);
    const bRunning = isRunningToday(b);
    if (aRunning !== bRunning) return aRunning ? -1 : 1;
    return a.startDate.localeCompare(b.startDate);
  });
}

export function StaleCalendarPrompt() {
  const theme = useTheme();
  const { language, user, academicCalendar, updateAcademicCalendar } = useApp();
  const T = useTranslations(language);

  const [visible, setVisible] = useState(false);
  const [offers, setOffers] = useState<UniversityCalendarOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const endedISO = academicCalendar?.endDate ?? '';
  const staleDays = useMemo(() => daysSince(endedISO), [endedISO]);

  const universityId = useMemo(
    () =>
      resolveUniversityIdForCalendar({
        profileUniversityId: user.universityId,
        connectionUniversityId: undefined,
        studentId: user.studentId,
        universityName: user.university,
      }),
    [user.universityId, user.studentId, user.university],
  );

  const check = useCallback(async () => {
    // UiTM re-syncs itself from the HEA portal, so its students never go stale this way.
    if (!universityId || universityId === 'uitm') {
      setVisible(false);
      return;
    }
    if (!academicCalendar?.isActive || staleDays == null || staleDays <= STALE_GRACE_DAYS) {
      setVisible(false);
      return;
    }

    // A dismissal covers the calendar it was made for. Ending up on another finished semester
    // later is a new problem and asks again.
    const uid = await currentUserId();
    const dismissed = await AsyncStorage.getItem(scopedKey(DISMISS_KEY, uid)).catch(() => null);
    if (dismissed === endedISO) {
      setVisible(false);
      return;
    }

    setVisible(true);
    setLoading(true);
    try {
      const list = await fetchAllCalendarOffersForUniversity(universityId);
      setOffers(sortForPicker(list));
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [universityId, academicCalendar?.isActive, staleDays, endedISO]);

  useEffect(() => {
    // Matches ManualWeekPrompt: let any auto-applied calendar land before deciding.
    const timer = setTimeout(() => void check(), 2000);
    return () => clearTimeout(timer);
  }, [check]);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  const onDismiss = useCallback(async () => {
    setVisible(false);
    const uid = await currentUserId();
    await AsyncStorage.setItem(scopedKey(DISMISS_KEY, uid), endedISO).catch(() => {});
  }, [endedISO]);

  const onApply = useCallback(
    async (offer: UniversityCalendarOffer) => {
      setApplyingId(offer.id);
      try {
        await updateAcademicCalendar({
          ...offerToCalendarPatch(offer),
          teachingWeekOffset: 0,
          isActive: true,
        });
        setVisible(false);
      } catch (e) {
        Alert.alert(T('calendarOfferError'), e instanceof Error ? e.message : String(e));
      } finally {
        setApplyingId(null);
      }
    },
    [updateAcademicCalendar, T],
  );

  const onAddOwn = useCallback(async () => {
    await onDismiss();
    router.push('/add-academic-calendar');
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{T('staleCalendarTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{T('staleCalendarBody')}</Text>

          <View style={[styles.block, { backgroundColor: theme.backgroundSecondary }]}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>{T('staleCalendarEnded')}</Text>
            <Text style={[styles.value, { color: theme.text }]}>
              {academicCalendar?.semesterLabel || '—'}
            </Text>
            <Text style={[styles.meta, { color: theme.textSecondary }]}>{endedISO}</Text>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : offers.length === 0 ? (
            <Text style={[styles.none, { color: theme.textSecondary }]}>{T('staleCalendarNone')}</Text>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                {T('staleCalendarChoose')}
              </Text>
              <ScrollView style={styles.list}>
                {offers.map((offer) => (
                  <CalendarOfferOption
                    key={offer.id}
                    offer={offer}
                    selected={applyingId === offer.id}
                    onSelect={() => {
                      if (applyingId == null) void onApply(offer);
                    }}
                  />
                ))}
              </ScrollView>
            </>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={() => void onDismiss()}
              disabled={applyingId != null}
              style={({ pressed }) => [
                styles.btnSecondary,
                { borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.btnSecondaryText, { color: theme.text }]}>
                {T('calendarOfferLater')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void onAddOwn()}
              disabled={applyingId != null}
              style={({ pressed }) => [
                styles.btnPrimary,
                { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={[styles.btnPrimaryText, { color: theme.textInverse }]}>
                {T('staleCalendarAdd')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 24,
    padding: 22,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '85%',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  body: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  block: {
    marginTop: 16,
    borderRadius: 16,
    padding: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLabel: {
    marginTop: 18,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  list: {
    marginTop: 10,
    flexGrow: 0,
  },
  loading: {
    marginTop: 22,
    alignItems: 'center',
  },
  none: {
    marginTop: 18,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '800',
  },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { supabase } from '@/src/lib/supabase';
import {
  fetchPendingCalendarOffer,
  offerToCalendarPatch,
  recordCalendarOfferResponse,
  type UniversityCalendarOffer,
} from '@/src/lib/universityCalendarOffersDb';
import { resolveUniversityIdForCalendar } from '@/src/lib/universities';
import { AppState as RNAppState } from 'react-native';

export function CalendarOfferPrompt() {
  const theme = useTheme();
  const { language, user, updateAcademicCalendar, timetable } = useApp();
  const T = useTranslations(language);
  const [offer, setOffer] = useState<UniversityCalendarOffer | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) {
      setOffer(null);
      return;
    }
    const uniId = resolveUniversityIdForCalendar({
      profileUniversityId: user.universityId,
      connectionUniversityId: undefined,
      studentId: user.studentId,
      universityName: user.university,
    });
    try {
      const next = await fetchPendingCalendarOffer({ userId: uid, universityId: uniId });
      setOffer(next);
    } catch {
      setOffer(null);
    }
  }, [user.universityId, user.studentId, user.university]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const openUrl = (url: string) => {
    const u = url.trim();
    if (!u) return;
    Linking.openURL(u).catch(() => {});
  };

  const onDismiss = async () => {
    if (!offer) return;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    setBusy(true);
    try {
      await recordCalendarOfferResponse({ userId: uid, offerId: offer.id, status: 'dismissed' });
      setOffer(null);
    } catch (e) {
      Alert.alert(T('calendarOfferError'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onAccept = async () => {
    if (!offer) return;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    setBusy(true);
    try {
      await updateAcademicCalendar(offerToCalendarPatch(offer));
      await recordCalendarOfferResponse({ userId: uid, offerId: offer.id, status: 'accepted' });
      setOffer(null);
    } catch (e) {
      Alert.alert(T('calendarOfferError'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!offer) return null;

  const dateLine = `${offer.startDate} → ${offer.endDate}`;
  const hasTimetable = (timetable?.length ?? 0) > 0;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{T('calendarOfferTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{T('calendarOfferBody')}</Text>

          <View style={[styles.block, { backgroundColor: theme.backgroundSecondary }]}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>{T('calendarOfferSemester')}</Text>
            <Text style={[styles.value, { color: theme.text }]}>{offer.semesterLabel}</Text>
            <Text style={[styles.label, { color: theme.textSecondary, marginTop: 10 }]}>{T('calendarOfferDates')}</Text>
            <Text style={[styles.value, { color: theme.text }]}>{dateLine}</Text>
            <Text style={[styles.meta, { color: theme.textSecondary }]}>
              {T('calendarOfferWeeks')} {offer.totalWeeks}
            </Text>
          </View>

          {offer.adminNote ? (
            <Text style={[styles.note, { color: theme.textSecondary }]}>
              <Text style={{ fontWeight: '700', color: theme.text }}>{T('calendarOfferAdminNote')} </Text>
              {offer.adminNote}
            </Text>
          ) : null}

          {hasTimetable ? (
            <Text style={[styles.warn, { color: theme.textSecondary }]}>{T('calendarOfferTimetableHint')}</Text>
          ) : null}

          <View style={styles.links}>
            {offer.officialUrl ? (
              <Pressable
                onPress={() => openUrl(offer.officialUrl!)}
                style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.75 : 1 }]}
              >
                <Text style={[styles.linkText, { color: theme.primary }]}>{T('calendarOfferOpenLink')}</Text>
              </Pressable>
            ) : null}
            {offer.referencePdfUrl ? (
              <Pressable
                onPress={() => openUrl(offer.referencePdfUrl!)}
                style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.75 : 1 }]}
              >
                <Text style={[styles.linkText, { color: theme.primary }]}>{T('calendarOfferOpenPdf')}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={onDismiss}
              disabled={busy}
              style={({ pressed }) => [
                styles.btnSecondary,
                { borderColor: theme.border, opacity: busy ? 0.5 : pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.btnSecondaryText, { color: theme.text }]}>{T('calendarOfferLater')}</Text>
            </Pressable>
            <Pressable
              onPress={onAccept}
              disabled={busy}
              style={({ pressed }) => [
                styles.btnPrimary,
                { backgroundColor: theme.primary, opacity: busy ? 0.5 : pressed ? 0.9 : 1 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={theme.textInverse} />
              ) : (
                <Text style={[styles.btnPrimaryText, { color: theme.textInverse }]}>{T('calendarOfferApply')}</Text>
              )}
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
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  note: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 20,
  },
  warn: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  links: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  linkBtn: {
    paddingVertical: 6,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '700',
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

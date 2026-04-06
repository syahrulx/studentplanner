import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { resolveUniversityIdForCalendar } from '@/src/lib/universities';

const WEEK_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

/**
 * Shown to non-UiTM students whose university has no admin-configured calendar.
 * Asks "What week of the semester are you in?" and back-calculates a start date
 * so that future weeks auto-increment every 7 days.
 */
export function ManualWeekPrompt() {
  const theme = useTheme();
  const { language, user, academicCalendar, updateAcademicCalendar } = useApp();
  const T = useTranslations(language);
  const [visible, setVisible] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [busy, setBusy] = useState(false);

  const checkShouldShow = useCallback(() => {
    // Don't show if user already has a calendar configured
    if (academicCalendar && academicCalendar.startDate && academicCalendar.isActive) {
      setVisible(false);
      return;
    }

    // Don't show if semester phase is not 'no_calendar'
    if (user.semesterPhase && user.semesterPhase !== 'no_calendar') {
      setVisible(false);
      return;
    }

    // Resolve the university ID
    const uniId = resolveUniversityIdForCalendar({
      profileUniversityId: user.universityId,
      connectionUniversityId: undefined,
      studentId: user.studentId,
      universityName: user.university,
    });

    // Only show for non-UiTM students (UiTM uses portal auto-sync)
    if (!uniId || uniId === 'uitm') {
      setVisible(false);
      return;
    }

    // Show the manual week prompt
    setVisible(true);
  }, [
    academicCalendar,
    user.semesterPhase,
    user.universityId,
    user.studentId,
    user.university,
  ]);

  useEffect(() => {
    // Delay the check slightly so auto-loaded admin calendars have time to apply
    const timer = setTimeout(checkShouldShow, 2000);
    return () => clearTimeout(timer);
  }, [checkShouldShow]);

  const onSave = async () => {
    setBusy(true);
    try {
      // Back-calculate startDate from the selected week
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - (selectedWeek - 1) * 7);

      // Snap to Sunday (start of week)
      const dow = startDate.getDay();
      if (dow !== 0) {
        startDate.setDate(startDate.getDate() - dow);
      }

      const totalWeeks = 14;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + totalWeeks * 7 - 1);

      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      await updateAcademicCalendar({
        semesterLabel: T('manualCalendarLabel') || 'Manual calendar',
        startDate: fmtDate(startDate),
        endDate: fmtDate(endDate),
        totalWeeks,
        isActive: true,
      });

      setVisible(false);
    } catch (e) {
      Alert.alert(
        T('error') || 'Error',
        e instanceof Error ? e.message : 'Could not save',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            {T('manualWeekTitle') || 'What week are you in?'}
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {T('manualWeekBody') ||
              'Your university calendar hasn\'t been configured yet. Tell us your current semester week and we\'ll track it from here.'}
          </Text>

          <View style={styles.weekGrid}>
            {WEEK_OPTIONS.map((w) => (
              <Pressable
                key={w}
                onPress={() => setSelectedWeek(w)}
                style={[
                  styles.weekBtn,
                  {
                    borderColor:
                      selectedWeek === w ? theme.primary : theme.border,
                    backgroundColor:
                      selectedWeek === w ? theme.primary : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.weekBtnText,
                    {
                      color:
                        selectedWeek === w ? theme.textInverse : theme.text,
                    },
                  ]}
                >
                  {w}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {T('manualWeekHint') ||
              'Select your current week number. The system will automatically advance each week.'}
          </Text>

          <View style={styles.actions}>
            <Pressable
              onPress={() => setVisible(false)}
              style={({ pressed }) => [
                styles.btnSecondary,
                {
                  borderColor: theme.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.btnSecondaryText, { color: theme.text }]}>
                {T('later') || 'Later'}
              </Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={busy}
              style={({ pressed }) => [
                styles.btnPrimary,
                {
                  backgroundColor: theme.primary,
                  opacity: busy ? 0.5 : pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text
                style={[styles.btnPrimaryText, { color: theme.textInverse }]}
              >
                {busy
                  ? '...'
                  : T('manualWeekSave') || `Set Week ${selectedWeek}`}
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
  weekGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
    justifyContent: 'center',
  },
  weekBtn: {
    width: 48,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekBtnText: {
    fontSize: 16,
    fontWeight: '900',
  },
  hint: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
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

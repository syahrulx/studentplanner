import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { getNotificationPrefs, setNotificationPrefs, type NotificationPrefs } from '@/src/storage';
import { useTheme, useThemePack } from '@/hooks/useTheme';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';
import { supabase } from '@/src/lib/supabase';
import { rescheduleAllTaskNotifications } from '@/src/notificationManager';
import { rescheduleAttendanceNotifications } from '@/src/attendanceNotifications';

const PAD = 20;
const RADIUS = 14;

export default function NotificationSettings() {
  const { language, tasks, timetable } = useApp();
  const theme = useTheme();
  const themePack = useThemePack();
  const isMonoTheme = themePack === 'mono';
  const switchTrackOff = isMonoTheme ? '#262626' : theme.border;
  const switchTrackOn = isMonoTheme ? '#525252' : theme.primary;
  const switchThumb = isMonoTheme ? '#ffffff' : undefined;
  const monoIconBg = '#1f1f1f';
  const monoIconFg = '#f5f5f5';
  const themedIconBg = (color: string) => (isMonoTheme ? monoIconBg : color);
  const themedIconFg = (color: string) => (isMonoTheme ? monoIconFg : color);
  const T = useTranslations(language);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);
  const [focusPrefExpanded, setFocusPrefExpanded] = useState(false);

  useEffect(() => {
    getNotificationPrefs().then(setNotifPrefs);
  }, []);

  const updateNotifPref = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      setNotifPrefs((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        setNotificationPrefs(next).catch(() => {});

        if (
          'tasksEnabled' in patch ||
          'taskLeadDays' in patch ||
          'taskOverdueEnabled' in patch
        ) {
          rescheduleAllTaskNotifications(tasks).catch(() => {});
        }
        if ('attendanceCheckinPopup' in patch) {
          void supabase.auth.getSession().then(({ data: { session } }) => {
            const uid = session?.user?.id;
            if (!uid) return;
            rescheduleAttendanceNotifications(uid, timetable).catch(() => {});
          });
        }
        return next;
      });
    },
    [tasks, timetable],
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="chevron-left" size={28} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.titleWrap}>
        <Text style={[styles.largeTitle, { color: theme.text }]}>Notifications</Text>
      </View>

      {notifPrefs ? (
        <>
          <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
            <View style={styles.menuRow}>
              <View style={[styles.iconBox, { backgroundColor: themedIconBg('#3b82f6') }]}>
                <Feather name="bell" size={18} color={themedIconFg('#fff')} />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.menuLabel, { color: theme.text }]}>Task Reminders</Text>
                {!notifPrefs.tasksEnabled ? (
                  <Text style={[styles.notifRowFootnote, { color: theme.textSecondary }]} numberOfLines={1}>
                    Alerts before due dates
                  </Text>
                ) : null}
              </View>
              <Switch
                value={notifPrefs.tasksEnabled}
                onValueChange={(v) => updateNotifPref({ tasksEnabled: v })}
                trackColor={{ false: switchTrackOff, true: switchTrackOn }}
                thumbColor={switchThumb}
                ios_backgroundColor={switchTrackOff}
              />
            </View>

            {notifPrefs.tasksEnabled ? (
              <View style={[styles.notifInset, { backgroundColor: theme.backgroundSecondary }]}>
                <Text style={[styles.notifInsetCaption, { color: theme.textSecondary }]}>Before due date</Text>
                <View style={styles.notifChipWrap}>
                  {[3, 1, 0].map((d) => {
                    const active = notifPrefs.taskLeadDays.includes(d);
                    const label = d === 0 ? 'Due day' : d === 1 ? '1 day' : '3 days';
                    return (
                      <Pressable
                        key={d}
                        onPress={() => {
                          const next = active
                            ? notifPrefs.taskLeadDays.filter((x) => x !== d)
                            : [...notifPrefs.taskLeadDays, d].sort((a, b) => b - a);
                          if (next.length > 0) updateNotifPref({ taskLeadDays: next });
                        }}
                        style={[
                          styles.notifChip,
                          {
                            borderColor: active ? theme.primary : theme.border,
                            backgroundColor: active ? theme.primary + '22' : theme.card,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.notifChipText,
                            { color: active ? theme.primary : theme.text, fontWeight: active ? '600' : '500' },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View
                  style={{
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: theme.border,
                    marginTop: 14,
                    marginBottom: 4,
                  }}
                />
                <Text style={[styles.notifInsetCaption, { color: theme.textSecondary, marginBottom: 8 }]}>
                  After due date
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.menuLabel, { color: theme.text }]}>Overdue alert</Text>
                    <Text style={[styles.notifRowFootnote, { color: theme.textSecondary, marginTop: 2 }]}>
                      After the due date and time if still not done
                    </Text>
                  </View>
                  <Switch
                    value={notifPrefs.taskOverdueEnabled}
                    onValueChange={(v) => updateNotifPref({ taskOverdueEnabled: v })}
                    trackColor={{ false: switchTrackOff, true: switchTrackOn }}
                    thumbColor={switchThumb}
                    ios_backgroundColor={switchTrackOff}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.dividerList} />

            <View style={styles.menuRow}>
              <View style={[styles.iconBox, { backgroundColor: themedIconBg('#10b981') }]}>
                <Feather name="clock" size={18} color={themedIconFg('#fff')} />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.menuLabel, { color: theme.text }]}>Study Timer</Text>
                <Text style={[styles.notifRowFootnote, { color: theme.textSecondary }]} numberOfLines={1}>
                  When a focus session ends
                </Text>
              </View>
              <Switch
                value={notifPrefs.studyTimerEnabled}
                onValueChange={(v) => updateNotifPref({ studyTimerEnabled: v })}
                trackColor={{ false: switchTrackOff, true: switchTrackOn }}
                thumbColor={switchThumb}
                ios_backgroundColor={switchTrackOff}
              />
            </View>

            <View style={styles.dividerList} />

            <View style={styles.menuRow}>
              <View style={[styles.iconBox, { backgroundColor: themedIconBg('#4285f4') }]}>
                <Feather name="download-cloud" size={18} color={themedIconFg('#fff')} />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.menuLabel, { color: theme.text }]}>Classroom Sync</Text>
                <Text style={[styles.notifRowFootnote, { color: theme.textSecondary }]} numberOfLines={1}>
                  New work from Google Classroom
                </Text>
              </View>
              <Switch
                value={notifPrefs.classroomSyncEnabled}
                onValueChange={(v) => updateNotifPref({ classroomSyncEnabled: v })}
                trackColor={{ false: switchTrackOff, true: switchTrackOn }}
                thumbColor={switchThumb}
                ios_backgroundColor={switchTrackOff}
              />
            </View>

            <View style={styles.dividerList} />

            <View style={styles.menuRow}>
              <View style={[styles.iconBox, { backgroundColor: themedIconBg('#f59e0b') }]}>
                <Feather name="users" size={18} color={themedIconFg('#fff')} />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.menuLabel, { color: theme.text }]}>Shared Tasks</Text>
                <Text style={[styles.notifRowFootnote, { color: theme.textSecondary }]} numberOfLines={1}>
                  When someone shares a task with you
                </Text>
              </View>
              <Switch
                value={notifPrefs.sharedTasksEnabled}
                onValueChange={(v) => updateNotifPref({ sharedTasksEnabled: v })}
                trackColor={{ false: switchTrackOff, true: switchTrackOn }}
                thumbColor={switchThumb}
                ios_backgroundColor={switchTrackOff}
              />
            </View>

            <View style={styles.dividerList} />

            <View style={styles.menuRow}>
              <View style={[styles.iconBox, { backgroundColor: themedIconBg('#ef4444') }]}>
                <Feather name="check-square" size={18} color={themedIconFg('#fff')} />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.menuLabel, { color: theme.text }]}>Class Check-in Popup</Text>
                <Text style={[styles.notifRowFootnote, { color: theme.textSecondary }]} numberOfLines={2}>
                  {notifPrefs.attendanceCheckinPopup
                    ? 'Banner 5 minutes before class — turn off to stay quiet.'
                    : 'Silent — still appears in the in-app Notification Manager.'}
                </Text>
              </View>
              <Switch
                value={notifPrefs.attendanceCheckinPopup}
                onValueChange={(v) => updateNotifPref({ attendanceCheckinPopup: v })}
                trackColor={{ false: switchTrackOff, true: switchTrackOn }}
                thumbColor={switchThumb}
                ios_backgroundColor={switchTrackOff}
              />
            </View>
          </View>

          <View style={[styles.cardGroup, { backgroundColor: theme.card, marginTop: 16 }]}>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
              onPress={() => setFocusPrefExpanded(!focusPrefExpanded)}
            >
              <View style={[styles.iconBox, { backgroundColor: themedIconBg('#f43f5e') }]}>
                <Feather name="target" size={18} color={themedIconFg('#fff')} />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.menuLabel, { color: theme.text }]}>Today's Focus</Text>
                <Text style={[styles.notifRowFootnote, { color: theme.primary }]} numberOfLines={1}>
                  {notifPrefs.todaysFocusPref === 'all' ? 'Everything' : notifPrefs.todaysFocusPref === 'task' ? 'Tasks Only' : notifPrefs.todaysFocusPref === 'study' ? 'Study Time Only' : 'Exams Only'}
                </Text>
              </View>
              <Feather name={focusPrefExpanded ? "chevron-up" : "chevron-down"} size={20} color={theme.textSecondary} />
            </Pressable>

            {focusPrefExpanded ? (
              <View style={[styles.notifInset, { backgroundColor: theme.backgroundSecondary }]}>
                <Text style={[styles.notifInsetCaption, { color: theme.textSecondary }]}>Show on Home Screen</Text>
                <View style={{ flexDirection: 'column', gap: 16, marginTop: 12 }}>
                  {[
                    { id: 'all', label: 'Everything (Default)', desc: 'Tasks, study, and exams based on priority' },
                    { id: 'task', label: 'Tasks Only', desc: 'Prioritize assignments, quizzes, and labs' },
                    { id: 'exam', label: 'Exams Only', desc: 'Prioritize tests and exams' },
                    { id: 'study', label: 'Study Time Only', desc: 'Prioritize revision sessions' }
                  ].map((opt) => (
                    <Pressable
                      key={opt.id}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                      onPress={() => {
                        updateNotifPref({ todaysFocusPref: opt.id as any });
                        setFocusPrefExpanded(false);
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text }}>{opt.label}</Text>
                        <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}>{opt.desc}</Text>
                      </View>
                      {notifPrefs.todaysFocusPref === opt.id && (
                        <Feather name="check" size={20} color={theme.primary} />
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <Text style={[styles.notifSectionHint, { color: theme.textSecondary }]}>
            Allow notifications for Rencana in system Settings if alerts are muted.
          </Text>
        </>
      ) : (
        <View style={[styles.cardGroup, { backgroundColor: theme.card, paddingVertical: 24, alignItems: 'center' }]}>
          <ActivityIndicator color={theme.primary} />
        </View>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 56 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backText: { fontSize: 17, fontWeight: '500', marginLeft: -4 },
  titleWrap: {
    paddingHorizontal: PAD,
    marginBottom: 24,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  cardGroup: {
    marginHorizontal: PAD,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '400' },
  notifRowFootnote: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
    opacity: 0.85,
  },
  notifInset: {
    marginHorizontal: 12,
    marginBottom: 10,
    marginTop: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
  },
  notifInsetCaption: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  notifChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  notifChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notifChipText: {
    fontSize: 14,
  },
  notifSectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: PAD + 4,
    marginTop: 14,
    marginBottom: 4,
  },
  dividerList: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(150,150,150,0.2)', marginLeft: 52 },
});

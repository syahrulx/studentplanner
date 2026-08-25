import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { getNotificationPrefs, setNotificationPrefs, type NotificationPrefs } from '@/src/storage';
import { captureError } from '@/src/lib/monitoring';
import { useClassroomSync } from '@/hooks/useClassroomSync';
import { useTheme, useThemePack } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import Feather from '@expo/vector-icons/Feather';
import type { ThemeIconKey } from '@/constants/ThemeIcons';
import { THEME_DISPLAY_ICON_KEY } from '@/constants/ThemeIcons';
import { THEME_IDS, THEMES, type ThemeId } from '@/constants/Themes';
import { useTranslations } from '@/src/i18n';
import { supabase } from '@/src/lib/supabase';
import { isTaskPastDueNow } from '@/src/utils/date';

const PAD = 20;
const RADIUS = 14;

const THEME_LABEL_KEY: Record<
  ThemeId,
  | 'themeOptionLight'
  | 'themeOptionDark'
  | 'themeOptionBlush'
  | 'themeOptionMidnight'
  | 'themeOptionEmerald'
> = {
  light: 'themeOptionLight',
  dark: 'themeOptionDark',
  blush: 'themeOptionBlush',
  midnight: 'themeOptionMidnight',
  emerald: 'themeOptionEmerald',
};

export default function Settings() {
  const {
    user,
    language,
    theme: themeId,
    setTheme,
    setTasks,
    tasks,
    timetable,
    autoDeletePastTasks,
    setAutoDeletePastTasks,
  } = useApp();
  const theme = useTheme();
  const themePack = useThemePack();
  const isCatTheme = themePack === 'cat';
  const isMonoTheme = themePack === 'mono';
  const switchTrackOff = isMonoTheme ? '#262626' : theme.border;
  const switchTrackOn = isMonoTheme ? '#525252' : theme.primary;
  const switchThumb = isMonoTheme ? '#ffffff' : undefined;
  const monoIconBg = '#1f1f1f';
  const monoIconFg = '#f5f5f5';
  const themedIconBg = (color: string) => (isMonoTheme ? monoIconBg : color);
  const themedIconFg = (color: string) => (isMonoTheme ? monoIconFg : color);
  const T = useTranslations(language);

  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [focusPrefExpanded, setFocusPrefExpanded] = useState(false);

  /** Logged-in email from Supabase auth (shown in Android GC notice). */
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user email for the Android Classroom notice
    if (Platform.OS === 'android') {
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.email) setUserEmail(data.user.email);
      });
    }
  }, []);

  const {
    classroomPrefs,
    classroomLoading,
    refreshPrefs,
    isClassroomLinked,
    openClassroomSetup,
    formatClassroomLastSync,
    runSync: runClassroomSync,
    isSyncing: isClassroomSyncing,
  } = useClassroomSync(user.startDate, setTasks);

  useFocusEffect(
    useCallback(() => {
      void refreshPrefs();
    }, [refreshPrefs]),
  );

  const handleClassroomDisconnect = () => {
    Alert.alert(T('settingsClassroomDisconnectTitle'), T('settingsClassroomDisconnectBody'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('settingsClassroomDisconnectConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { disconnectClassroom } = require('@/src/lib/googleClassroom');
            await disconnectClassroom();
            await refreshPrefs();
            Alert.alert(T('settingsClassroomDisconnectedTitle'), T('settingsClassroomDisconnectedBody'));
          } catch {
            Alert.alert(T('settingsDisconnectFailTitle'), T('commTryAgainShort'));
          }
        },
      },
    ]);
  };

  const handleAutoDeletePastTasksToggle = (enable: boolean) => {
    if (!enable) {
      void setAutoDeletePastTasks(false);
      return;
    }
    const pastCount = tasks.filter(isTaskPastDueNow).length;
    if (pastCount === 0) {
      void setAutoDeletePastTasks(true);
      return;
    }
    Alert.alert(
      T('autoDeletePastTasksConfirmTitle'),
      T('autoDeletePastTasksConfirmBody').replace('{count}', String(pastCount)),
      [
        { text: T('cancel'), style: 'cancel' },
        {
          text: T('autoDeletePastTasksConfirmAction'),
          style: 'destructive',
          onPress: () => void setAutoDeletePastTasks(true),
        },
      ],
    );
  };

  const profileClassroomItems: {
    icon: ThemeIconKey;
    label: string;
    onPress: () => void;
    color: string;
    subtitle?: string;
    disabled?: boolean;
  }[] = isClassroomLinked
    ? [
        {
          icon: 'settings' as ThemeIconKey,
          label: isClassroomSyncing ? 'Syncing…' : 'Sync Classroom Now',
          subtitle: `${classroomPrefs!.selectedCourseIds.length} courses on auto-sync\nLast: ${formatClassroomLastSync(classroomPrefs!.lastSyncAt)}`,
          onPress: () => void runClassroomSync(),
          color: '#4285f4',
          disabled: isClassroomSyncing,
        },
        {
          icon: 'settings' as ThemeIconKey,
          label: 'Manage Courses',
          subtitle: 'Change which courses to auto-sync',
          onPress: () => router.push('/classroom-sync' as any),
          color: '#fbbc05',
        },
        {
          icon: 'settings' as ThemeIconKey,
          label: 'Disconnect Classroom',
          onPress: handleClassroomDisconnect,
          color: '#ef4444',
        },
      ]
    : [
        {
          icon: 'settings' as ThemeIconKey,
          label: 'Auto-sync Google Classroom',
          subtitle: 'Link account to pull assignments automatically',
          onPress: openClassroomSetup,
          color: '#4285f4',
        },
      ];

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isCatTheme ? (
          <View style={catDecor.wrap} pointerEvents="none">
            <View style={[catDecor.bubble, catDecor.bubbleA]} />
            <View style={[catDecor.bubble, catDecor.bubbleB]} />
            <Text style={[catDecor.paw, catDecor.pawA]}>🐾</Text>
            <Text style={[catDecor.paw, catDecor.pawB]}>🐾</Text>
          </View>
        ) : null}
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
          <Text style={[styles.largeTitle, { color: theme.text }]}>Settings</Text>
          {isCatTheme ? (
            <Text style={[styles.catBadge, { color: theme.primary }]}>Cat mode active</Text>
          ) : null}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('planSection').toUpperCase()}
        </Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/subscription-plans' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#eab308') }]}>
              <Feather name="zap" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text, fontWeight: '700' }]}>Rencana Premium</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                {user.subscriptionPlan === 'pro'
                  ? 'Active: Pro tier with highest AI limits.'
                  : user.subscriptionPlan === 'plus'
                    ? 'Active: Plus tier with daily study snaps.'
                    : 'Manage plan, unlock AI limits & custom themes.'}
              </Text>
            </View>
            <View
              style={{
                backgroundColor:
                  user.subscriptionPlan === 'pro'
                    ? '#eab308'
                    : user.subscriptionPlan === 'plus'
                      ? '#3b82f6'
                      : theme.backgroundSecondary,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                marginRight: 8,
                borderWidth: user.subscriptionPlan === 'free' ? 1 : 0,
                borderColor: theme.border,
              }}
            >
              <Text
                style={{
                  color:
                    user.subscriptionPlan === 'pro' || user.subscriptionPlan === 'plus'
                      ? '#fff'
                      : theme.textSecondary,
                  fontSize: 11,
                  fontWeight: '800',
                  textTransform: 'uppercase',
                }}
              >
                {user.subscriptionPlan || 'FREE'}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/free-premium' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#10b981') }]}>
              <Feather name="gift" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text, fontWeight: '700' }]}>Get Premium for free</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                Post about Rencana, earn free Plus days.
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('semesterConfig').toUpperCase()}
        </Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/academic-calendar' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#e0e7ff') }]}>
              <ThemeIcon name="calendar" size={18} color={themedIconFg('#4f46e5')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>{T('academicCalendar')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>
                Group A: Foundation/Professional • Group B: Diploma/Bachelor/Master/PhD
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/upload-sow' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#fef3c7') }]}>
              <Feather name="trending-up" size={18} color={themedIconFg('#d97706')} />
            </View>
            <Text style={[styles.menuLabel, { color: theme.text }]}>{T('configWorkload')}</Text>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('appearanceSection').toUpperCase()}
        </Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => setThemePickerOpen(true)}
          >
            <View style={[styles.iconBox, { backgroundColor: theme.accent3 }]}>
              <ThemeIcon name="sparkles" size={18} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>{T('themeAppearance')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                {T(THEME_LABEL_KEY[themeId])}
              </Text>
            </View>
            <Feather name="chevron-down" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/in-app-themes' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#f59e0b') }]}>
              <Feather name="award" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Premium Themes</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                Unlock premium theme packs (1-week free trial available)
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/custom-theme' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#ec4899') }]}>
              <Feather name="edit-3" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Custom Theme (Pro)</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                Build your own aesthetic with custom colors
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/subject-colors' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#3b82f6') }]}>
              <Feather name="droplet" size={18} color={themedIconFg('#fff')} />
            </View>
            <Text style={[styles.menuLabel, { color: theme.text }]}>{T('subjectColours')}</Text>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('notificationsSection').toUpperCase()}
        </Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/notification-settings' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#f43f5e') }]}>
              <Feather name="bell" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Notifications</Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          {Platform.OS === 'ios' ? (
            <>
              <View style={styles.dividerList} />
              <Pressable
                style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
                onPress={() => router.push('/live-activities' as any)}
              >
                <View style={[styles.iconBox, { backgroundColor: themedIconBg('#0ea5e9') }]}>
                  <Feather name="activity" size={18} color={themedIconFg('#fff')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuLabel, { color: theme.text }]}>{T('liveActivitiesTitle')}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
            </>
          ) : null}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('plannerSection').toUpperCase()}
        </Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/week-start-preference' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#0ea5e9') }]}>
              <Feather name="calendar" size={18} color={themedIconFg('#fff')} />
            </View>
            <Text style={[styles.menuLabel, { color: theme.text }]}>{T('weekStartPref')}</Text>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/stress-map' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#ec4899') }]}>
              <ThemeIcon name="stressMap" size={18} color={themedIconFg('#fff')} />
            </View>
            <Text style={[styles.menuLabel, { color: theme.text }]}>{T('stressMap')}</Text>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <View style={styles.menuRow}>
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#f97316') }]}>
              <Feather name="clock" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>{T('autoDeletePastTasks')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                {T('autoDeletePastTasksDesc')}
              </Text>
            </View>
            <Switch
              value={autoDeletePastTasks}
              onValueChange={handleAutoDeletePastTasksToggle}
              trackColor={{ false: switchTrackOff, true: isMonoTheme ? '#525252' : theme.accent3 }}
              thumbColor={isMonoTheme ? '#ffffff' : autoDeletePastTasks ? theme.primary : theme.textSecondary}
              ios_backgroundColor={switchTrackOff}
            />
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('integrationsSection').toUpperCase()}
        </Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          {classroomLoading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : (
            <>
              {profileClassroomItems.map((item, i) => (
                <React.Fragment key={`gc-${i}`}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.menuRow,
                      pressed && !item.disabled && { backgroundColor: theme.backgroundSecondary },
                      item.disabled && { opacity: 0.75 },
                    ]}
                    onPress={item.onPress}
                    disabled={item.disabled}
                  >
                    <View style={[styles.iconBox, { backgroundColor: themedIconBg(item.color) }]}>
                      <ThemeIcon name={item.icon} size={18} color={themedIconFg('#fff')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuLabel, { color: theme.text }]}>{item.label}</Text>
                      {item.subtitle ? (
                        <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2, lineHeight: 18 }}>{item.subtitle}</Text>
                      ) : null}
                    </View>
                    {item.disabled ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <Feather name="chevron-right" size={20} color={theme.textSecondary} />
                    )}
                  </Pressable>
                  {i < profileClassroomItems.length - 1 && <View style={styles.dividerList} />}
                </React.Fragment>
              ))}
            </>
          )}
        </View>
        <Text style={[styles.notifSectionHint, { color: theme.textSecondary }]}>
          {Platform.OS === 'android'
            ? `Classroom will sync using your login account${userEmail ? ` (${userEmail})` : ''}. If your courses are on a different Google account, sign out and sign in with that account first.`
            : 'Using your student email allows one-tap sync with Google Classroom.'}
        </Text>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('supportAccountSection').toUpperCase()}
        </Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/report-issue' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#ef4444') }]}>
              <Feather name="flag" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>{T('reportIssueTitle')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{T('reportIssueDesc')}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/account-legal' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#64748b') }]}>
              <Feather name="user" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>{T('accountLegalSection')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                {T('accountLegalDesc')}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        {__DEV__ ? (
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <Pressable
              onPress={() => {
                const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
                if (!dsn) {
                  Alert.alert(
                    'Sentry not configured',
                    'EXPO_PUBLIC_SENTRY_DSN is empty in this bundle. Restart Metro with --clear after editing .env.'
                  );
                  return;
                }
                captureError(new Error('Sentry test from settings'), { triggeredBy: 'dev button' });
                Alert.alert(
                  'Test error sent',
                  `DSN loaded (…${dsn.slice(-12)}). Check sentry.io → Issues in ~30s.`
                );
              }}
              style={{
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: theme.textSecondary,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>
                Dev: send test error to Sentry
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={{ height: 60 }} />
      </ScrollView>

      <Modal visible={themePickerOpen} animationType="fade" transparent onRequestClose={() => setThemePickerOpen(false)}>
        <KeyboardAvoidingView style={styles.syncBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setThemePickerOpen(false)} />
          <View style={[styles.syncSheet, { backgroundColor: theme.card }]}>
            <Text style={[styles.syncTitle, { color: theme.text }]}>{T('themeAppearance')}</Text>
            <Text style={[styles.syncDesc, { color: theme.textSecondary }]}>{T('themeAppearanceDesc')}</Text>

            <View style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden' }}>
              {THEME_IDS.map((id, idx) => (
                <React.Fragment key={id}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.menuRow,
                      pressed && { backgroundColor: theme.backgroundSecondary },
                      themeId === id && { backgroundColor: theme.backgroundSecondary },
                    ]}
                    onPress={() => {
                      setTheme(id);
                      setThemePickerOpen(false);
                    }}
                  >
                    <View style={[styles.iconBox, { backgroundColor: THEMES[id].accent3 }]}>
                      <ThemeIcon name={THEME_DISPLAY_ICON_KEY[id]} size={18} color={THEMES[id].primary} themeId={id} />
                    </View>
                    <Text style={[styles.menuLabel, { flex: 1, color: theme.text }]}>{T(THEME_LABEL_KEY[id])}</Text>
                    {themeId === id ? <Feather name="check" size={22} color={theme.primary} /> : null}
                  </Pressable>
                  {idx < THEME_IDS.length - 1 && <View style={styles.dividerList} />}
                </React.Fragment>
              ))}
            </View>

            <View style={[styles.syncActions, { marginTop: 14 }]}>
              <Pressable
                style={[styles.syncBtnSecondary, { borderColor: theme.border }]}
                onPress={() => setThemePickerOpen(false)}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>{T('close') || 'Close'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 52, paddingBottom: 40 },
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
    marginBottom: 4,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  catBadge: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: PAD,
    marginBottom: 6,
    marginTop: 16,
    letterSpacing: -0.2,
  },
  cardGroup: {
    marginHorizontal: PAD,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
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
  notifSectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: PAD + 4,
    marginTop: 10,
    marginBottom: 4,
  },
  dividerList: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(150,150,150,0.2)', marginLeft: 52 },
  syncBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  syncSheet: {
    borderRadius: RADIUS,
    padding: 20,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  syncTitle: { fontSize: 18, fontWeight: '800' },
  syncDesc: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  syncFieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  syncInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  syncActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  syncBtnSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  syncBtnPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
});

const catDecor = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  bubble: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(198,135,87,0.10)',
  },
  bubbleA: { width: 160, height: 160, top: 40, right: -40 },
  bubbleB: { width: 190, height: 190, bottom: 70, left: -54 },
  paw: {
    position: 'absolute',
    fontSize: 13,
    opacity: 0.24,
  },
  pawA: { top: 140, left: 20 },
  pawB: { bottom: 140, right: 24 },
});

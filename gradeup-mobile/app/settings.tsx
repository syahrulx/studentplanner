import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { setHasSeenTutorial } from '@/src/storage';
import { useClassroomSync } from '@/hooks/useClassroomSync';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import Feather from '@expo/vector-icons/Feather';
import type { ThemeIconKey } from '@/constants/ThemeIcons';
import { THEME_DISPLAY_ICON_KEY } from '@/constants/ThemeIcons';
import { THEME_IDS, THEMES, type ThemeId } from '@/constants/Themes';
import { useTranslations } from '@/src/i18n';
import { supabase } from '@/src/lib/supabase';
import { invokeDeleteAccount } from '@/src/lib/invokeDeleteAccount';

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

const CLEAR_DATA_PHRASE = 'delete data';
const DELETE_ACCOUNT_PHRASE = 'delete my account';

export default function Settings() {
  const {
    user,
    language,
    theme: themeId,
    setTheme,
    setTasks,
    clearSemesterData,
  } = useApp();
  const { spotifyConnected, connectSpotify, disconnectSpotify } = useCommunity();
  const theme = useTheme();
  const T = useTranslations(language);

  const [clearDataModalOpen, setClearDataModalOpen] = useState(false);
  const [clearDataPhrase, setClearDataPhrase] = useState('');
  const [clearDataBusy, setClearDataBusy] = useState(false);
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const [deleteAccountPhrase, setDeleteAccountPhrase] = useState('');
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);

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
    Alert.alert(
      'Disconnect Google Classroom',
      'Auto-sync will stop. Your imported tasks will remain in the planner.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              const { disconnectClassroom } = require('@/src/lib/googleClassroom');
              await disconnectClassroom();
              await refreshPrefs();
              Alert.alert('Disconnected', 'Google Classroom has been unlinked.');
            } catch {
              Alert.alert('Error', 'Failed to disconnect.');
            }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert(T('logOutConfirmTitle'), T('logOutConfirmBody'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('logOut'),
        onPress: () => {
          void (async () => {
            try {
              const { disconnectClassroom } = await import('@/src/lib/googleClassroom');
              await disconnectClassroom().catch(() => {});
            } catch {}
            await supabase.auth.signOut();
            router.replace('/(auth)/login' as any);
          })();
        },
      },
    ]);
  };

  const openDeleteAccountStep1 = () => {
    Alert.alert(T('deleteAccountStep1Title'), T('deleteAccountStep1Body'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('continue'),
        style: 'destructive',
        onPress: () => {
          setDeleteAccountPhrase('');
          setDeleteAccountModalOpen(true);
        },
      },
    ]);
  };

  const openDeleteAccountAfterPhrase = () => {
    const typed = deleteAccountPhrase.trim().toLowerCase();
    if (typed !== DELETE_ACCOUNT_PHRASE) return;
    setDeleteAccountModalOpen(false);
    setTimeout(() => {
      Alert.alert(T('deleteAccountStep2Title'), T('deleteAccountStep2Body'), [
        { text: T('cancel'), style: 'cancel' },
        {
          text: T('deleteAccountDelete'),
          style: 'destructive',
          onPress: () => {
            void runDeleteAccount();
          },
        },
      ]);
    }, 320);
  };

  const runDeleteAccount = async () => {
    setDeleteAccountBusy(true);
    try {
      const result = await invokeDeleteAccount();
      if (result.ok) {
        try {
          const { disconnectClassroom } = await import('@/src/lib/googleClassroom');
          await disconnectClassroom().catch(() => {});
        } catch {}
        await supabase.auth.signOut().catch(() => {});
        router.replace('/(auth)/login' as any);
        return;
      }
      Alert.alert(T('error'), result.message || T('deleteAccountError'));
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : T('deleteAccountError'));
    } finally {
      setDeleteAccountBusy(false);
      setDeleteAccountPhrase('');
    }
  };

  const openClearDataStep1 = () => {
    Alert.alert(T('clearDataStep1Title'), T('clearDataStep1Body'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('continue'),
        style: 'destructive',
        onPress: () => {
          setClearDataPhrase('');
          setClearDataModalOpen(true);
        },
      },
    ]);
  };

  const openClearDataStep3 = () => {
    const typed = clearDataPhrase.trim().toLowerCase();
    if (typed !== CLEAR_DATA_PHRASE) return;
    setClearDataModalOpen(false);
    setTimeout(() => {
      Alert.alert(T('clearDataStep3Title'), T('clearDataStep3Body'), [
        { text: T('cancel'), style: 'cancel' },
        {
          text: T('clearDataDeleteAll'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setClearDataBusy(true);
              try {
                await clearSemesterData();
                setClearDataPhrase('');
                Alert.alert(T('clearData'), T('clearDataSuccess'));
              } catch (e) {
                Alert.alert(T('error'), e instanceof Error ? e.message : T('clearDataError'));
              } finally {
                setClearDataBusy(false);
              }
            })();
          },
        },
      ]);
    }, 320);
  };

  const resetTutorial = async () => {
    await setHasSeenTutorial(false);
    router.replace('/(auth)/onboarding');
  };

  const spotifyItems: { icon: ThemeIconKey; label: string; onPress: () => void; color: string }[] = spotifyConnected
    ? [
        {
          icon: 'settings' as ThemeIconKey,
          label: 'Disconnect Spotify',
          onPress: async () => {
            await disconnectSpotify();
            Alert.alert('Disconnected', 'Your Spotify account has been unlinked.');
          },
          color: '#ef4444',
        },
      ]
    : [
        {
          icon: 'settings' as ThemeIconKey,
          label: 'Connect Spotify 🎵',
          onPress: async () => {
            try {
              const ok = await connectSpotify();
              if (ok) Alert.alert('Connected! 🎉', 'You can now set your music vibe!');
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to connect Spotify.');
            }
          },
          color: '#1DB954',
        },
      ];

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
          label: isClassroomSyncing ? 'Syncing…' : 'Sync Google Classroom',
          subtitle: `${classroomPrefs!.selectedCourseIds.length} courses · Last: ${formatClassroomLastSync(classroomPrefs!.lastSyncAt)}`,
          onPress: () => void runClassroomSync(),
          color: '#4285f4',
          disabled: isClassroomSyncing,
        },
        {
          icon: 'settings' as ThemeIconKey,
          label: 'Manage Courses',
          subtitle: 'Change which courses to sync',
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
          label: 'Connect Google Classroom',
          subtitle: 'Link account and choose courses to import',
          onPress: openClassroomSetup,
          color: '#4285f4',
        },
      ];

  const toolsMenuItems: {
    icon: ThemeIconKey;
    label: string;
    onPress: () => void;
    color: string;
  }[] = [
    {
      icon: 'settings',
      label: T('subjectColours'),
      onPress: () => router.push('/subject-colors' as any),
      color: '#3b82f6',
    },
    {
      icon: 'stressMap',
      label: T('stressMap'),
      onPress: () => router.push('/stress-map' as any),
      color: '#ec4899',
    },
    {
      icon: 'weeklySummary',
      label: T('weeklySummary'),
      onPress: () => router.push('/weekly-summary' as any),
      color: '#f59e0b',
    },
    {
      icon: 'leaderboard',
      label: T('leaderboard'),
      onPress: () => router.push('/leaderboard' as any),
      color: '#10b981',
    },
    {
      icon: 'helpCircle',
      label: T('resetTutorial'),
      onPress: resetTutorial,
      color: '#64748b',
    },
  ];

  return (
    <>
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
          <Text style={[styles.largeTitle, { color: theme.text }]}>Settings</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('preferencesSection').toUpperCase()}
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
            onPress={() => router.push('/language-preference' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: '#8b5cf6' }]}>
              <Feather name="globe" size={18} color="#fff" />
            </View>
            <Text style={[styles.menuLabel, { color: theme.text }]}>{T('languagePref')}</Text>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/week-start-preference' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: '#0ea5e9' }]}>
              <Feather name="calendar" size={18} color="#fff" />
            </View>
            <Text style={[styles.menuLabel, { color: theme.text }]}>{T('weekStartPref')}</Text>
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
            <View style={[styles.iconBox, { backgroundColor: '#e0e7ff' }]}>
              <ThemeIcon name="calendar" size={18} color="#4f46e5" />
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
            <View style={[styles.iconBox, { backgroundColor: '#fef3c7' }]}>
              <Feather name="trending-up" size={18} color="#d97706" />
            </View>
            <Text style={[styles.menuLabel, { color: theme.text }]}>{T('configWorkload')}</Text>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>GOOGLE CLASSROOM</Text>
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
                    <View style={[styles.iconBox, { backgroundColor: item.color }]}>
                      <ThemeIcon name={item.icon} size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuLabel, { color: theme.text }]}>{item.label}</Text>
                      {item.subtitle ? (
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>{item.subtitle}</Text>
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

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>INTEGRATIONS & TOOLS</Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          {spotifyItems.map((item) => (
            <React.Fragment key={item.label}>
              <Pressable
                style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
                onPress={item.onPress}
              >
                <View style={[styles.iconBox, { backgroundColor: item.color }]}>
                  <ThemeIcon name={item.icon} size={18} color="#fff" />
                </View>
                <Text style={[styles.menuLabel, { color: theme.text }]}>{item.label}</Text>
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
              <View style={styles.dividerList} />
            </React.Fragment>
          ))}
          {toolsMenuItems.map((item, i) => (
            <React.Fragment key={item.label}>
              <Pressable
                style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
                onPress={item.onPress}
              >
                <View style={[styles.iconBox, { backgroundColor: item.color }]}>
                  <ThemeIcon name={item.icon} size={18} color="#fff" />
                </View>
                <Text style={[styles.menuLabel, { color: theme.text }]}>{item.label}</Text>
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
              {i < toolsMenuItems.length - 1 && <View style={styles.dividerList} />}
            </React.Fragment>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>DATA MANAGEMENT</Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <View style={styles.hintBox}>
            <Feather name="info" size={14} color={theme.textSecondary} style={{ marginRight: 6 }} />
            <Text style={[styles.hintSmall, { color: theme.textSecondary }]}>
              Using your student email allows one-tap sync with Google Classroom.
            </Text>
          </View>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && { backgroundColor: 'rgba(254, 226, 226, 0.6)' },
              clearDataBusy && { opacity: 0.6 },
            ]}
            onPress={openClearDataStep1}
            disabled={clearDataBusy}
          >
            <View style={[styles.iconBox, { backgroundColor: '#fecaca' }]}>
              <Feather name="trash-2" size={18} color="#dc2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: '#b91c1c', fontWeight: '700' }]}>{T('clearData')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{T('clearDataDesc')}</Text>
            </View>
            {clearDataBusy ? <ActivityIndicator size="small" color="#b91c1c" /> : null}
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{T('accountSection')}</Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={handleLogout}
          >
            <View style={[styles.iconBox, { backgroundColor: '#64748b' }]}>
              <Feather name="log-out" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>{T('logOut')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{T('logOutDesc')}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && { backgroundColor: 'rgba(254, 226, 226, 0.6)' },
              deleteAccountBusy && { opacity: 0.6 },
            ]}
            onPress={openDeleteAccountStep1}
            disabled={deleteAccountBusy}
          >
            <View style={[styles.iconBox, { backgroundColor: '#fecaca' }]}>
              <Feather name="user-x" size={18} color="#b91c1c" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: '#b91c1c', fontWeight: '700' }]}>{T('deleteAccount')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{T('deleteAccountDesc')}</Text>
            </View>
            {deleteAccountBusy ? <ActivityIndicator size="small" color="#b91c1c" /> : null}
          </Pressable>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      <Modal
        visible={clearDataModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => !clearDataBusy && setClearDataModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.syncBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => !clearDataBusy && setClearDataModalOpen(false)}
          />
          <View style={[styles.syncSheet, { backgroundColor: theme.card }]}>
            <Text style={[styles.syncTitle, { color: '#b91c1c' }]}>{T('clearDataStep2Title')}</Text>
            <Text style={[styles.syncDesc, { color: theme.textSecondary }]}>{T('clearDataStep2Body')}</Text>
            <Text style={[styles.syncFieldLabel, { color: theme.text, marginTop: 14 }]}>
              {T('clearDataPhraseHint')}
            </Text>
            <TextInput
              value={clearDataPhrase}
              onChangeText={setClearDataPhrase}
              placeholder={CLEAR_DATA_PHRASE}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!clearDataBusy}
              style={[
                styles.syncInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
            />
            <View style={styles.syncActions}>
              <Pressable
                style={[styles.syncBtnSecondary, { borderColor: theme.border }]}
                onPress={() => !clearDataBusy && setClearDataModalOpen(false)}
                disabled={clearDataBusy}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>{T('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.syncBtnPrimary,
                  {
                    backgroundColor:
                      clearDataPhrase.trim().toLowerCase() === CLEAR_DATA_PHRASE ? '#b91c1c' : theme.border,
                  },
                ]}
                onPress={openClearDataStep3}
                disabled={clearDataBusy || clearDataPhrase.trim().toLowerCase() !== CLEAR_DATA_PHRASE}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{T('continue')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={deleteAccountModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => !deleteAccountBusy && setDeleteAccountModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.syncBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => !deleteAccountBusy && setDeleteAccountModalOpen(false)}
          />
          <View style={[styles.syncSheet, { backgroundColor: theme.card }]}>
            <Text style={[styles.syncTitle, { color: '#b91c1c' }]}>{T('deleteAccountModalTitle')}</Text>
            <Text style={[styles.syncDesc, { color: theme.textSecondary }]}>{T('deleteAccountModalBody')}</Text>
            <Text style={[styles.syncFieldLabel, { color: theme.text, marginTop: 14 }]}>
              {T('deleteAccountPhraseHint')}
            </Text>
            <TextInput
              value={deleteAccountPhrase}
              onChangeText={setDeleteAccountPhrase}
              placeholder={DELETE_ACCOUNT_PHRASE}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!deleteAccountBusy}
              style={[
                styles.syncInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
            />
            <View style={styles.syncActions}>
              <Pressable
                style={[styles.syncBtnSecondary, { borderColor: theme.border }]}
                onPress={() => !deleteAccountBusy && setDeleteAccountModalOpen(false)}
                disabled={deleteAccountBusy}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>{T('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.syncBtnPrimary,
                  {
                    backgroundColor:
                      deleteAccountPhrase.trim().toLowerCase() === DELETE_ACCOUNT_PHRASE ? '#b91c1c' : theme.border,
                  },
                ]}
                onPress={openDeleteAccountAfterPhrase}
                disabled={deleteAccountBusy || deleteAccountPhrase.trim().toLowerCase() !== DELETE_ACCOUNT_PHRASE}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{T('continue')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
    marginBottom: 16,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: PAD,
    marginBottom: 8,
    marginTop: 24,
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
  dividerList: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(150,150,150,0.2)', marginLeft: 52 },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(150,150,150,0.05)',
  },
  hintSmall: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
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

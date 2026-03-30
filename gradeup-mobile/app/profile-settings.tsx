import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { uploadAvatar } from '@/src/lib/communityApi';
import { setHasSeenTutorial, getClassroomPrefs, type ClassroomPrefs } from '@/src/storage';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import Feather from '@expo/vector-icons/Feather';
import type { ThemeIconKey } from '@/constants/ThemeIcons';
import { THEME_DISPLAY_ICON_KEY } from '@/constants/ThemeIcons';
import { DEEP_SEA_PALETTE, THEME_IDS, THEMES, type ThemeId } from '@/constants/Themes';
import { useTranslations } from '@/src/i18n';
import type { LocationVisibility } from '@/src/lib/communityApi';
import { getUniversityById } from '@/src/lib/universities';
import { displayProfileText, displayPortalSemester } from '@/src/lib/profileDisplay';

const PAD = 20;
const SECTION = 24;
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

export default function ProfileSettings() {
  const {
    user,
    language,
    theme: themeId,
    setTheme,
    setUser,
    setTasks,
    updateProfile,
    academicCalendar,
    disconnectUniversity,
    refreshUniversityTimetable,
    clearSemesterData,
  } = useApp();
  const { locationVisibility, setLocationVisibility, spotifyConnected, connectSpotify, disconnectSpotify } = useCommunity();
  const theme = useTheme();
  /** Light mode: match home header deep navy (#003366); other themes use palette primary. */
  const profileHeroBg = themeId === 'light' ? DEEP_SEA_PALETTE.primary : theme.primary;
  const T = useTranslations(language);
  const totalWeeks = academicCalendar?.totalWeeks ?? 14;
  const semesterPhase = user.semesterPhase ?? 'teaching';
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const [isUploading, setIsUploading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSyncingClassroom, setIsSyncingClassroom] = useState(false);
  const [classroomPrefs, setClassroomPrefsState] = useState<ClassroomPrefs | null>(null);
  const [classroomLoading, setClassroomLoading] = useState(true);
  const [refreshModalOpen, setRefreshModalOpen] = useState(false);
  const [syncPassword, setSyncPassword] = useState('');
  const [syncCourses, setSyncCourses] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [clearDataModalOpen, setClearDataModalOpen] = useState(false);
  const [clearDataPhrase, setClearDataPhrase] = useState('');
  const [clearDataBusy, setClearDataBusy] = useState(false);

  const canSyncMyStudent = useMemo(
    () => user.universityId === 'uitm',
    [user.universityId],
  );

  const refreshClassroomPrefs = useCallback(() => {
    getClassroomPrefs().then(p => { setClassroomPrefsState(p); setClassroomLoading(false); });
  }, []);

  useFocusEffect(refreshClassroomPrefs);

  const isClassroomLinked = classroomPrefs !== null && classroomPrefs.selectedCourseIds.length > 0;

  const handleClassroomSync = async () => {
    if (isSyncingClassroom) return;
    if (!isClassroomLinked) {
      router.push('/classroom-sync' as any);
      return;
    }
    setIsSyncingClassroom(true);
    try {
      const { syncSelectedCourses } = require('@/src/lib/googleClassroom');
      const taskDbModule = require('@/src/lib/taskDb');
      const { supabase } = require('@/src/lib/supabase');
      const taskFilter = classroomPrefs!.selectedTaskIds?.length ? classroomPrefs!.selectedTaskIds : undefined;
      const result = await syncSelectedCourses(
        classroomPrefs!.selectedCourseIds,
        undefined,
        user.startDate,
        taskFilter,
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const fresh = await taskDbModule.getTasks(session.user.id);
        setTasks(fresh);
      }
      refreshClassroomPrefs();
      const msg = result.failedCount > 0
        ? `Synced ${result.syncedCount} tasks. ${result.failedCount} failed.`
        : `Successfully synced ${result.syncedCount} tasks!`;
      Alert.alert('Sync Complete', msg);
    } catch (e: any) {
      Alert.alert('Sync Failed', e.message || 'Something went wrong.');
    } finally {
      setIsSyncingClassroom(false);
    }
  };

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
              setClassroomPrefsState(null);
              Alert.alert('Disconnected', 'Google Classroom has been unlinked.');
            } catch {
              Alert.alert('Error', 'Failed to disconnect.');
            }
          },
        },
      ],
    );
  };

  const formatLastSync = (ts: number | null) => {
    if (!ts) return 'Never synced';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const handleEditName = () => {
    Alert.prompt(
      T('editName') || 'Edit Name',
      T('enterYourName') || 'Please enter your full name',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Save', 
          onPress: async (newName: string | undefined) => {
            if (!newName?.trim()) return;
            setIsUpdating(true);
            try {
              await updateProfile({ name: newName.trim() });
            } catch (e) {
              Alert.alert('Error', 'Failed to update name');
            } finally {
              setIsUpdating(false);
            }
          } 
        }
      ],
      'plain-text',
      user.name
    );
  };

  const handleEditStudentId = () => {
    Alert.prompt(
      T('studentIdEditTitle'),
      T('studentIdEditMessage'),
      [
        { text: T('cancel'), style: 'cancel' },
        {
          text: T('save'),
          onPress: async (newId: string | undefined) => {
            setIsUpdating(true);
            try {
              await updateProfile({ studentId: (newId ?? '').trim() });
            } catch (e) {
              Alert.alert(T('error'), T('studentIdUpdateFailed'));
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ],
      'plain-text',
      user.studentId,
    );
  };

  const handleEditProgram = () => {
    Alert.prompt(
      T('editPrimaryProgram'),
      T('enterPrimaryProgram'),
      [
        { text: T('cancel'), style: 'cancel' },
        {
          text: T('save'),
          onPress: async (v: string | undefined) => {
            setIsUpdating(true);
            try {
              await updateProfile({ program: (v ?? '').trim() });
            } catch {
              Alert.alert(T('error'), T('programUpdateFailed'));
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ],
      'plain-text',
      user.program,
    );
  };

  const promptRefreshFromMyStudent = () => {
    Alert.alert(T('refreshUniversityTitle'), T('refreshUniversityWarning'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('continue'),
        style: 'destructive',
        onPress: () => {
          setSyncPassword('');
          setSyncCourses('');
          setRefreshModalOpen(true);
        },
      },
    ]);
  };

  const runFullMyStudentRefresh = async () => {
    const pwd = syncPassword;
    if (!pwd.trim()) {
      Alert.alert(T('error'), T('passwordRequiredForRefresh'));
      return;
    }
    setSyncBusy(true);
    try {
      const coursesList = syncCourses
        .split(/[,\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length >= 4);
      await refreshUniversityTimetable(pwd, coursesList.length > 0 ? { courses: coursesList } : undefined);
      setRefreshModalOpen(false);
      setSyncPassword('');
      setSyncCourses('');
      Alert.alert(T('syncProfile'), T('refreshComplete'));
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : String(e));
    } finally {
      setSyncBusy(false);
    }
  };

  const handleEditAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to make this work!');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setIsUploading(true);
        const asset = result.assets[0];
        const ext = asset.uri.split('.').pop() || 'jpeg';
        
        const publicUrl = await uploadAvatar(asset.base64 || '', ext);
        setUser({ ...user, avatar: publicUrl });
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
    } finally {
      setIsUploading(false);
    }
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

  const classroomItems: { icon: ThemeIconKey; label: string; onPress: () => void; color: string; subtitle?: string }[] = isClassroomLinked
    ? [
        {
          icon: 'settings' as ThemeIconKey,
          label: isSyncingClassroom ? 'Syncing...' : 'Sync Google Classroom',
          subtitle: `${classroomPrefs!.selectedCourseIds.length} courses · Last: ${formatLastSync(classroomPrefs!.lastSyncAt)}`,
          onPress: handleClassroomSync,
          color: '#4285f4',
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
          subtitle: 'Import assignments and quizzes automatically',
          onPress: handleClassroomSync,
          color: '#4285f4',
        },
      ];

  const CLEAR_DATA_PHRASE = 'delete data';

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

  const menuItems: { icon: ThemeIconKey; label: string; onPress: () => void; color: string; subtitle?: string }[] = [
    ...spotifyItems,
    ...classroomItems,
    { icon: 'settings', label: T('subjectColours'), onPress: () => router.push('/subject-colors' as any), color: '#3b82f6' },
    { icon: 'stressMap', label: T('stressMap'), onPress: () => router.push('/stress-map' as any), color: '#ec4899' },
    { icon: 'weeklySummary', label: T('weeklySummary'), onPress: () => router.push('/weekly-summary' as any), color: '#f59e0b' },
    { icon: 'leaderboard', label: T('leaderboard'), onPress: () => router.push('/leaderboard' as any), color: '#10b981' },
    { icon: 'helpCircle', label: T('resetTutorial'), onPress: resetTutorial, color: '#64748b' },
  ];

  const privacyOptions: { value: LocationVisibility; label: string; icon: string; desc: string }[] = [
    { value: 'public', label: 'Public', icon: '🌍', desc: 'Everyone can see you' },
    { value: 'friends', label: 'Friends Only', icon: '👥', desc: 'Only friends can see you' },
    { value: 'off', label: 'Off', icon: '🔒', desc: 'No one can see you' },
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

      {/* Dark blue hero with avatar, name, ID */}
      <View style={[styles.heroWrap, { backgroundColor: profileHeroBg }]}>
        <Image
          source={require('../assets/images/wave-texture.png')}
          style={[StyleSheet.absoluteFillObject, styles.heroTexture]}
          resizeMode="cover"
        />
        <View style={[StyleSheet.absoluteFillObject, styles.heroOverlay]} />
        <View style={styles.heroContent}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {user.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}
            </View>
            <Pressable style={styles.editAvatarBtn} onPress={handleEditAvatar} disabled={isUploading}>
              {isUploading ? (
                <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.7 }] }} />
              ) : (
                <Feather name="camera" size={16} color="#0f172a" />
              )}
            </Pressable>
          </View>
          <Pressable style={styles.nameRow} onPress={handleEditName}>
            <Text style={styles.heroName}>{user.name}</Text>
            <Feather name="edit-2" size={16} color="rgba(255,255,255,0.7)" style={{ marginLeft: 8 }} />
          </Pressable>
          <Pressable style={styles.nameRow} onPress={handleEditStudentId}>
            <Text style={styles.heroId}>{displayProfileText(user.studentId)}</Text>
            <Feather name="edit-2" size={12} color="rgba(255,255,255,0.7)" style={{ marginLeft: 6 }} />
          </Pressable>
        </View>
      </View>

      {/* Academic Info */}
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        <Pressable
          style={({ pressed }) => [styles.cardRowPressable, pressed && { opacity: 0.85 }]}
          onPress={handleEditProgram}
          disabled={isUpdating}
        >
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('primaryProgram')}</Text>
          <View style={styles.cardValueWrap}>
            <Text
              style={[styles.cardValue, { color: theme.textSecondary }]}
              numberOfLines={3}
            >
              {displayProfileText(user.program)}
            </Text>
            <Feather name="edit-2" size={14} color={theme.textSecondary} style={{ marginLeft: 8 }} />
          </View>
        </Pressable>
        <View style={styles.divider} />
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('campus')}</Text>
          <Text style={[styles.cardValue, { color: theme.textSecondary, flex: 1, textAlign: 'right' }]} numberOfLines={3}>
            {displayProfileText(user.campus)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('faculty')}</Text>
          <Text style={[styles.cardValue, { color: theme.textSecondary, flex: 1, textAlign: 'right' }]} numberOfLines={4}>
            {displayProfileText(user.faculty)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('portalSemester')}</Text>
          <Text style={[styles.cardValue, { color: theme.textSecondary }]}>
            {displayPortalSemester(user.currentSemester)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('studyModeLabel')}</Text>
          <Text style={[styles.cardValue, { color: theme.textSecondary, flex: 1, textAlign: 'right' }]} numberOfLines={2}>
            {displayProfileText(user.studyMode)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('mystudentEmailLabel')}</Text>
          <Text style={[styles.cardValue, { color: theme.textSecondary, flex: 1, textAlign: 'right' }]} numberOfLines={2}>
            {displayProfileText(user.mystudentEmail)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={[styles.cardLabel, { color: theme.text }]}>{T('semesterProgress')}</Text>
            <Text style={[styles.cardValue, { color: theme.textSecondary }]}>
              {semesterPhase === 'no_calendar'
                ? T('semesterNotConfigured')
                : semesterPhase === 'before_start'
                  ? T('semesterNotStartedShort')
                  : user.isBreak || semesterPhase === 'break_after'
                    ? T('semesterBreak') || 'Semester Break'
                    : `W${user.currentWeek} of ${totalWeeks}`}
            </Text>
          </View>
          <View style={styles.segmentBar}>
            {Array.from({ length: totalWeeks }, (_, i) => {
              const filled =
                semesterPhase === 'break_after' || user.isBreak
                  ? true
                  : semesterPhase === 'teaching' && !user.isBreak && i < user.currentWeek;
              return (
                <View
                  key={i}
                  style={[
                    styles.segment,
                    filled
                      ? { backgroundColor: theme.primary }
                      : { backgroundColor: theme.backgroundSecondary || theme.border },
                  ]}
                />
              );
            })}
          </View>
        </View>
      </View>

      {/* Location Privacy */}
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>LOCATION PRIVACY</Text>
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        {privacyOptions.map((opt, i) => (
          <React.Fragment key={opt.value}>
            <Pressable
              style={({ pressed }) => [
                styles.privacyRow,
                pressed && { backgroundColor: theme.backgroundSecondary },
              ]}
              onPress={() => setLocationVisibility(opt.value)}
            >
              <Text style={styles.privacyEmoji}>{opt.icon}</Text>
              <View style={styles.privacyBody}>
                <Text style={[styles.privacyLabel, { color: theme.text }]}>{opt.label}</Text>
                <Text style={[styles.privacyDesc, { color: theme.textSecondary }]}>{opt.desc}</Text>
              </View>
              {locationVisibility === opt.value && (
                <Feather name="check" size={20} color={theme.primary} />
              )}
            </Pressable>
            {i < privacyOptions.length - 1 && <View style={styles.dividerList} />}
          </React.Fragment>
        ))}
      </View>

      {/* University — link once; data stored in Supabase */}
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{T('university').toUpperCase()}</Text>
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        {!user.universityId ? (
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => router.push('/university-connect' as any)}
          >
            <View style={[styles.iconBox, { backgroundColor: '#dbeafe' }]}>
              <Feather name="globe" size={18} color="#2563eb" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>{T('connectUniversity')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{T('tapToConnect')}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        ) : (
          <>
            <View style={[styles.menuRow, { opacity: 1 }]}>
              <View style={[styles.iconBox, { backgroundColor: '#dbeafe' }]}>
                <Feather name="link" size={18} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuLabel, { color: theme.text }]}>
                  {getUniversityById(user.universityId)?.shortName || user.university || T('university')}
                </Text>
                <Text style={{ fontSize: 12, color: '#22c55e', fontWeight: '600', marginTop: 2 }}>
                  ✓ {T('connected')}
                </Text>
                {user.lastSync ? (
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>
                    {T('lastSynced')}: {new Date(user.lastSync).toLocaleString()}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>
                  {T('savedStudentId')}: {displayProfileText(user.studentId)}
                </Text>
              </View>
            </View>
            {canSyncMyStudent ? (
              <>
                <View style={styles.dividerList} />
                <Pressable
                  style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
                  onPress={promptRefreshFromMyStudent}
                  disabled={syncBusy}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#bfdbfe' }]}>
                    <Feather name="refresh-cw" size={18} color="#1d4ed8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.menuLabel, { color: theme.text }]}>{T('refreshFromMyStudent')}</Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                      {T('refreshFromMyStudentShort')}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={theme.textSecondary} />
                </Pressable>
              </>
            ) : null}
            <View style={styles.dividerList} />
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
              onPress={() =>
                Alert.alert(T('disconnectUniversity'), T('disconnectUniversityConfirm'), [
                  { text: T('cancel'), style: 'cancel' },
                  {
                    text: T('disconnectUniversity'),
                    style: 'destructive',
                    onPress: () => disconnectUniversity(),
                  },
                ])
              }
            >
              <View style={[styles.iconBox, { backgroundColor: '#fee2e2' }]}>
                <Feather name="x-circle" size={18} color="#b91c1c" />
              </View>
              <Text style={[styles.menuLabel, { color: '#b91c1c' }]}>{T('disconnectUniversity')}</Text>
            </Pressable>
          </>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{T('preferencesSection').toUpperCase()}</Text>
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        <View style={styles.menuRow}>
          <View style={[styles.iconBox, { backgroundColor: theme.accent3 }]}>
            <ThemeIcon name="sparkles" size={18} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuLabel, { color: theme.text }]}>{T('themeAppearance')}</Text>
            <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{T('themeAppearanceDesc')}</Text>
          </View>
        </View>
        {THEME_IDS.map((id) => (
          <React.Fragment key={id}>
            <View style={styles.dividerList} />
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                pressed && { backgroundColor: theme.backgroundSecondary },
                themeId === id && { backgroundColor: theme.backgroundSecondary },
              ]}
              onPress={() => setTheme(id)}
            >
              <View style={[styles.iconBox, { backgroundColor: THEMES[id].accent3 }]}>
                <ThemeIcon
                  name={THEME_DISPLAY_ICON_KEY[id]}
                  size={18}
                  color={THEMES[id].primary}
                  themeId={id}
                />
              </View>
              <Text style={[styles.menuLabel, { flex: 1, color: theme.text }]}>{T(THEME_LABEL_KEY[id])}</Text>
              {themeId === id ? (
                <Feather name="check" size={22} color={theme.primary} />
              ) : (
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
              )}
            </Pressable>
          </React.Fragment>
        ))}
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

      {/* Semester Config */}
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{T('semesterConfig').toUpperCase()}</Text>
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        <Pressable
          style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
          onPress={() => router.push('/stress-map' as any)}
        >
          <View style={[styles.iconBox, { backgroundColor: '#e0e7ff' }]}>
            <ThemeIcon name="calendar" size={18} color="#4f46e5" />
          </View>
          <Text style={[styles.menuLabel, { color: theme.text }]}>{T('academicCalendar')}</Text>
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

      {/* Settings Tools */}
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{T('settingsTools').toUpperCase()}</Text>
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        {menuItems.map((item, i) => (
          <React.Fragment key={item.label}>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
              onPress={item.onPress}
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
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
            {i < menuItems.length - 1 && <View style={styles.dividerList} />}
          </React.Fragment>
        ))}
        <View style={styles.hintBox}>
          <Feather name="info" size={14} color={theme.textSecondary} style={{ marginRight: 6 }} />
          <Text style={[styles.hintSmall, { color: theme.textSecondary }]}>
            Using your student email allows one-tap sync with Classroom and Teams.
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

      <View style={{ height: 60 }} />
    </ScrollView>

    <Modal
      visible={refreshModalOpen}
      animationType="fade"
      transparent
      onRequestClose={() => !syncBusy && setRefreshModalOpen(false)}
    >
      <KeyboardAvoidingView
        style={styles.syncBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => !syncBusy && setRefreshModalOpen(false)} />
        <View style={[styles.syncSheet, { backgroundColor: theme.card }]}>
          <Text style={[styles.syncTitle, { color: theme.text }]}>{T('refreshModalTitle')}</Text>
          <Text style={[styles.syncDesc, { color: theme.textSecondary }]}>{T('refreshModalBody')}</Text>
          {user.studentId ? (
            <Text style={[styles.syncFieldLabel, { color: theme.textSecondary, marginTop: 8, fontWeight: '500' }]}>
              {T('savedStudentId')}: {user.studentId}
            </Text>
          ) : null}
          <Text style={[styles.syncFieldLabel, { color: theme.text, marginTop: 14 }]}>{T('myStudentPasswordLabel')}</Text>
          <TextInput
            value={syncPassword}
            onChangeText={setSyncPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={theme.textSecondary}
            style={[styles.syncInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            editable={!syncBusy}
          />
          <Text style={[styles.syncFieldLabel, { color: theme.text, marginTop: 12 }]}>{T('optionalCourseCodes')}</Text>
          <TextInput
            value={syncCourses}
            onChangeText={setSyncCourses}
            placeholder="CSP600, …"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="characters"
            style={[styles.syncInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            editable={!syncBusy}
          />
          <Text style={[styles.syncDesc, { color: theme.textSecondary, marginTop: 6, fontSize: 12 }]}>
            {T('optionalCourseCodesRefreshHint')}
          </Text>
          <View style={styles.syncActions}>
            <Pressable
              style={[styles.syncBtnSecondary, { borderColor: theme.border }]}
              onPress={() => !syncBusy && setRefreshModalOpen(false)}
              disabled={syncBusy}
            >
              <Text style={{ color: theme.text, fontWeight: '600' }}>{T('cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.syncBtnPrimary, { backgroundColor: theme.primary }]}
              onPress={runFullMyStudentRefresh}
              disabled={syncBusy}
            >
              {syncBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700' }}>{T('refreshNow')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

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
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => !clearDataBusy && setClearDataModalOpen(false)} />
        <View style={[styles.syncSheet, { backgroundColor: theme.card }]}>
          <Text style={[styles.syncTitle, { color: '#b91c1c' }]}>{T('clearDataStep2Title')}</Text>
          <Text style={[styles.syncDesc, { color: theme.textSecondary }]}>{T('clearDataStep2Body')}</Text>
          <Text style={[styles.syncFieldLabel, { color: theme.text, marginTop: 14 }]}>{T('clearDataPhraseHint')}</Text>
          <TextInput
            value={clearDataPhrase}
            onChangeText={setClearDataPhrase}
            placeholder={CLEAR_DATA_PHRASE}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!clearDataBusy}
            style={[styles.syncInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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
    marginBottom: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backText: { fontSize: 17, fontWeight: '500', marginLeft: -4 },
  heroWrap: {
    borderRadius: RADIUS,
    marginBottom: SECTION,
    overflow: 'hidden',
    paddingVertical: 32,
    paddingHorizontal: 24,
    minHeight: 200,
    position: 'relative',
    marginHorizontal: PAD,
  },
  heroTexture: {
    opacity: 0.35,
    borderRadius: RADIUS,
  },
  heroOverlay: {
    backgroundColor: 'rgba(0, 51, 102, 0.35)',
    borderRadius: RADIUS,
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    alignItems: 'center',
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  editAvatarBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#003366',
  },
  heroName: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4, letterSpacing: -0.3 },
  heroId: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
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
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardRowPressable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  cardValueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  cardLabel: { fontSize: 16, fontWeight: '400', maxWidth: '42%' },
  cardValue: { fontSize: 16, fontWeight: '400', flexShrink: 1, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(150,150,150,0.2)' },
  dividerList: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(150,150,150,0.2)', marginLeft: 52 },
  progressContainer: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  segmentBar: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  privacyEmoji: { fontSize: 24, marginRight: 12 },
  privacyBody: { flex: 1 },
  privacyLabel: { fontSize: 16, fontWeight: '400', marginBottom: 2 },
  privacyDesc: { fontSize: 13, fontWeight: '400' },
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

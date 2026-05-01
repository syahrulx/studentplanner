import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { uploadAvatar, getCircleLocationVisibility, setCircleLocationVisibility } from '@/src/lib/communityApi';
import { useTheme } from '@/hooks/useTheme';
import Feather from '@expo/vector-icons/Feather';
import { DEEP_SEA_PALETTE } from '@/constants/Themes';
import { useTranslations } from '@/src/i18n';
import { featherForLegacyCircleEmoji } from '@/src/lib/featherGlyphUi';
import {
  displayProfileText,
  displayPortalSemester,
  subscriptionPlanLabel,
  subscriptionPlanSummary,
} from '@/src/lib/profileDisplay';
import { getEnabledSubscriptionFeaturesForTier } from '@/src/lib/subscriptionFeatures';
import type { SubscriptionPlan } from '@/src/types';
import { teachingWeekNumberForDate } from '@/src/lib/academicWeek';
import { getTodayISO } from '@/src/utils/date';
import { ensureImageLibraryAccessForPicker } from '@/src/lib/imageLibraryPickerGate';
import { getMyWhatsAppNumber, setMyWhatsAppNumber, normalizeWhatsAppNumber } from '@/src/lib/servicesApi';

export default function Profile() {
  const {
    user,
    language,
    theme: themeId,
    setUser,
    updateProfile,
    academicCalendar,
  } = useApp();
  const { locationVisibility, setLocationVisibility, circles, userId } = useCommunity();
  const theme = useTheme();
  const profileHeroBg = themeId === 'light' ? DEEP_SEA_PALETTE.primary : theme.primary;
  const T = useTranslations(language);
  const totalWeeks = academicCalendar?.totalWeeks ?? 14;
  const semesterPhase = user.semesterPhase ?? 'teaching';
  const profileTeachingWeek = teachingWeekNumberForDate(
    getTodayISO(),
    academicCalendar,
    user.startDate,
    totalWeeks,
    user.currentWeek ?? 1,
  );
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const [isUploading, setIsUploading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [circleVisibilityIds, setCircleVisibilityIds] = useState<string[]>([]);
  const [loadingCircleVisibility, setLoadingCircleVisibility] = useState(false);
  const [circleDropdownOpen, setCircleDropdownOpen] = useState(false);
  const [planFeatureLines, setPlanFeatureLines] = useState<string[]>([]);
  const [planFeaturesLoading, setPlanFeaturesLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editModalTitle, setEditModalTitle] = useState('');
  const [editModalMessage, setEditModalMessage] = useState('');
  const [editModalValue, setEditModalValue] = useState('');
  const [editModalField, setEditModalField] = useState<
    'name' | 'studentId' | 'program' | 'campus' | 'faculty' | 'portalSemester' | null
  >(null);
  const [editModalKeyboardType, setEditModalKeyboardType] = useState<'default' | 'number-pad'>('default');

  // WhatsApp number — used to enable the "Chat on WhatsApp" handoff in the
  // services marketplace once an offer is accepted.
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const [waModalVisible, setWaModalVisible] = useState(false);
  const [waModalValue, setWaModalValue] = useState('');
  const [waSaving, setWaSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyWhatsAppNumber()
      .then((n) => {
        if (!cancelled) setWhatsappNumber(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const openWhatsappEditor = () => {
    setWaModalValue(whatsappNumber || '');
    setWaModalVisible(true);
  };

  const handleSaveWhatsapp = async () => {
    const trimmed = waModalValue.trim();
    if (trimmed && !normalizeWhatsAppNumber(trimmed)) {
      Alert.alert(
        'Invalid number',
        'Please enter a valid WhatsApp number with country code (e.g. +60 12 345 6789).'
      );
      return;
    }
    setWaSaving(true);
    try {
      await setMyWhatsAppNumber(trimmed || null);
      setWhatsappNumber(trimmed || null);
      setWaModalVisible(false);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    } finally {
      setWaSaving(false);
    }
  };

  const subscriptionTier: SubscriptionPlan =
    user.subscriptionPlan === 'plus' || user.subscriptionPlan === 'pro' ? user.subscriptionPlan : 'free';

  useEffect(() => {
    let cancelled = false;
    setPlanFeaturesLoading(true);
    getEnabledSubscriptionFeaturesForTier(subscriptionTier)
      .then((lines) => {
        if (!cancelled) setPlanFeatureLines(lines);
      })
      .catch(() => {
        if (!cancelled) setPlanFeatureLines([]);
      })
      .finally(() => {
        if (!cancelled) setPlanFeaturesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subscriptionTier]);

  useEffect(() => {
    if (!userId || locationVisibility !== 'circles') return;
    setLoadingCircleVisibility(true);
    getCircleLocationVisibility(userId)
      .then(setCircleVisibilityIds)
      .catch(() => setCircleVisibilityIds([]))
      .finally(() => setLoadingCircleVisibility(false));
  }, [userId, locationVisibility]);

  const toggleCircleVisibility = async (circleId: string) => {
    if (!userId) return;
    const prev = circleVisibilityIds;
    const next = prev.includes(circleId) ? prev.filter((id) => id !== circleId) : [...prev, circleId];
    setCircleVisibilityIds(next);
    try {
      await setCircleLocationVisibility(userId, next);
    } catch (e) {
      setCircleVisibilityIds(prev);
      Alert.alert('Could not update visibility', 'Please try again.');
    }
  };

  const openEditModal = (cfg: {
    field: 'name' | 'studentId' | 'program' | 'campus' | 'faculty' | 'portalSemester';
    title: string;
    message: string;
    value: string;
    keyboardType?: 'default' | 'number-pad';
  }) => {
    setEditModalField(cfg.field);
    setEditModalTitle(cfg.title);
    setEditModalMessage(cfg.message);
    setEditModalValue(cfg.value);
    setEditModalKeyboardType(cfg.keyboardType ?? 'default');
    setEditModalVisible(true);
  };

  const handleSaveEditModal = async () => {
    if (!editModalField) return;
    const trimmed = editModalValue.trim();
    setIsUpdating(true);
    try {
      if (editModalField === 'name') {
        if (!trimmed) return;
        await updateProfile({ name: trimmed });
      } else if (editModalField === 'studentId') {
        await updateProfile({ studentId: trimmed });
      } else if (editModalField === 'program') {
        await updateProfile({ program: trimmed });
      } else if (editModalField === 'campus') {
        await updateProfile({ campus: trimmed });
      } else if (editModalField === 'faculty') {
        await updateProfile({ faculty: trimmed });
      } else if (editModalField === 'portalSemester') {
        if (trimmed.length > 0 && !/^\d+$/.test(trimmed)) {
          Alert.alert(T('error'), 'Please enter a valid semester number.');
          return;
        }
        const parsed = trimmed.length > 0 ? Number(trimmed) : 0;
        if (!Number.isFinite(parsed) || parsed < 0) {
          Alert.alert(T('error'), 'Please enter a valid semester number.');
          return;
        }
        await updateProfile({ currentSemester: Math.floor(parsed) });
      }
      setEditModalVisible(false);
    } catch {
      if (editModalField === 'name') {
        Alert.alert('Could not update name', 'Please try again.');
      } else if (editModalField === 'studentId') {
        Alert.alert(T('error'), T('studentIdUpdateFailed'));
      } else if (editModalField === 'program') {
        Alert.alert(T('error'), T('programUpdateFailed'));
      } else if (editModalField === 'campus') {
        Alert.alert(T('error'), T('campusUpdateFailed'));
      } else if (editModalField === 'faculty') {
        Alert.alert(T('error'), T('facultyUpdateFailed'));
      } else if (editModalField === 'portalSemester') {
        Alert.alert(T('error'), 'Failed to update semester');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditName = () => {
    openEditModal({
      field: 'name',
      title: T('editName') || 'Edit Name',
      message: T('enterYourName') || 'Please enter your full name',
      value: user.name,
    });
  };

  const handleEditStudentId = () => {
    openEditModal({
      field: 'studentId',
      title: T('studentIdEditTitle'),
      message: T('studentIdEditMessage'),
      value: user.studentId,
    });
  };

  const handleEditProgram = () => {
    openEditModal({
      field: 'program',
      title: T('editPrimaryProgram'),
      message: T('enterPrimaryProgram'),
      value: user.program,
    });
  };

  const handleEditCampus = () => {
    openEditModal({
      field: 'campus',
      title: T('editCampus'),
      message: T('enterCampus'),
      value: user.campus,
    });
  };

  const handleEditFaculty = () => {
    openEditModal({
      field: 'faculty',
      title: T('editFaculty'),
      message: T('enterFaculty'),
      value: user.faculty,
    });
  };

  const handleEditPortalSemester = () => {
    openEditModal({
      field: 'portalSemester',
      title: 'Edit semester (portal)',
      message: 'Semester number (e.g. 1, 2, 5). Leave empty to clear.',
      value: user.currentSemester != null && user.currentSemester > 0 ? String(Math.floor(user.currentSemester)) : '',
      keyboardType: 'number-pad',
    });
  };

  const handleEditStudyMode = () => {
    Alert.alert(
      'Select study mode',
      'Choose your study mode.',
      [
        {
          text: 'Part Time',
          onPress: async () => {
            setIsUpdating(true);
            try {
              await updateProfile({ studyMode: 'Part Time' });
            } catch {
              Alert.alert(T('error'), 'Failed to update study mode');
            } finally {
              setIsUpdating(false);
            }
          },
        },
        {
          text: 'Full Time',
          onPress: async () => {
            setIsUpdating(true);
            try {
              await updateProfile({ studyMode: 'Full Time' });
            } catch {
              Alert.alert(T('error'), 'Failed to update study mode');
            } finally {
              setIsUpdating(false);
            }
          },
        },
        { text: T('cancel'), style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const normalizedStudyMode = (user.studyMode ?? '').trim().toLowerCase();
  const studyModeDisplay =
    normalizedStudyMode === 'part time'
      ? 'Part Time'
      : normalizedStudyMode === 'full time'
        ? 'Full Time'
        : displayProfileText(user.studyMode);

  const handleEditAvatar = async () => {
    try {
      const ok = await ensureImageLibraryAccessForPicker();
      if (!ok) {
        Alert.alert('Permission needed', 'Allow photo access in your device settings to change your profile picture.');
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
      Alert.alert('Upload failed', 'Could not update your profile picture. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const privacyOptions: { value: LocationVisibility; label: string; icon: React.ComponentProps<typeof Feather>['name']; desc: string }[] = [
    { value: 'public', label: 'Public', icon: 'globe', desc: 'Everyone can see your location' },
    { value: 'friends', label: 'Friends Only', icon: 'users', desc: 'Only friends can see your location' },
    { value: 'circles', label: 'Circles', icon: 'circle', desc: 'Only people in your circles can see your location' },
    { value: 'off', label: 'Off', icon: 'lock', desc: 'No one can see your location' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
          <Feather name="chevron-left" size={28} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings' as any)}
          style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="settings" size={24} color={theme.primary} />
        </Pressable>
      </View>

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

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>CONTACT</Text>
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        <Pressable
          style={({ pressed }) => [styles.cardRowPressable, pressed && { opacity: 0.85 }]}
          onPress={openWhatsappEditor}
        >
          <Text style={[styles.cardLabel, { color: theme.text }]}>WhatsApp number</Text>
          <View style={styles.cardValueWrap}>
            <Text
              style={[
                styles.cardValue,
                { color: whatsappNumber ? theme.textSecondary : theme.primary },
              ]}
              numberOfLines={1}
            >
              {whatsappNumber || 'Add number'}
            </Text>
            <Feather name="edit-2" size={14} color={theme.textSecondary} style={{ marginLeft: 8 }} />
          </View>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ACADEMIC INFO</Text>
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        <Pressable
          style={({ pressed }) => [styles.cardRowPressable, pressed && { opacity: 0.85 }]}
          onPress={handleEditProgram}
          disabled={isUpdating}
        >
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('primaryProgram')}</Text>
          <View style={styles.cardValueWrap}>
            <Text style={[styles.cardValue, { color: theme.textSecondary }]} numberOfLines={3}>
              {displayProfileText(user.program)}
            </Text>
            <Feather name="edit-2" size={14} color={theme.textSecondary} style={{ marginLeft: 8 }} />
          </View>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={({ pressed }) => [styles.cardRowPressable, pressed && { opacity: 0.85 }]}
          onPress={handleEditCampus}
          disabled={isUpdating}
        >
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('campus')}</Text>
          <View style={styles.cardValueWrap}>
            <Text style={[styles.cardValue, { color: theme.textSecondary }]} numberOfLines={3}>
              {displayProfileText(user.campus)}
            </Text>
            <Feather name="edit-2" size={14} color={theme.textSecondary} style={{ marginLeft: 8 }} />
          </View>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={({ pressed }) => [styles.cardRowPressable, pressed && { opacity: 0.85 }]}
          onPress={handleEditFaculty}
          disabled={isUpdating}
        >
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('faculty')}</Text>
          <View style={styles.cardValueWrap}>
            <Text style={[styles.cardValue, { color: theme.textSecondary }]} numberOfLines={4}>
              {displayProfileText(user.faculty)}
            </Text>
            <Feather name="edit-2" size={14} color={theme.textSecondary} style={{ marginLeft: 8 }} />
          </View>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={({ pressed }) => [styles.cardRowPressable, pressed && { opacity: 0.85 }]}
          onPress={handleEditPortalSemester}
          disabled={isUpdating}
        >
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('portalSemester')}</Text>
          <View style={styles.cardValueWrap}>
            <Text style={[styles.cardValue, { color: theme.textSecondary }]}>
              {displayPortalSemester(user.currentSemester)}
            </Text>
            <Feather name="edit-2" size={14} color={theme.textSecondary} style={{ marginLeft: 8 }} />
          </View>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={({ pressed }) => [styles.cardRowPressable, pressed && { opacity: 0.85 }]}
          onPress={handleEditStudyMode}
          disabled={isUpdating}
        >
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('studyModeLabel')}</Text>
          <View style={styles.cardValueWrap}>
            <Text style={[styles.cardValue, { color: theme.textSecondary, flex: 1, textAlign: 'right' }]} numberOfLines={2}>
              {studyModeDisplay}
            </Text>
            <Feather name="edit-2" size={14} color={theme.textSecondary} style={{ marginLeft: 8 }} />
          </View>
        </Pressable>
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
                    : `W${profileTeachingWeek} of ${totalWeeks}`}
            </Text>
          </View>
          <View style={styles.segmentBar}>
            {Array.from({ length: totalWeeks }, (_, i) => {
              const filled =
                semesterPhase === 'break_after' || user.isBreak
                  ? true
                  : semesterPhase === 'teaching' && !user.isBreak && i < profileTeachingWeek;
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

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>LOCATION PRIVACY</Text>
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        {privacyOptions.map((opt, i) => (
          <React.Fragment key={opt.value}>
            <Pressable
              style={({ pressed }) => [styles.privacyRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
              onPress={async () => {
                await setLocationVisibility(opt.value);
                if (opt.value === 'circles') {
                  setCircleDropdownOpen((open) => !open);
                } else {
                  setCircleDropdownOpen(false);
                }
              }}
            >
              <View style={{ width: 28, alignItems: 'center', marginRight: 12 }}>
                <Feather name={opt.icon} size={22} color={theme.primary} />
              </View>
              <View style={styles.privacyBody}>
                <Text style={[styles.privacyLabel, { color: theme.text }]}>{opt.label}</Text>
                <Text style={[styles.privacyDesc, { color: theme.textSecondary }]}>{opt.desc}</Text>
              </View>
              {opt.value === 'circles' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {locationVisibility === 'circles' && (
                    <Feather name="check" size={18} color={theme.primary} />
                  )}
                  <Feather
                    name={circleDropdownOpen && locationVisibility === 'circles' ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.textSecondary}
                  />
                </View>
              ) : (
                locationVisibility === opt.value && <Feather name="check" size={20} color={theme.primary} />
              )}
            </Pressable>
            {opt.value === 'circles' && circleDropdownOpen && locationVisibility === 'circles' && (
              <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}>
                {loadingCircleVisibility ? (
                  <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={[styles.cardValue, { color: theme.textSecondary }]}>Loading circles…</Text>
                  </View>
                ) : circles.length === 0 ? (
                  <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={[styles.cardValue, { color: theme.textSecondary }]}>
                      You do not have any circles yet. Create a circle in the Community tab first.
                    </Text>
                  </View>
                ) : (
                  circles.map((c, index) => {
                    const selected = circleVisibilityIds.includes(c.id);
                    return (
                      <React.Fragment key={c.id}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.circleVisibilityRow,
                            pressed && { backgroundColor: theme.backgroundSecondary },
                          ]}
                          onPress={() => toggleCircleVisibility(c.id)}
                        >
                          <View style={{ width: 28, alignItems: 'center', marginRight: 10 }}>
                            <Feather name={featherForLegacyCircleEmoji(c.emoji)} size={18} color={theme.primary} />
                          </View>
                          <View style={styles.circleVisibilityBody}>
                            <Text style={[styles.circleVisibilityLabel, { color: theme.text }]}>{c.name}</Text>
                            <Text style={[styles.circleVisibilityDesc, { color: theme.textSecondary }]}>
                              {selected ? 'Can see your location' : 'Hidden from this circle'}
                            </Text>
                          </View>
                          {selected && <Feather name="check" size={18} color={theme.primary} />}
                        </Pressable>
                        {index < circles.length - 1 && <View style={styles.dividerList} />}
                      </React.Fragment>
                    );
                  })
                )}
              </View>
            )}
            {i < privacyOptions.length - 1 && <View style={styles.dividerList} />}
          </React.Fragment>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>SUBSCRIPTION</Text>
      <Pressable
        onPress={() => router.push('/subscription-plans' as any)}
        style={({ pressed }) => [
          styles.subscriptionCard,
          {
            backgroundColor: theme.card,
            borderColor: theme.cardBorder,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <View style={styles.subscriptionHeaderRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: theme.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              Your plan
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontSize: 22,
                fontWeight: '800',
                color: theme.primary,
                letterSpacing: -0.3,
              }}
            >
              {subscriptionPlanLabel(user.subscriptionPlan)}
            </Text>
            <Text style={{ marginTop: 8, fontSize: 13, fontWeight: '600', color: theme.text, opacity: 0.92 }}>
              Tap to compare Free, Plus & Pro
            </Text>
          </View>
          <Feather name="chevron-right" size={22} color={theme.textSecondary} style={{ alignSelf: 'center', marginLeft: 8 }} />
        </View>

        <View style={styles.subscriptionBody}>
          {planFeaturesLoading ? (
            <View style={{ paddingVertical: 10 }}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : planFeatureLines.length > 0 ? (
            planFeatureLines.slice(0, 3).map((line, idx) => (
              <View key={`${idx}-${line.slice(0, 24)}`} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <Text style={{ color: theme.primary, fontSize: 15, lineHeight: 22 }}>•</Text>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '400', lineHeight: 22, color: theme.textSecondary }}>
                  {line}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: 14, fontWeight: '400', lineHeight: 22, color: theme.textSecondary }}>
              {subscriptionPlanSummary(user.subscriptionPlan)}
            </Text>
          )}
          {planFeatureLines.length > 3 ? (
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 }}>
              + more in plan picker
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, fontWeight: '400', lineHeight: 18, color: theme.textSecondary, marginTop: 12, opacity: 0.92 }}>
            Plans are managed by your school or Rencana admins. Contact support if your plan should change.
          </Text>
        </View>
      </Pressable>

      <View style={{ height: 60 }} />

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEditModalVisible(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{editModalTitle}</Text>
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>{editModalMessage}</Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary || theme.background },
              ]}
              value={editModalValue}
              onChangeText={setEditModalValue}
              autoFocus
              keyboardType={editModalKeyboardType}
              editable={!isUpdating}
              returnKeyType="done"
              onSubmitEditing={handleSaveEditModal}
              placeholderTextColor={theme.textSecondary}
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: theme.border }]}
                onPress={() => setEditModalVisible(false)}
                disabled={isUpdating}
              >
                <Text style={[styles.modalBtnCancelText, { color: theme.textSecondary }]}>{T('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSave, { backgroundColor: theme.primary }]}
                onPress={handleSaveEditModal}
                disabled={isUpdating}
              >
                <Text style={styles.modalBtnSaveText}>{T('save')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={waModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setWaModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setWaModalVisible(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>WhatsApp number</Text>
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>
              Used so people you trade services with can chat you on WhatsApp. Include country code (e.g. +60 12 345 6789). Leave empty to remove.
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary || theme.background },
              ]}
              value={waModalValue}
              onChangeText={setWaModalValue}
              autoFocus
              keyboardType="phone-pad"
              editable={!waSaving}
              placeholder="+60 12 345 6789"
              placeholderTextColor={theme.textSecondary}
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: theme.border }]}
                onPress={() => setWaModalVisible(false)}
                disabled={waSaving}
              >
                <Text style={[styles.modalBtnCancelText, { color: theme.textSecondary }]}>{T('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSave, { backgroundColor: theme.primary }]}
                onPress={handleSaveWhatsapp}
                disabled={waSaving}
              >
                {waSaving ? (
                  <ActivityIndicator size="small" color={theme.textInverse || '#fff'} />
                ) : (
                  <Text style={styles.modalBtnSaveText}>{T('save')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const PAD = 20;
const SECTION = 24;
const RADIUS = 14;

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 56 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backText: { fontSize: 17, fontWeight: '500', marginLeft: -4 },
  settingsBtn: {
    padding: 8,
  },
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
  circleVisibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  circleVisibilityEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  circleVisibilityBody: {
    flex: 1,
  },
  circleVisibilityLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  circleVisibilityDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  subscriptionCard: {
    marginHorizontal: PAD,
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  subscriptionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  subscriptionBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalMessage: {
    fontSize: 13,
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalBtnCancel: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalBtnSave: {},
  modalBtnCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalBtnSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});

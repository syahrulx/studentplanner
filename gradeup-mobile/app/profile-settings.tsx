import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image, ActivityIndicator, Alert, Switch } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { uploadAvatar } from '@/src/lib/communityApi';
import { setHasSeenTutorial } from '@/src/storage';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import Feather from '@expo/vector-icons/Feather';
import type { ThemeIconKey } from '@/constants/ThemeIcons';
import { useTranslations } from '@/src/i18n';
import type { LocationVisibility } from '@/src/lib/communityApi';

const PAD = 20;
const SECTION = 24;
const RADIUS = 14;
const TOTAL_WEEKS = 14;

export default function ProfileSettings() {
  const { user, academicCalendar, language, setUser } = useApp();
  const totalWeeks = academicCalendar?.totalWeeks ?? TOTAL_WEEKS;
  const { locationVisibility, setLocationVisibility } = useCommunity();
  const theme = useTheme();
  const T = useTranslations(language);
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const [isUploading, setIsUploading] = useState(false);

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

  const menuItems: { icon: ThemeIconKey; label: string; onPress: () => void; color: string }[] = [
    { icon: 'settings', label: T('subjectColours'), onPress: () => router.push('/subject-colors' as any), color: '#3b82f6' },
    { icon: 'settings', label: T('languagePref'), onPress: () => router.push('/language-preference' as any), color: '#8b5cf6' },
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
      <View style={[styles.heroWrap, { backgroundColor: theme.primary }]}>
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
          <Text style={styles.heroName}>{user.name}</Text>
          <Text style={styles.heroId}>{user.studentId}</Text>
        </View>
      </View>

      {/* Academic Info */}
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('primaryProgram')}</Text>
          <Text style={[styles.cardValue, { color: theme.textSecondary }]}>{user.program}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cardRow}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>{T('part')}</Text>
          <Text style={[styles.cardValue, { color: theme.textSecondary }]}>{user.part}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={[styles.cardLabel, { color: theme.text }]}>{T('semesterProgress')}</Text>
            <Text style={[styles.cardValue, { color: theme.textSecondary }]}>
              {user.isBreak ? T('semesterBreak') || 'Semester Break' : `W${user.currentWeek} of ${totalWeeks}`}
            </Text>
          </View>
          <View style={styles.segmentBar}>
            {Array.from({ length: totalWeeks }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.segment,
                  i < user.currentWeek
                    ? { backgroundColor: theme.primary }
                    : { backgroundColor: theme.backgroundSecondary || theme.border },
                ]}
              />
            ))}
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

      {/* Semester Config */}
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{T('semesterConfig').toUpperCase()}</Text>
      <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
        <Pressable
          style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
          onPress={() => router.push('/academic-setup' as any)}
        >
          <View style={[styles.iconBox, { backgroundColor: '#dbeafe' }]}>
            <ThemeIcon name="calendar" size={18} color="#1d4ed8" />
          </View>
          <Text style={[styles.menuLabel, { color: theme.text }]}>Academic level & semester</Text>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
        <View style={styles.dividerList} />
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
              <Text style={[styles.menuLabel, { color: theme.text }]}>{item.label}</Text>
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
            {i < menuItems.length - 1 && <View style={styles.dividerList} />}
          </React.Fragment>
        ))}
      </View>

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
  cardLabel: { fontSize: 16, fontWeight: '400' },
  cardValue: { fontSize: 16, fontWeight: '400' },
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
});

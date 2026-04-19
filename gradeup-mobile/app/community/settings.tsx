import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { getCircleLocationVisibility, setCircleLocationVisibility } from '@/src/lib/communityApi';
import { useTheme } from '@/hooks/useTheme';
import Feather from '@expo/vector-icons/Feather';
import { useTranslations } from '@/src/i18n';
import type { LocationVisibility } from '@/src/lib/communityApi';

const PAD = 20;
const RADIUS = 14;

export default function CommunitySettings() {
  const { language } = useApp();
  const {
    locationVisibility,
    setLocationVisibility,
    circles,
    userId,
  } = useCommunity();
  const theme = useTheme();
  const T = useTranslations(language);

  const [isUpdating, setIsUpdating] = useState(false);
  const [circleVisibilityIds, setCircleVisibilityIds] = useState<string[]>([]);
  const [loadingCircleVisibility, setLoadingCircleVisibility] = useState(false);
  const [circleDropdownOpen, setCircleDropdownOpen] = useState(false);

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

  const privacyOptions: { value: LocationVisibility; label: string; icon: string; desc: string }[] = [
    { value: 'public', label: 'Public', icon: '🌍', desc: 'Everyone can see your location' },
    { value: 'friends', label: 'Friends Only', icon: '👥', desc: 'Only friends can see your location' },
    { value: 'circles', label: 'Circles', icon: '⭕️', desc: 'Only people in your circles can see your location' },
    { value: 'off', label: 'Off', icon: '🔒', desc: 'No one can see your location' },
  ];


  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}>
            <Feather name="chevron-left" size={28} color={theme.primary} />
            <Text style={[styles.backText, { color: theme.primary }]}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.titleWrap}>
          <Text style={[styles.largeTitle, { color: theme.text }]}>Community Settings</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Manage your spatial presence and social integrations
          </Text>
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
                <Text style={styles.privacyEmoji}>{opt.icon}</Text>
                <View style={styles.privacyBody}>
                  <Text style={[styles.privacyLabel, { color: theme.text }]}>{opt.label}</Text>
                  <Text style={[styles.privacyDesc, { color: theme.textSecondary }]}>{opt.desc}</Text>
                </View>
                {opt.value === 'circles' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {locationVisibility === 'circles' && <Feather name="check" size={18} color={theme.primary} />}
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
                        No circles found. Create one in the Community tab.
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
                            <Text style={styles.circleVisibilityEmoji}>{c.emoji}</Text>
                            <View style={styles.circleVisibilityBody}>
                              <Text style={[styles.circleVisibilityLabel, { color: theme.text }]}>{c.name}</Text>
                              <Text style={[styles.circleVisibilityDesc, { color: theme.textSecondary }]}>
                                {selected ? 'Visible' : 'Hidden'}
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


        <Text style={styles.footerNote}>
          These settings only affect the Community tab. For global app preferences like themes and notifications, visit the main Settings.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 56 },
  headerRow: {
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backText: { fontSize: 17, fontWeight: '500', marginLeft: -4 },
  titleWrap: {
    marginHorizontal: PAD,
    marginBottom: 24,
  },
  largeTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: PAD,
    marginBottom: 8,
    marginTop: 24,
    letterSpacing: 0.5,
  },
  cardGroup: {
    marginHorizontal: PAD,
    borderRadius: RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(150,150,150,0.2)',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  privacyEmoji: { fontSize: 24, marginRight: 12 },
  privacyBody: { flex: 1 },
  privacyLabel: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
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
  circleVisibilityBody: { flex: 1 },
  circleVisibilityLabel: { fontSize: 14, fontWeight: '600' },
  circleVisibilityDesc: { fontSize: 12, marginTop: 2 },

  dividerList: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(150,150,150,0.2)',
    marginLeft: 16,
  },
  footerNote: {
    marginHorizontal: PAD,
    marginTop: 32,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    opacity: 0.6,
  },
  cardValue: { fontSize: 14, fontWeight: '400' },
});

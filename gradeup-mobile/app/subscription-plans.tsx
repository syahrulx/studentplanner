import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { fetchIsGradeUpAdmin } from '@/src/lib/gradeUpAdmin';
import { getEnabledSubscriptionFeaturesAllTiers } from '@/src/lib/subscriptionFeatures';
import { subscriptionPlanLabel } from '@/src/lib/profileDisplay';
import type { SubscriptionPlan } from '@/src/types';
import { useTheme } from '@/hooks/useTheme';

const TIERS: SubscriptionPlan[] = ['free', 'plus', 'pro'];

function tierPriceLabel(plan: SubscriptionPlan): string {
  if (plan === 'free') return 'Free';
  return 'Paid · coming soon';
}

/** Plus is not self-serve for anyone yet; Pro only for GradeUp staff. */
function isTierLocked(plan: SubscriptionPlan, staff: boolean): boolean {
  if (plan === 'free') return false;
  if (plan === 'plus') return true;
  return !staff;
}

export default function SubscriptionPlansScreen() {
  const theme = useTheme();
  const { user, updateProfile } = useApp();
  const { userId } = useCommunity();
  const [staff, setStaff] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [features, setFeatures] = useState<Record<SubscriptionPlan, string[]>>({
    free: [],
    plus: [],
    pro: [],
  });
  const [loadingFeatures, setLoadingFeatures] = useState(true);
  const [selected, setSelected] = useState<SubscriptionPlan>('free');
  const [saving, setSaving] = useState(false);

  const currentTier: SubscriptionPlan =
    user.subscriptionPlan === 'plus' || user.subscriptionPlan === 'pro' ? user.subscriptionPlan : 'free';

  useEffect(() => {
    setSelected(currentTier);
  }, [currentTier]);

  useEffect(() => {
    let c = false;
    if (!userId) {
      setStaff(false);
      setLoadingStaff(false);
      return;
    }
    setLoadingStaff(true);
    fetchIsGradeUpAdmin(userId).then((ok) => {
      if (!c) setStaff(ok);
      if (!c) setLoadingStaff(false);
    });
    return () => {
      c = true;
    };
  }, [userId]);

  const loadFeatures = useCallback(() => {
    setLoadingFeatures(true);
    getEnabledSubscriptionFeaturesAllTiers()
      .then(setFeatures)
      .catch(() => setFeatures({ free: [], plus: [], pro: [] }))
      .finally(() => setLoadingFeatures(false));
  }, []);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  const dirty = selected !== currentTier;

  const ctaGradient = useMemo(() => [theme.primary, theme.accent2] as [string, string], [theme.primary, theme.accent2]);

  const onSelectTier = (plan: SubscriptionPlan) => {
    if (isTierLocked(plan, staff)) {
      if (plan === 'plus') {
        Alert.alert(
          'Plus',
          'Plus will unlock when paid subscriptions go live. Your school or GradeUp can assign a plan for you.',
        );
        return;
      }
      Alert.alert(
        'Pro',
        'Pro is a paid tier. Upgrades will be available here after billing goes live.',
      );
      return;
    }
    setSelected(plan);
  };

  const onSave = async () => {
    if (!dirty) {
      router.back();
      return;
    }
    if (isTierLocked(selected, staff)) return;
    setSaving(true);
    try {
      await updateProfile({ subscriptionPlan: selected });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not update your plan.');
    } finally {
      setSaving(false);
    }
  };

  const footerHint = useMemo(() => {
    if (staff) {
      return 'Staff accounts can switch to Pro for testing. Plus unlocks when billing is ready.';
    }
    return 'Paid upgrades will be available in the app after launch. You can cancel or change later where applicable.';
  }, [staff]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}>
            <Feather name="chevron-left" size={28} color={theme.text} />
          </Pressable>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.text }]}>Choose a plan</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Compare Free, Plus, and Pro. Paid tiers stay locked until checkout opens.
          </Text>

          {loadingFeatures ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
          ) : (
            <View style={styles.cards}>
              {TIERS.map((plan) => {
                const locked = isTierLocked(plan, staff);
                const isSelected = selected === plan;
                const lines = features[plan] ?? [];
                const showStaffRibbon = plan === 'pro' && staff;
                const borderActive = isSelected && !locked;
                const borderLockedCurrent = isSelected && locked;

                return (
                  <Pressable
                    key={plan}
                    onPress={() => onSelectTier(plan)}
                    style={({ pressed }) => [
                      styles.card,
                      {
                        backgroundColor: theme.card,
                        borderColor: borderActive
                          ? theme.primary
                          : borderLockedCurrent
                            ? theme.warning
                            : theme.cardBorder,
                      },
                      borderActive && {
                        shadowColor: theme.primary,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.35,
                        shadowRadius: 12,
                        elevation: 6,
                      },
                      locked && { opacity: 0.9 },
                      pressed && { opacity: 0.88 },
                    ]}
                  >
                    {showStaffRibbon ? (
                      <View
                        style={[styles.staffRibbon, { backgroundColor: theme.accent2 }]}
                        accessibilityLabel="Staff access to Pro"
                      >
                        <Feather name="star" size={11} color={theme.textInverse} />
                        <Text style={[styles.staffRibbonText, { color: theme.textInverse }]}>Admin</Text>
                      </View>
                    ) : null}

                    <View style={styles.cardTop}>
                      <View
                        style={[
                          styles.radioOuter,
                          { borderColor: theme.textSecondary },
                          borderActive && { borderColor: theme.primary },
                          borderLockedCurrent && { borderColor: theme.warning },
                        ]}
                      >
                        {isSelected ? (
                          <View
                            style={[
                              styles.radioInner,
                              {
                                backgroundColor: locked ? theme.warning : theme.primary,
                              },
                            ]}
                          />
                        ) : null}
                      </View>
                      <View style={styles.cardTopText}>
                        <View style={styles.cardTitleRow}>
                          <Text style={[styles.cardTitle, { color: theme.text }]}>{subscriptionPlanLabel(plan)}</Text>
                          {locked ? (
                            <Feather name="lock" size={16} color={theme.textSecondary} style={{ marginLeft: 8 }} />
                          ) : null}
                        </View>
                        <Text style={[styles.cardPrice, { color: theme.primary }]}>{tierPriceLabel(plan)}</Text>
                        <Text style={[styles.cardBlurb, { color: theme.textSecondary }]}>
                          {plan === 'free'
                            ? 'Everything you need to plan classes and stay on track.'
                            : plan === 'plus'
                              ? 'Higher limits and integrations when subscriptions launch.'
                              : 'Full power for staff testing and future top tier.'}
                        </Text>
                      </View>
                    </View>

                    {lines.length > 0 ? (
                      <View
                        style={[styles.bullets, { borderTopColor: theme.border }]}
                      >
                        {lines.slice(0, 6).map((line, idx) => (
                          <View key={`${plan}-${idx}`} style={styles.bulletRow}>
                            <Text style={[styles.bulletDot, { color: theme.primary }]}>•</Text>
                            <Text style={[styles.bulletText, { color: theme.textSecondary }]}>{line}</Text>
                          </View>
                        ))}
                        {lines.length > 6 ? (
                          <Text style={[styles.moreLines, { color: theme.textSecondary }]}>
                            + {lines.length - 6} more
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={[styles.footerNote, { color: theme.textSecondary }]}>{footerHint}</Text>
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={[styles.bottomSafe, { backgroundColor: theme.background }]}>
          <Pressable
            onPress={() => void onSave()}
            disabled={saving || loadingStaff}
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
          >
            <LinearGradient
              colors={ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.cta, (saving || loadingStaff) && { opacity: 0.6 }]}
            >
              <Text style={[styles.ctaText, { color: theme.textInverse }]}>{dirty ? 'Save plan' : 'Done'}</Text>
            </LinearGradient>
          </Pressable>
        </SafeAreaView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  iconBtn: { padding: 8 },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 8,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  cards: { marginTop: 24, gap: 14 },
  card: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    overflow: 'hidden',
  },
  staffRibbon: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 2,
  },
  staffRibbonText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  cardTopText: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '800' },
  cardPrice: { marginTop: 4, fontSize: 16, fontWeight: '700' },
  cardBlurb: { marginTop: 6, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  bullets: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bulletDot: { fontSize: 14, lineHeight: 20 },
  bulletText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 20 },
  moreLines: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  footerNote: {
    marginTop: 20,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomSafe: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  cta: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '800' },
});

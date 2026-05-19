import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
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
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isPurchaseCancelled,
  type PlanOfferings,
} from '@/src/lib/purchases';
import type { SubscriptionPlan } from '@/src/types';
import type { PurchasesPackage } from 'react-native-purchases';
import { useTheme } from '@/hooks/useTheme';


const TIERS: SubscriptionPlan[] = ['free', 'plus', 'pro'];

export default function SubscriptionPlansScreen() {
  const theme = useTheme();
  const { user, updateProfile } = useApp();
  const { userId } = useCommunity();
  const [staff, setStaff] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [features, setFeatures] = useState<Record<SubscriptionPlan, string[]>>({
    free: [
      'Full student planner with timetable, tasks & notes',
      'Auto-generated timetable from a photo',
      'Activity Status & daily Study Snap photo',
      'Basic AI note & flashcard tools',
      'Customizable location privacy',
      'Baik korang subs, kalau tak dapat sambutan nanti kami letak ads dekat app ni :)'
    ],
    plus: [
      'Everything in Free, plus:',
      'Premium app & widget themes (Cat, Mono, Spider, Aurora Purple)',
      'Import tasks from Apple & Google Calendar',
      'Smarter AI with much higher monthly limits',
      'AI Tutor: 1 persistent chat history per subject',
      'Study Snap: 3 photos/day & 1-week history'
    ],
    pro: [
      'Everything in Plus, plus:',
      'Highest monthly AI allowance with our smartest models',
      'Smarter, more accurate results for notes and schedules',
      'Pro AI chatbot tutor with expert-level study help',
      'Study Snap: highest photo allowance & full history archive',
      'Activity Status: Custom text & emoji statuses',
      'Share AI-generated flashcards with friends & study circles'
    ],
  });
  const [loadingFeatures, setLoadingFeatures] = useState(true);
  const [selected, setSelected] = useState<SubscriptionPlan>('free');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // RevenueCat offerings (real prices from App Store / Play Store)
  const [offerings, setOfferings] = useState<PlanOfferings | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(true);

  const currentTier: SubscriptionPlan =
    user.subscriptionPlan === 'plus' || user.subscriptionPlan === 'pro' ? user.subscriptionPlan : 'free';

  useEffect(() => {
    setSelected(currentTier);
  }, [currentTier]);

  // Load staff status
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

  // Load feature bullets
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

  // Load RevenueCat offerings (real prices)
  useEffect(() => {
    setLoadingOfferings(true);
    getOfferings()
      .then(setOfferings)
      .catch(() => setOfferings(null))
      .finally(() => setLoadingOfferings(false));
  }, []);

  /** Get the PurchasesPackage for a given tier. */
  const packageForTier = useCallback(
    (plan: SubscriptionPlan): PurchasesPackage | null => {
      if (!offerings) return null;
      if (plan === 'plus') return offerings.plusPackage;
      if (plan === 'pro') return offerings.proPackage;
      return null;
    },
    [offerings],
  );

  /** Get the display price string from the store (e.g. "RM 9.90" or "$2.49"). */
  const priceForTier = useCallback(
    (plan: SubscriptionPlan): string => {
      if (plan === 'free') return 'Free forever';
      if (plan === 'plus') return 'RM 4.99/month';
      if (plan === 'pro') return 'RM 10.99/month';
      const pkg = packageForTier(plan);
      if (!pkg) return 'Loading...';
      return `${pkg.product.priceString}/month`;
    },
    [packageForTier],
  );

  const ctaGradient = useMemo(() => [theme.primary, theme.accent2] as [string, string], [theme.primary, theme.accent2]);

  const onSelectTier = (plan: SubscriptionPlan) => {
    setSelected(plan);
  };

  /** Handle the primary CTA — purchase or downgrade. */
  const onPurchase = async () => {
    if (selected === currentTier) {
      router.back();
      return;
    }

    // Staff can still force-set plans via DB (for testing)
    if (staff) {
      setPurchasing(true);
      try {
        await updateProfile({ subscriptionPlan: selected });
        router.back();
      } catch {
        Alert.alert('Error', 'Could not update your plan.');
      } finally {
        setPurchasing(false);
      }
      return;
    }

    // Downgrade to free — they manage this from their phone's Settings
    if (selected === 'free') {
      if (Platform.OS === 'ios') {
        Alert.alert(
          'Manage Subscription',
          'To cancel your subscription, go to iPhone Settings → Apple ID → Subscriptions → Rencana.',
          [
            { text: 'Open Settings', onPress: () => Linking.openURL('https://apps.apple.com/account/subscriptions') },
            { text: 'OK', style: 'cancel' },
          ],
        );
      } else {
        Alert.alert(
          'Manage Subscription',
          'To cancel your subscription, go to Google Play Store → Menu → Subscriptions → Rencana.',
          [
            { text: 'Open Play Store', onPress: () => Linking.openURL('https://play.google.com/store/account/subscriptions') },
            { text: 'OK', style: 'cancel' },
          ],
        );
      }
      return;
    }

    // Purchase the selected tier
    const pkg = packageForTier(selected);
    if (!pkg) {
      Alert.alert('Error', 'This plan is not available yet. Please try again later.');
      return;
    }

    setPurchasing(true);
    try {
      const newPlan = await purchasePackage(pkg);
      // Explicitly write the plan to Supabase to keep admin/backend in sync instantly
      await updateProfile({ subscriptionPlan: newPlan }).catch((err) => {
        console.warn('[SubscriptionPlans] Sync to DB failed:', err);
      });
      
      Alert.alert(
        '🎉 Welcome!',
        `You're now on ${subscriptionPlanLabel(newPlan)}! All features are unlocked.`,
        [{ text: 'Awesome', onPress: () => router.back() }],
      );
    } catch (e: any) {
      // User cancelled the purchase — not an error
      if (isPurchaseCancelled(e)) return;
      console.warn('[SubscriptionPlans] purchase error:', e);
      Alert.alert('Purchase Failed', e?.message || 'Something went wrong. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  /** Restore previous purchases (Apple requires this button). */
  const onRestore = async () => {
    setRestoring(true);
    try {
      const restoredPlan = await restorePurchases();
      // Explicitly write the restored plan to Supabase
      await updateProfile({ subscriptionPlan: restoredPlan }).catch((err) => {
        console.warn('[SubscriptionPlans] Sync to DB failed:', err);
      });

      if (restoredPlan !== 'free') {
        Alert.alert(
          'Purchases Restored',
          `Your ${subscriptionPlanLabel(restoredPlan)} subscription has been restored!`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        Alert.alert('No Purchases Found', 'We couldn\'t find any active subscriptions to restore.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const onContactSupport = () => {
    const phoneNumber = '601111659435'; 
    const message = encodeURIComponent('Hi, I have a question about my account and subscription plans.');
    Linking.openURL(`https://wa.me/${phoneNumber}?text=${message}`).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp. Make sure it is installed.');
    });
  };

  const dirty = selected !== currentTier;
  const isLoading = loadingFeatures || loadingOfferings;

  const ctaLabel = useMemo(() => {
    if (!dirty) return 'Done';
    if (selected === 'free') return 'Manage Subscription';
    return `Subscribe to ${subscriptionPlanLabel(selected)}`;
  }, [dirty, selected]);

  const footerHint = useMemo(() => {
    if (staff) {
      return 'Staff accounts can switch plans directly for testing.';
    }
    return 'Subscriptions auto-renew monthly. Cancel anytime from your device settings.';
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
            Unlock powerful AI, premium themes, and the full study toolkit.
          </Text>

          {isLoading ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
          ) : (
            <View style={styles.cards}>
              {TIERS.map((plan) => {
                const isSelected = selected === plan;
                const lines = features[plan] ?? [];
                const showStaffRibbon = plan === 'pro' && staff;
                const isCurrent = currentTier === plan;
                const price = priceForTier(plan);

                return (
                  <Pressable
                    key={plan}
                    onPress={() => onSelectTier(plan)}
                    style={({ pressed }) => [
                      styles.card,
                      {
                        backgroundColor: theme.card,
                        borderColor: isSelected ? theme.primary : theme.cardBorder,
                      },
                      isSelected && {
                        shadowColor: theme.primary,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.35,
                        shadowRadius: 12,
                        elevation: 6,
                      },
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

                    {isCurrent ? (
                      <View style={[styles.currentBadge, { backgroundColor: theme.primary + '20' }]}>
                        <Text style={[styles.currentBadgeText, { color: theme.primary }]}>Current Plan</Text>
                      </View>
                    ) : null}

                    <View style={styles.cardTop}>
                      <View
                        style={[
                          styles.radioOuter,
                          { borderColor: theme.textSecondary },
                          isSelected && { borderColor: theme.primary },
                        ]}
                      >
                        {isSelected ? (
                          <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />
                        ) : null}
                      </View>
                      <View style={styles.cardTopText}>
                        <View style={styles.cardTitleRow}>
                          <Text style={[styles.cardTitle, { color: theme.text }]}>{subscriptionPlanLabel(plan)}</Text>
                        </View>
                        <Text style={[styles.cardPrice, { color: theme.primary }]}>{price}</Text>
                        <Text style={[styles.cardBlurb, { color: theme.textSecondary }]}>
                          {plan === 'free'
                            ? 'The core student planner — free for as long as you study.'
                            : plan === 'plus'
                              ? 'Smarter AI, premium themes and calendar import.'
                              : 'The ultimate study toolkit with our smartest AI and full social power.'}
                        </Text>
                      </View>
                    </View>

                    {lines.length > 0 ? (
                      <View
                        style={[styles.bullets, { borderTopColor: theme.border }]}
                      >
                        {lines.map((line, idx) => (
                          <View key={`${plan}-${idx}`} style={styles.bulletRow}>
                            <Feather name="check" size={14} color={theme.primary} style={{ marginTop: 2 }} />
                            <Text style={[styles.bulletText, { color: theme.textSecondary }]}>{line}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={[styles.footerNote, { color: theme.textSecondary }]}>{footerHint}</Text>

          {/* Restore Purchases — Apple requires this button */}
          <Pressable
            onPress={onRestore}
            disabled={restoring}
            style={({ pressed }) => [styles.restoreBtn, pressed && { opacity: 0.7 }]}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={[styles.restoreBtnText, { color: theme.primary }]}>Restore Purchases</Text>
            )}
          </Pressable>

          <Pressable onPress={onContactSupport} style={({ pressed }) => [styles.supportBtn, pressed && { opacity: 0.7 }]}>
            <Feather name="message-circle" size={16} color={theme.textSecondary} />
            <Text style={[styles.supportBtnText, { color: theme.textSecondary }]}>Need help? Contact Support</Text>
          </Pressable>

        </ScrollView>

        <SafeAreaView edges={['bottom']} style={[styles.bottomSafe, { backgroundColor: theme.background }]}>
          <Pressable
            onPress={() => void onPurchase()}
            disabled={purchasing || loadingStaff || isLoading}
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
          >
            <LinearGradient
              colors={ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.cta, (purchasing || loadingStaff || isLoading) && { opacity: 0.6 }]}
            >
              {purchasing ? (
                <ActivityIndicator size="small" color={theme.textInverse} />
              ) : (
                <Text style={[styles.ctaText, { color: theme.textInverse }]}>{ctaLabel}</Text>
              )}
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
  currentBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 2,
  },
  currentBadgeText: {
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
  bulletText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 20 },
  footerNote: {
    marginTop: 20,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
  restoreBtn: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  restoreBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  supportBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  supportBtnText: {
    fontSize: 13,
    fontWeight: '500',
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

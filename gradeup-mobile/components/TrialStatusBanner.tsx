import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import {
  formatTrialEndDate,
  getTrialState,
  isTrialEndingSoon,
  trialHeadline,
  trialRenewalNotice,
} from '@/src/lib/subscriptionStatus';

/**
 * Countdown shown while a store free trial is running.
 *
 * A free trial silently becomes a charge on its last day. Showing the charge
 * date in the app — not only in the Play Store / App Store subscription
 * screens the user never opens — is what keeps a converted trial from arriving
 * as a surprise (and a refund request).
 *
 * Renders nothing outside a trial, so it is safe to mount unconditionally.
 */
export function TrialStatusBanner() {
  const { user } = useApp();
  const theme = useTheme();

  const trial = getTrialState(user);
  if (!trial) return null;

  const endingSoon = isTrialEndingSoon(trial);
  // Cancelled trials are no longer urgent — nothing will be charged — so they
  // stay in the calm accent even on the final day.
  const accent = endingSoon && trial.willRenew ? theme.warning : theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${trialHeadline(trial)}. ${trialRenewalNotice(trial)}`}
      accessibilityHint="Opens your subscription plans"
      onPress={() => router.push('/subscription-plans' as any)}
      style={({ pressed }) => [
        styles.wrap,
        { backgroundColor: theme.card, borderColor: accent },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: accent + '22' }]}>
        <Feather name={endingSoon && trial.willRenew ? 'alert-circle' : 'gift'} size={18} color={accent} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.headline, { color: theme.text }]} numberOfLines={1}>
          {trialHeadline(trial)}
        </Text>
        <Text style={[styles.notice, { color: theme.textSecondary }]} numberOfLines={2}>
          {trialRenewalNotice(trial)}
        </Text>
      </View>
      <View style={styles.tail}>
        <Text style={[styles.endDate, { color: accent }]}>{formatTrialEndDate(trial)}</Text>
        <Feather name="chevron-right" size={18} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  headline: { fontSize: 14, fontWeight: '800' },
  notice: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  tail: { alignItems: 'flex-end' },
  endDate: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
});

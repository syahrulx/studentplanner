import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import {
  primeTrialOffers,
  trialTagline,
  upgradeButtonLabel,
  upgradeCopy,
  upgradeCtaLabel,
  type PaidPlan,
  type UpgradeCopyOptions,
} from '@/src/lib/upgradePrompt';

/**
 * Trial-aware upsell gates.
 *
 * Warms the store's trial-eligibility cache on mount and re-renders once it
 * lands, so a gate that opens a moment later can name the free trial instead of
 * a bare "Upgrade". Until then — and whenever the store says this account is not
 * eligible — the copy silently degrades to the plain plan wording.
 */
export function useUpgradePrompt() {
  const [, setOffersLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void primeTrialOffers().then(() => {
      if (alive) setOffersLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Show the gate dialog; the confirm button opens the paywall. */
  const promptUpgrade = useCallback((options: UpgradeCopyOptions) => {
    const copy = upgradeCopy(options);
    Alert.alert(copy.title, copy.message, [
      { text: 'Not now', style: 'cancel' },
      { text: copy.cta, onPress: () => router.push('/subscription-plans' as any) },
    ]);
  }, []);

  /** Label for an inline upsell button, e.g. "Try Plus free for 7 days". */
  const upgradeLabel = useCallback((plan: PaidPlan) => upgradeButtonLabel(plan), []);

  /** Short confirm-button label for a dialog this hook does not own. */
  const ctaLabel = useCallback((plan: PaidPlan) => upgradeCtaLabel(plan), []);

  /** Trial sentence to append to a caller's own message; '' when none is offered. */
  const tagline = useCallback((plan: PaidPlan) => trialTagline(plan), []);

  /** Send the user to the paywall. */
  const openPaywall = useCallback(() => router.push('/subscription-plans' as any), []);

  return { promptUpgrade, upgradeLabel, ctaLabel, tagline, openPaywall };
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ScreenContainer } from '@/components/ScreenContainer';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import { useLockScreenHealth } from '@/hooks/useLockScreenHealth';
import { withAlpha } from '@/src/lib/contrast';
import { detectUses24h, fmtWhen } from '@/src/lib/lockScreen/lockScreenFormat';
import type { LockScreenHealth, LockScreenSetupState } from '@/src/lib/lockScreen/types';
import { getFirstSuccess } from '@/src/lib/smartCapture/smartCaptureSetupState';
import {
  fetchShortcutLink,
  getCachedShortcutLink,
  SHORTCUTS_APP_URL,
  type ShortcutLink,
} from '@/src/lib/smartCapture/smartCaptureShortcut';

/**
 * Setup and education for the two Smart Capture automations.
 *
 * The Back Tap card walks through installing a shortcut that runs
 * `Take Screenshot → Rencana: Plan from screenshot` (the App Intent declared in
 * modules/smart-capture/ios-app-target/SmartCaptureIntents.swift) and then
 * binding it to Back Tap in Accessibility settings. iOS gives apps no way to
 * create the shortcut or set Back Tap programmatically, so the flow is guided
 * rather than automatic.
 *
 * The last card (iPhone only) is the entry to the self-refreshing lock screen
 * Studio; its status line mirrors the Studio's pill so both say the same thing.
 */

/**
 * The shortcut link is remote config (`app_config.smart_capture_shortcut_url`),
 * so it can be published or rotated without an app update.
 *
 * To build the shortcut: Shortcuts → new shortcut → add "Take Screenshot" → add
 * Rencana's "Plan from screenshot" action and pass the screenshot into it →
 * name it "Plan from screenshot" → Share → Copy iCloud Link, then store that
 * link in app_config. Until then the button opens the Shortcuts app and the
 * steps on screen describe how to build it by hand.
 */

export default function SmartAutomations() {
  const { language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const isIos = Platform.OS === 'ios';
  // Auto-refresh is iPhone-only (health reports iPad as unsupported), so iPad gets no card.
  const showLockScreenCard = Platform.OS === 'ios' && !Platform.isPad;

  const [backTapWorking, setBackTapWorking] = useState(false);
  const [shortcut, setShortcut] = useState<ShortcutLink>({
    url: SHORTCUTS_APP_URL,
    isPublished: false,
  });

  useEffect(() => {
    let alive = true;
    void getFirstSuccess().then((success) => {
      if (alive) setBackTapWorking(success?.source === 'back_tap');
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isIos) return;
    let alive = true;
    // Paint from cache first so the button is never wrong for a beat, then
    // reconcile with whatever is configured right now.
    void getCachedShortcutLink().then((cached) => {
      if (alive && cached.isPublished) setShortcut(cached);
    });
    void fetchShortcutLink().then((link) => {
      if (alive) setShortcut(link);
    });
    return () => {
      alive = false;
    };
  }, [isIos]);

  const openShortcut = useCallback(() => {
    Linking.openURL(shortcut.url).catch(() => {
      // A stale or revoked iCloud link should still leave the student somewhere
      // useful: the Shortcuts app, where the on-screen steps apply.
      if (shortcut.url !== SHORTCUTS_APP_URL) {
        Linking.openURL(SHORTCUTS_APP_URL).catch(() => {});
      }
    });
  }, [shortcut]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={26} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back</Text>
        </Pressable>
      </View>

      <LinearGradient
        colors={[theme.primary, theme.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroIcon}>
          <Feather name="zap" size={22} color={theme.textInverse} />
        </View>
        <Text style={[styles.heroTitle, { color: theme.textInverse }]}>{T('smartAutomations')}</Text>
        <Text style={[styles.heroSub, { color: theme.textInverse }]}>
          {T('smartAutomationsSub')}
        </Text>
      </LinearGradient>

      <Card theme={theme}>
        <CardHeader theme={theme} icon="share-2" title={T('saShareTitle')} body={T('saShareBody')} />
        <Step theme={theme} index={1} label={T('saShareStep1')} />
        <Step theme={theme} index={2} label={T('saShareStep2')} />
        <Step theme={theme} index={3} label={T('saShareStep3')} last />
      </Card>

      {isIos ? (
        <Card theme={theme}>
          <CardHeader
            theme={theme}
            icon="smartphone"
            title={T('saBackTapTitle')}
            body={T('saBackTapBody')}
          />

          <Step
            theme={theme}
            index={1}
            label={T('saBackTapStep1')}
            sub={shortcut.isPublished ? T('saBackTapStep1Sub') : T('saBackTapStep1SubManual')}
          >
            <ActionButton
              theme={theme}
              label={shortcut.isPublished ? T('saAddShortcut') : T('saOpenShortcuts')}
              onPress={openShortcut}
            />
          </Step>

          <Step theme={theme} index={2} label={T('saBackTapStep2')} sub={T('saBackTapStep2Sub')}>
            <ActionButton theme={theme} label={T('saOpenSettings')} onPress={openSettings} />
          </Step>

          <Step theme={theme} index={3} label={T('saBackTapStep3')} last>
            <View style={styles.statusRow}>
              <Feather
                name={backTapWorking ? 'check-circle' : 'clock'}
                size={15}
                color={backTapWorking ? theme.success : theme.textSecondary}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: backTapWorking ? theme.success : theme.textSecondary },
                ]}
              >
                {backTapWorking ? T('saDone') : T('saWaitingFirst')}
              </Text>
            </View>
          </Step>
        </Card>
      ) : (
        <Card theme={theme}>
          <CardHeader
            theme={theme}
            icon="crop"
            title={T('scFromScreenshot')}
            body={T('saAndroidHint')}
          />
        </Card>
      )}

      {showLockScreenCard ? <LockScreenCard theme={theme} T={T} /> : null}
    </ScreenContainer>
  );
}

type ThemeShape = ReturnType<typeof useTheme>;
type Translate = ReturnType<typeof useTranslations>;

/** Same dot colours as the Studio's status pill. */
const LOCK_DOT_COLOR: Record<LockScreenHealth['kind'], string> = {
  unsupported: '#8E8E93',
  off: '#8E8E93',
  setup: '#FF9F0A',
  pending: '#0A84FF',
  healthy: '#30D158',
  stale: '#FF9F0A',
};

/** The Studio pill's resting text, without its transient overrides (Preparing, Updating). */
function lockStatusText(
  health: LockScreenHealth,
  setup: LockScreenSetupState,
  T: Translate,
  uses24h: boolean,
): string {
  const now = Date.now();
  switch (health.kind) {
    case 'unsupported':
      return T('lsUnavailable');
    case 'off':
      return T('lsPillOff');
    case 'setup':
      return T('lsPillSetup');
    case 'pending':
      return T('lsPillPending');
    case 'healthy':
      return T('lsPillUpdated').replace('{when}', fmtWhen(health.lastServedAt, now, T, uses24h));
    case 'stale': {
      // Never served: count from when setup finished. Stale implies completedAt
      // (health rule 3), so the final fallback only satisfies the type.
      const since = health.lastServedAt ?? setup.completedAt ?? now;
      return T('lsPillStale').replace('{when}', fmtWhen(since, now, T, uses24h));
    }
  }
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduce(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

function LockScreenCard({ theme, T }: { theme: ThemeShape; T: Translate }) {
  const { health, setup, loaded } = useLockScreenHealth();
  const uses24h = useMemo(detectUses24h, []);
  const isOff = health.kind === 'off';
  // Amber and grey states want a nudge; a working lock screen just needs a way in.
  const needsAction = isOff || health.kind === 'setup' || health.kind === 'stale';
  const ctaLabel = isOff ? T('lsSaCardCtaSetup') : T('lsSaCardCtaOpen');

  // Storage usually loaded at launch (the render host reads it), so this only
  // fades on a cold first visit — and keeps "Set up" from flashing to "Open".
  const reveal = useSharedValue(loaded ? 1 : 0);
  useEffect(() => {
    if (loaded) reveal.value = withTiming(1, { duration: 180 });
  }, [loaded, reveal]);
  const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));

  const open = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push(isOff ? '/lock-wallpaper?setup=1' : '/lock-wallpaper');
  }, [isOff]);

  return (
    <Card theme={theme}>
      <View style={styles.cardHeader}>
        <LinearGradient
          colors={[theme.primary, theme.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.lockTile}
        >
          <Feather name="lock" size={20} color={theme.textInverse} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{T('lsSaCardTitle')}</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>{T('lsSaCardSub')}</Text>
        </View>
      </View>

      <Animated.View
        style={[styles.lockFooter, { borderTopColor: theme.border }, revealStyle]}
        pointerEvents={loaded ? 'auto' : 'none'}
        accessibilityElementsHidden={!loaded}
        importantForAccessibility={loaded ? 'auto' : 'no-hide-descendants'}
      >
        <View style={styles.lockStatus}>
          <StatusDot color={LOCK_DOT_COLOR[health.kind]} pulsing={health.kind === 'pending'} />
          <Text
            style={[styles.statusText, styles.lockStatusText, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            {lockStatusText(health, setup, T, uses24h)}
          </Text>
        </View>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${ctaLabel}, ${T('lsSaCardTitle')}`}
          hitSlop={6}
          style={({ pressed }) => [
            styles.lockBtn,
            needsAction
              ? { backgroundColor: theme.primary, borderColor: theme.primary }
              : { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.actionBtnText, { color: needsAction ? theme.textInverse : theme.primary }]}>
            {ctaLabel}
          </Text>
          <Feather
            name="chevron-right"
            size={15}
            color={needsAction ? theme.textInverse : theme.primary}
          />
        </Pressable>
      </Animated.View>
    </Card>
  );
}

/** Coloured status dot on a soft halo; breathes like the Studio pill while waiting. */
function StatusDot({ color, pulsing }: { color: string; pulsing: boolean }) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (pulsing && !reduceMotion) {
      opacity.value = withRepeat(
        withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(opacity);
      opacity.value = 1;
    }
    return () => cancelAnimation(opacity);
  }, [pulsing, reduceMotion, opacity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.lockDotHalo, { backgroundColor: withAlpha(color, '2E') }, pulseStyle]}>
      <View style={[styles.lockDot, { backgroundColor: color }]} />
    </Animated.View>
  );
}

function Card({ theme, children }: { theme: ThemeShape; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      {children}
    </View>
  );
}

function CardHeader({
  theme,
  icon,
  title,
  body,
}: {
  theme: ThemeShape;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.cardHeader}>
      <View style={[styles.cardIcon, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name={icon} size={18} color={theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>{body}</Text>
      </View>
    </View>
  );
}

function Step({
  theme,
  index,
  label,
  sub,
  last,
  children,
}: {
  theme: ThemeShape;
  index: number;
  label: string;
  sub?: string;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepGutter}>
        <View style={[styles.stepDot, { backgroundColor: theme.primary }]}>
          <Text style={[styles.stepDotText, { color: theme.textInverse }]}>{index}</Text>
        </View>
        {last ? null : <View style={[styles.stepLine, { backgroundColor: theme.border }]} />}
      </View>
      <View style={[styles.stepBody, last && { paddingBottom: 4 }]}>
        <Text style={[styles.stepLabel, { color: theme.text }]}>{label}</Text>
        {sub ? <Text style={[styles.stepSub, { color: theme.textSecondary }]}>{sub}</Text> : null}
        {children}
      </View>
    </View>
  );
}

function ActionButton({
  theme,
  label,
  onPress,
}: {
  theme: ThemeShape;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.actionBtnText, { color: theme.primary }]}>{label}</Text>
      <Feather name="arrow-up-right" size={14} color={theme.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: 16, fontWeight: '600', marginLeft: -4 },

  hero: { borderRadius: 26, padding: 22, gap: 6 },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  heroTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  heroSub: { fontSize: 13, fontWeight: '600', opacity: 0.86, lineHeight: 19 },

  card: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 4 },
  cardHeader: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  cardIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  cardBody: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginTop: 3 },

  step: { flexDirection: 'row', gap: 12 },
  stepGutter: { alignItems: 'center', width: 24 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepDotText: { fontSize: 12, fontWeight: '900' },
  stepLine: { width: 2, flex: 1, marginVertical: 4, borderRadius: 1 },
  stepBody: { flex: 1, paddingBottom: 18, gap: 4 },
  stepLabel: { fontSize: 14, fontWeight: '800' },
  stepSub: { fontSize: 12.5, fontWeight: '500', lineHeight: 18 },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  actionBtnText: { fontSize: 13, fontWeight: '800' },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  statusText: { fontSize: 13, fontWeight: '700' },

  lockTile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  lockFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lockStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockStatusText: { flex: 1, lineHeight: 18 },
  lockDotHalo: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  lockDot: { width: 8, height: 8, borderRadius: 4 },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
});

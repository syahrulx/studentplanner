import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';

import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import {
  dismissTip,
  getFirstSuccess,
  isTipDismissed,
} from '@/src/lib/smartCapture/smartCaptureSetupState';

/**
 * Nudges the student towards the hands-free capture path, but only once they
 * have already seen Smart Capture work at least once — and never for someone
 * who is already using Back Tap.
 */
export default function SmartCaptureTip() {
  const { language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const [visible, setVisible] = useState(false);
  const isIos = Platform.OS === 'ios';

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [success, dismissed] = await Promise.all([getFirstSuccess(), isTipDismissed()]);
      if (!alive) return;
      setVisible(!!success && !dismissed && success.source !== 'back_tap');
    })();
    return () => {
      alive = false;
    };
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    void dismissTip();
  }, []);

  if (!visible) return null;

  return (
    <Pressable
      onPress={() => {
        hide();
        router.push('/smart-automations' as never);
      }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.primary },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="zap" size={16} color={theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.text }]}>
          {isIos ? T('scTipTitle') : T('scTipTitleAndroid')}
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          {isIos ? T('scTipBody') : T('scTipBodyAndroid')}
        </Text>
      </View>
      <Pressable onPress={hide} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Feather name="x" size={16} color={theme.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13.5, fontWeight: '900', letterSpacing: -0.2 },
  body: { fontSize: 12, fontWeight: '500', lineHeight: 17, marginTop: 2 },
});

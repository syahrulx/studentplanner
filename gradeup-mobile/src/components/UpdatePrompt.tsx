import React, { useCallback } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import type { UpdateSeverity } from '@/src/lib/appVersion';

export interface UpdatePromptProps {
  /** When `none`, the prompt is not rendered. */
  severity: UpdateSeverity;
  /** Absolute App Store / Play Store URL. */
  storeUrl: string;
  /** Optional localized message overrides from `app_config`. */
  messageOverride?: string | null;
  /**
   * Called when the user dismisses a **soft** prompt ("Maybe later").
   * Hard prompts intentionally cannot be dismissed.
   */
  onDismiss?: () => void;
}

/**
 * A clean, centered "update available" card. Renders as a non-dismissible
 * blocking screen when `severity === 'hard'` and as a dismissible bottom
 * sheet when `severity === 'soft'`.
 */
export default function UpdatePrompt({
  severity,
  storeUrl,
  messageOverride,
  onDismiss,
}: UpdatePromptProps) {
  const theme = useTheme();
  const { language } = useApp();
  const T = useTranslations(language);
  const visible = severity !== 'none';
  const isHard = severity === 'hard';

  const openStore = useCallback(async () => {
    const url = (storeUrl || '').trim();
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url).catch(() => false);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(url); // best-effort fallback
      }
    } catch {
      Alert.alert(T('updatePromptOpenFailedTitle'), T('updatePromptOpenFailedBody'));
    }
  }, [storeUrl, T]);

  if (!visible) return null;

  const title = isHard ? T('updatePromptHardTitle') : T('updatePromptTitle');
  const body = (messageOverride && messageOverride.trim()) || T('updatePromptBody');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      // Hard updates intentionally ignore Android back press / iOS swipe.
      onRequestClose={() => {
        if (!isHard) onDismiss?.();
      }}
    >
      <View style={[styles.backdrop, isHard && styles.backdropHard]}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Illustration */}
          <View style={[styles.illustrationRing, { backgroundColor: theme.primary + '14' }]}>
            <View style={[styles.illustrationInner, { borderColor: theme.primary }]}>
              <Feather name="smartphone" size={34} color={theme.primary} />
              <View style={[styles.arrowBadge, { backgroundColor: theme.primary }]}>
                <Feather name="arrow-up" size={14} color={theme.textInverse ?? '#ffffff'} />
              </View>
            </View>
          </View>

          {/* Copy */}
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{body}</Text>

          {/* Actions */}
          <Pressable
            accessibilityRole="button"
            onPress={openStore}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: theme.textInverse ?? '#ffffff' }]}>
              {T('updatePromptPrimary')}
            </Text>
          </Pressable>

          {!isHard && (
            <Pressable
              accessibilityRole="button"
              onPress={onDismiss}
              style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>
                {T('updatePromptSecondary')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    padding: 16,
  },
  backdropHard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  illustrationRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  illustrationInner: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  arrowBadge: {
    position: 'absolute',
    top: -8,
    right: -10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

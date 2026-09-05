import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';

import { useTheme } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { fetchActiveWhatsNewPrompt, type WhatsNewPrompt } from '../lib/whatsNewApi';

function parseFeatures(content: string): { title: string; body: string }[] {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const features: { title: string; body: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const clean = line.replace(/^[-*•]\s*/, '');
    if (!clean) continue;
    const nextLine = lines[i + 1];
    const nextIsBullet = nextLine && /^[-*•]/.test(nextLine);
    const body = nextLine && !nextIsBullet ? nextLine : '';
    if (body) i++;
    features.push({ title: clean, body });
  }
  return features;
}

const ICONS = ['zap', 'bell', 'shield', 'star', 'layers', 'sliders', 'check-circle', 'sun'] as const;

export default function WhatsNewPromptModal() {
  const [prompt, setPrompt] = useState<WhatsNewPrompt | null>(null);
  const [visible, setVisible] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(screenH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    (async () => {
      const activePrompt = await fetchActiveWhatsNewPrompt();
      if (!alive || !activePrompt) return;
      try {
        const hasSeen = await AsyncStorage.getItem(`whats_new_seen_${activePrompt.version_name}`);
        if (!hasSeen) { setPrompt(activePrompt); setVisible(true); }
      } catch (_) {}
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, damping: 22, stiffness: 180, mass: 0.9, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleDismiss = async () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: screenH, duration: 300, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(async () => {
      setVisible(false);
      if (prompt) {
        try { await AsyncStorage.setItem(`whats_new_seen_${prompt.version_name}`, 'true'); } catch (_) {}
      }
    });
  };

  if (!visible || !prompt) return null;

  const features = parseFeatures(prompt.content);
  const isDark = isDarkTheme(theme.id);

  // ─── Solid surface palette ──────────────────────────────────────────────────
  const sheetBg      = isDark ? '#1C1C1E' : '#FFFFFF';
  const iconBg       = isDark ? '#2C2C2E' : '#F2F2F7';
  const iconBorder   = isDark ? '#3A3A3C' : '#E5E5EA';
  const textPrimary  = isDark ? '#FFFFFF' : '#000000';
  const textSecondary = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const divider      = isDark ? '#2C2C2E' : '#E5E5EA';
  const handleColor  = isDark ? '#48484A' : '#C7C7CC';
  const featureListBg = isDark ? '#2C2C2E' : '#F2F2F7';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)' }]}
          activeOpacity={1}
          onPress={handleDismiss}
        />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [{ translateY: slideAnim }],
            maxHeight: Math.max(320, screenH - Math.max(insets.top, 8) - 8),
            paddingBottom: Math.max(insets.bottom + 8, 16),
          },
        ]}
      >
        {/* ── Solid surface ───────────────────────────────────────────────── */}
        <View style={[styles.sheetPane, { backgroundColor: sheetBg }]}>

          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: handleColor }]} />

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={features.length > 4}
            bounces={features.length > 4}
          >
            {/* Title block */}
            <View style={styles.titleBlock}>
              <Text style={[styles.eyebrow, { color: textSecondary }]}>
                {prompt.version_name.toUpperCase()}
              </Text>
              <Text style={[styles.headline, { color: textPrimary }]}>
                {prompt.title}
              </Text>
            </View>

            {/* Feature rows */}
            <View style={[styles.featureList, { backgroundColor: featureListBg }]}>
              {features.map((f, i) => (
                <View key={i}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: divider }]} />}
                  <View style={styles.featureRow}>
                    {/* Icon pill */}
                    <View style={[styles.iconWrap, { backgroundColor: iconBg, borderColor: iconBorder }]}>
                      <Feather name={ICONS[i % ICONS.length]} size={18} color={isDark ? '#fff' : '#007AFF'} />
                    </View>
                    <View style={styles.featureText}>
                      <Text style={[styles.featureTitle, { color: textPrimary }]}>
                        {f.title}
                      </Text>
                      {!!f.body && (
                        <Text style={[styles.featureBody, { color: textSecondary }]}>
                          {f.body}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* CTA */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleDismiss}
              activeOpacity={0.8}
              style={[styles.ctaBtn, { backgroundColor: '#007AFF' }]}
            >
              <Text style={styles.ctaText}>Continue</Text>
            </TouchableOpacity>
          </View>

        </View>
      </Animated.View>
    </Modal>
  );
}

const RADIUS = 28;

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  sheetPane: {
    borderRadius: RADIUS,
    overflow: 'hidden',
    flexShrink: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 22,
  },
  titleBlock: {
    paddingHorizontal: 24,
    marginBottom: 22,
  },
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  headline: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.2,
    lineHeight: 38,
  },
  featureList: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  featureBody: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    alignItems: 'center',
  },
  ctaBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    paddingHorizontal: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
});

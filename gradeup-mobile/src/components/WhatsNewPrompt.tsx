import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
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

/**
 * Pick an icon from the words the release note actually uses, and fall back to
 * the rotating set. A row about the calendar then shows a calendar, which is
 * what made the old list read as decoration rather than information.
 */
function iconFor(title: string, index: number): keyof typeof Feather.glyphMap {
  const t = title.toLowerCase();
  if (/calendar|semester|week|date/.test(t)) return 'calendar';
  if (/timetable|class|schedule|planner|task/.test(t)) return 'clock';
  if (/quiz|exam|test|grade|cgpa|mark/.test(t)) return 'award';
  if (/widget|home|screen|design|layout|look/.test(t)) return 'smartphone';
  if (/map|community|friend|group/.test(t)) return 'map-pin';
  if (/notif|remind|alert/.test(t)) return 'bell';
  if (/fix|bug|crash|freeze|slow|speed|faster|performance/.test(t)) return 'tool';
  if (/secure|verify|privacy|login|sign/.test(t)) return 'shield';
  if (/ai|smart|auto/.test(t)) return 'zap';
  return ICONS[index % ICONS.length];
}

export default function WhatsNewPromptModal() {
  const [prompt, setPrompt] = useState<WhatsNewPrompt | null>(null);
  const [visible, setVisible] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(screenH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  /** One value drives every row; each row reads a different slice of it. */
  const rowsAnim = useRef(new Animated.Value(0)).current;

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
        Animated.timing(rowsAnim, {
          toValue: 1,
          duration: 700,
          delay: 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
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

  // ─── Surface palette ────────────────────────────────────────────────────────
  // Accent follows the user's theme pack; the old sheet was hard-coded iOS blue
  // and was the one screen that ignored a chosen theme.
  const accent        = theme.primary;
  const sheetBg       = isDark ? '#1C1C1E' : '#FFFFFF';
  const textPrimary   = isDark ? '#FFFFFF' : '#000000';
  const textSecondary = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const handleColor   = isDark ? '#48484A' : '#C7C7CC';
  const rowBg         = isDark ? '#2C2C2E' : '#F5F5F7';
  const rowBorder     = isDark ? '#3A3A3C' : '#ECECEF';

  const scrolls = features.length > 4;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)' }]}
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
        <View style={[styles.sheetPane, { backgroundColor: sheetBg }]}>
          {/* A thin accent band at the very top reads as "this is new", without
              a gradient view — those are what made first mount expensive. */}
          <View style={[styles.accentBar, { backgroundColor: accent }]} />

          <View style={[styles.handle, { backgroundColor: handleColor }]} />

          <Pressable
            onPress={handleDismiss}
            hitSlop={10}
            style={[styles.closeBtn, { backgroundColor: rowBg }]}
            accessibilityLabel="Close"
          >
            <Feather name="x" size={16} color={textSecondary} />
          </Pressable>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={scrolls}
            bounces={scrolls}
          >
            {/* Title block */}
            <View style={styles.titleBlock}>
              <View style={[styles.versionPill, { backgroundColor: accent + '1A' }]}>
                <Feather name="gift" size={12} color={accent} />
                <Text style={[styles.versionText, { color: accent }]}>
                  {prompt.version_name.toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.headline, { color: textPrimary }]}>{prompt.title}</Text>
              {features.length > 0 && (
                <Text style={[styles.subhead, { color: textSecondary }]}>
                  {features.length === 1
                    ? '1 change in this update'
                    : `${features.length} changes in this update`}
                </Text>
              )}
            </View>

            {/* Feature cards */}
            <View style={styles.featureList}>
              {features.map((f, i) => {
                // Each card fades and lifts a beat after the one above it.
                const start = Math.min(0.6, i * 0.08);
                const range = [start, Math.min(1, start + 0.4)];
                return (
                  <Animated.View
                    key={i}
                    style={[
                      styles.featureRow,
                      {
                        backgroundColor: rowBg,
                        borderColor: rowBorder,
                        opacity: rowsAnim.interpolate({ inputRange: range, outputRange: [0, 1], extrapolate: 'clamp' }),
                        transform: [
                          {
                            translateY: rowsAnim.interpolate({
                              inputRange: range,
                              outputRange: [10, 0],
                              extrapolate: 'clamp',
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: accent + '1F' }]}>
                      <Feather name={iconFor(f.title, i)} size={18} color={accent} />
                    </View>
                    <View style={styles.featureText}>
                      <Text style={[styles.featureTitle, { color: textPrimary }]}>{f.title}</Text>
                      {!!f.body && (
                        <Text style={[styles.featureBody, { color: textSecondary }]}>{f.body}</Text>
                      )}
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </ScrollView>

          {/* CTA */}
          <View style={[styles.footer, { borderTopColor: rowBorder }]}>
            <TouchableOpacity
              onPress={handleDismiss}
              activeOpacity={0.85}
              style={[styles.ctaBtn, { backgroundColor: accent }]}
            >
              <Text style={[styles.ctaText, { color: theme.textInverse }]}>Continue</Text>
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
  accentBar: { height: 4, width: '100%' },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 18,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  titleBlock: {
    paddingHorizontal: 22,
    marginBottom: 18,
  },
  versionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    marginBottom: 12,
  },
  versionText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 6,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  subhead: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  featureList: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 18,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  featureBody: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
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
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '@/hooks/useTheme';
import { fetchActiveWhatsNewPrompt, type WhatsNewPrompt } from '../lib/whatsNewApi';

const { height: SCREEN_H } = Dimensions.get('window');

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

const ICONS: Feather.GlyphMap[] = ['zap', 'bell', 'shield', 'star', 'layers', 'sliders', 'check-circle', 'sun'];

export default function WhatsNewPromptModal() {
  const [prompt, setPrompt] = useState<WhatsNewPrompt | null>(null);
  const [visible, setVisible] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
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
      Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 300, useNativeDriver: true }),
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
  const isDark = theme.dark;

  // ─── Liquid glass palette ───────────────────────────────────────────────────
  // The "glass" effect: translucent white/black + specular highlight + soft glow
  const glassBg = isDark ? 'rgba(28, 28, 30, 0.72)' : 'rgba(242, 242, 247, 0.72)';
  const specularEdge = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';
  const specularSide = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.40)';
  const iconGlass = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)';
  const textPrimary = isDark ? '#FFFFFF' : '#000000';
  const textSecondary = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const divider = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  // Liquid glass button: a slightly more opaque glass pill
  const btnBg = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,122,255,1)';
  const btnText = isDark ? '#FFFFFF' : '#FFFFFF';

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
          { transform: [{ translateY: slideAnim }], paddingBottom: Math.max(insets.bottom + 8, 32) },
        ]}
      >
        {/* ── Main glass surface ─────────────────────────────────────────── */}
        <View style={[styles.glassPane, { backgroundColor: glassBg }]}>
          
          {/* Top specular highlight (the "glossy rim" of the glass) */}
          <LinearGradient
            colors={[specularEdge, specularSide, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.specularTop}
            pointerEvents="none"
          />
          {/* Side specular highlight */}
          <LinearGradient
            colors={[specularSide, 'transparent', specularSide]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)' }]} />

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
          <View style={styles.featureList}>
            {features.map((f, i) => (
              <View key={i}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: divider }]} />}
                <View style={styles.featureRow}>
                  {/* Glass icon pill */}
                  <View style={[styles.iconWrap, { backgroundColor: iconGlass, borderColor: specularEdge }]}>
                    <Feather name={ICONS[i % ICONS.length]} size={18} color={isDark ? '#fff' : '#007AFF'} />
                  </View>
                  <View style={styles.featureText}>
                    <Text style={[styles.featureTitle, { color: textPrimary }]} numberOfLines={2}>
                      {f.title}
                    </Text>
                    {!!f.body && (
                      <Text style={[styles.featureBody, { color: textSecondary }]} numberOfLines={3}>
                        {f.body}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* CTA */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleDismiss}
              activeOpacity={0.75}
              style={styles.ctaOuter}
            >
              {/* Glass button surface */}
              <LinearGradient
                colors={isDark
                  ? ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.10)']
                  : ['#1a7eff', '#0062e5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.ctaGradient}
              >
                {/* Inner top highlight for button glass */}
                <View style={[styles.ctaHighlight, { borderColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.45)' }]} />
                <Text style={[styles.ctaText, { color: btnText }]}>Continue</Text>
              </LinearGradient>
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
  glassPane: {
    borderRadius: RADIUS,
    overflow: 'hidden',
    // Outer shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 30,
    // Thin outer border for the glass rim
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  specularTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    zIndex: 1,
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
    backgroundColor: 'rgba(255,255,255,0.06)',
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
  ctaOuter: {
    borderRadius: 100,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  ctaGradient: {
    paddingVertical: 15,
    paddingHorizontal: 52,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ctaHighlight: {
    position: 'absolute',
    top: 1,
    left: 8,
    right: 8,
    height: '50%',
    borderTopWidth: 1,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 100,
    borderTopRightRadius: 100,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});

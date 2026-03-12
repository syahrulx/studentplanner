import { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../src/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STEPS = [
  {
    subtitle: 'FROM WHATSAPP TO PLANNER',
    title: 'Automate Your Study Tasks',
    description: "Paste your lecturer's WhatsApp messages and let AI extract tasks, deadlines, and course codes instantly.",
    icon: 'message-circle' as const,
    iconBg: COLORS.blue,
  },
  {
    subtitle: '14-WEEK INTELLIGENCE',
    title: 'Master Your Semester',
    description: "Visualize your entire semester's stress level based on SOW data. Know when to study hard and when to rest.",
    icon: 'calendar' as const,
    iconBg: COLORS.gold,
  },
  {
    subtitle: 'SMART RECOMMENDATIONS',
    title: 'AI-Powered Success',
    description: 'Get personalized study recommendations and deadline risk alerts designed specifically for Part 4 students.',
    icon: 'zap' as const,
    iconBg: COLORS.purple,
  },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.x;
    const index = Math.round(offset / SCREEN_WIDTH);
    setStep(index);
  };

  const handleContinue = () => {
    if (step < 2) {
      scrollRef.current?.scrollTo({ x: (step + 1) * SCREEN_WIDTH, animated: true });
    } else {
      router.replace('/(auth)/login');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
      >
        {STEPS.map((s, i) => (
          <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
            <View style={[styles.iconContainer, { backgroundColor: s.iconBg }]}>
              <Feather name={s.icon} size={48} color={COLORS.white} />
            </View>
            <Text style={styles.subtitle}>{s.subtitle}</Text>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.description}>{s.description}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === step ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleContinue}
        >
          <Text style={styles.buttonText}>
            {step < 2 ? 'Continue' : 'Get Started'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.gold,
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.navy,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    borderRadius: 4,
  },
  dotActive: {
    width: 24,
    height: 8,
    backgroundColor: COLORS.navy,
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: COLORS.border,
  },
  button: {
    backgroundColor: COLORS.navy,
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: 'center',
    width: '100%',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '700',
  },
});

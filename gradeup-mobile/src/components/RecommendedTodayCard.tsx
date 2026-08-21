import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import type { StudyRecommendation } from '@/src/lib/studyRecommendations';

interface Props {
  recommendation: StudyRecommendation;
  onBreakdown: () => void;
  onDismiss: () => void;
}

export function RecommendedTodayCard({ recommendation, onBreakdown, onDismiss }: Props) {
  const theme = useTheme();
  const [showWhy, setShowWhy] = useState(false);

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>RECOMMENDED TODAY</Text>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>A smaller next step</Text>
        </View>
        <View style={[styles.ruleBadge, { backgroundColor: `${theme.primary}12` }]}>
          <Feather name="compass" size={14} color={theme.primary} />
          <Text style={[styles.ruleBadgeText, { color: theme.primary }]}>Based on your tasks</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.iconBox, { backgroundColor: `${theme.primary}12` }]}>
          <Feather name="layers" size={21} color={theme.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]}>{recommendation.title}</Text>
          <Text style={[styles.summary, { color: theme.textSecondary }]}>{recommendation.summary}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showWhy }}
          onPress={() => setShowWhy((value) => !value)}
          style={styles.whyButton}
        >
          <Feather name="info" size={15} color={theme.primary} />
          <Text style={[styles.whyButtonText, { color: theme.primary }]}>{showWhy ? 'Hide explanation' : 'Why this?'}</Text>
          <Feather name={showWhy ? 'chevron-up' : 'chevron-down'} size={15} color={theme.primary} />
        </Pressable>

        {showWhy ? (
          <View style={[styles.explanation, { borderTopColor: theme.border }]}>
            {recommendation.why.map((reason) => (
              <View key={reason} style={styles.reasonRow}>
                <View style={[styles.reasonDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.reasonText, { color: theme.textSecondary }]}>{reason}</Text>
              </View>
            ))}
            <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>This is a transparent planning suggestion, not a measurement of your study activity.</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onBreakdown}
            style={({ pressed }) => [styles.primaryAction, { backgroundColor: theme.primary }, pressed && styles.pressed]}
          >
            <Feather name="list" size={17} color="#fff" />
            <Text style={styles.primaryActionText}>Break into steps</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => [styles.secondaryAction, { borderColor: theme.border }, pressed && styles.pressed]}
          >
            <Text style={[styles.secondaryActionText, { color: theme.textSecondary }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22, paddingHorizontal: 18 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 10 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.15, marginBottom: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  ruleBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  ruleBadgeText: { fontSize: 10, fontWeight: '800' },
  card: { borderRadius: 20, borderWidth: 1, padding: 16 },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  copy: { gap: 5 },
  title: { fontSize: 17, fontWeight: '800' },
  summary: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  whyButton: { minHeight: 40, marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 },
  whyButtonText: { fontSize: 12, fontWeight: '800' },
  explanation: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 9 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  reasonDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  reasonText: { flex: 1, fontSize: 12, lineHeight: 18 },
  disclaimer: { fontSize: 11, lineHeight: 16, fontStyle: 'italic', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  primaryAction: { flex: 1, minHeight: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  secondaryAction: { minHeight: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryActionText: { fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.76 },
});

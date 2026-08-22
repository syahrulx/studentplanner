import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import type { StudyRecommendation } from '@/src/lib/studyRecommendations';

interface Props {
  recommendation: StudyRecommendation;
  onBreakdown: () => void;
  onDismiss: () => void;
  /**
   * Inside the home hero carousel the page already supplies the gutter and top
   * spacing, so the card drops its own — otherwise it sits inset from the
   * focus page next to it and the swipe looks misaligned.
   */
  embedded?: boolean;
}

/** "Fri 27 Aug", or "today"/"tomorrow" when close enough to matter. */
function dueLabel(iso: string): string {
  const clean = (iso ?? '').slice(0, 10);
  const date = new Date(`${clean}T12:00:00`);
  if (Number.isNaN(date.getTime())) return clean;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * The card body only — the caller owns the section heading, so this page lines
 * up with Today's focus when the hero is swiped.
 *
 * Laid out like the breakdown card in the planner: the task leads, a meta line
 * carries the deadline and step count, and empty segments preview the steps
 * that would be created. Leading with the task rather than the advice keeps it
 * recognisably the same object the user sees everywhere else.
 */
export function RecommendedTodayCard({ recommendation, onBreakdown, onDismiss, embedded }: Props) {
  const theme = useTheme();
  const [showWhy, setShowWhy] = useState(false);
  const stepCount = Math.max(1, recommendation.suggestedStepCount);

  return (
    <View style={embedded ? styles.sectionEmbedded : styles.section}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.headRow}>
          <Text style={[styles.taskTitle, { color: theme.text }]} numberOfLines={1}>
            {recommendation.taskTitle}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showWhy ? 'Hide explanation' : 'Why this suggestion'}
            accessibilityState={{ expanded: showWhy }}
            onPress={() => setShowWhy((value) => !value)}
            hitSlop={10}
            style={styles.whyButton}
          >
            <Text style={[styles.whyButtonText, { color: theme.textSecondary }]}>Why?</Text>
            <Feather name={showWhy ? 'chevron-up' : 'chevron-down'} size={13} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {`Due ${dueLabel(recommendation.taskDueDate)} · ${stepCount} steps suggested`}
        </Text>

        {/* Empty segments preview the plan, they are not progress — nothing is
            done yet, so every segment stays unfilled. */}
        <View style={styles.segments}>
          {Array.from({ length: stepCount }, (_, index) => (
            <View key={index} style={[styles.segment, { backgroundColor: `${theme.textSecondary}26` }]} />
          ))}
        </View>

        <Text style={[styles.summary, { color: theme.textSecondary }]}>{recommendation.summary}</Text>

        {showWhy ? (
          <View style={[styles.explanation, { borderTopColor: theme.border }]}>
            {recommendation.why.map((reason) => (
              <View key={reason} style={styles.reasonRow}>
                <View style={[styles.reasonDot, { backgroundColor: theme.primary }]} />
                <Text style={[styles.reasonText, { color: theme.textSecondary }]}>{reason}</Text>
              </View>
            ))}
            <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>
              This is a planning suggestion, not a measurement of your study activity.
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onBreakdown}
            style={({ pressed }) => [styles.primaryAction, { backgroundColor: theme.primary }, pressed && styles.pressed]}
          >
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
  sectionEmbedded: { marginTop: 0, paddingHorizontal: 0 },
  card: { borderRadius: 18, borderWidth: 1, padding: 15 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskTitle: { flex: 1, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  whyButton: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  whyButtonText: { fontSize: 11.5, fontWeight: '600' },
  meta: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  segments: { flexDirection: 'row', gap: 4, marginTop: 9 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  summary: { fontSize: 12.5, lineHeight: 18, fontWeight: '500', marginTop: 11 },
  explanation: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, marginTop: 11, gap: 8 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  reasonDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6 },
  reasonText: { flex: 1, fontSize: 12, lineHeight: 18 },
  disclaimer: { fontSize: 11, lineHeight: 16, fontStyle: 'italic', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 13 },
  primaryAction: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondaryAction: { minHeight: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryActionText: { fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.76 },
});

import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';

/**
 * Section node rendered by `LegalScreen`. Keep it tiny and JSON-like so the
 * content files below read like a document, not a template.
 */
export type LegalSection = {
  heading: string;
  /** Plain paragraphs. Each string renders as one <Text>. */
  paragraphs?: string[];
  /** Bullet list items, rendered with a leading •. */
  bullets?: string[];
};

type Props = {
  title: string;
  /** Shown just under the title. Usually "Last updated: …" or a one-line intro. */
  subtitle?: string;
  sections: LegalSection[];
  /** Optional closing paragraphs below the last section (e.g. contact info). */
  footer?: string[];
};

/**
 * Shared renderer for in-app legal docs (Terms of Use, Community Guidelines).
 * Simple, no-frills layout so App Review can read the content clearly.
 */
export default function LegalScreen({ title, subtitle, sections, footer }: Props) {
  const theme = useTheme();

  return (
    <View style={[s.root, { backgroundColor: theme.background }]}>
      <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 56 : 40 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            s.backBtn,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && { opacity: 0.75 },
          ]}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={10}
        >
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[s.title, { color: theme.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[s.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
        ) : null}

        {sections.map((section, idx) => (
          <View key={`${idx}-${section.heading}`} style={s.section}>
            <Text style={[s.h2, { color: theme.text }]}>{section.heading}</Text>
            {section.paragraphs?.map((p, i) => (
              <Text
                key={`p-${i}`}
                style={[s.paragraph, { color: theme.textSecondary }]}
              >
                {p}
              </Text>
            ))}
            {section.bullets?.map((b, i) => (
              <View key={`b-${i}`} style={s.bulletRow}>
                <Text style={[s.bulletDot, { color: theme.textSecondary }]}>•</Text>
                <Text style={[s.bulletText, { color: theme.textSecondary }]}>{b}</Text>
              </View>
            ))}
          </View>
        ))}

        {footer?.map((p, i) => (
          <Text
            key={`f-${i}`}
            style={[s.paragraph, { color: theme.textSecondary, marginTop: i === 0 ? 16 : 8 }]}
          >
            {p}
          </Text>
        ))}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 4 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginTop: 8 },
  subtitle: { fontSize: 13, marginTop: 6, fontWeight: '500' },
  section: { marginTop: 24 },
  h2: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, marginBottom: 10 },
  paragraph: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  bulletRow: { flexDirection: 'row', paddingLeft: 4, marginBottom: 6 },
  bulletDot: { fontSize: 14, lineHeight: 22, width: 14 },
  bulletText: { fontSize: 14, lineHeight: 22, flex: 1 },
});

import React, { useEffect, useState } from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';

import type { Confession } from '@/src/lib/confessionsApi';
import { formatConfessionNo } from './ConfessionHeader';

const ROTATE_MS = 4500;

type Props = {
  items: Confession[];
  /** Posts since the feed was last opened — shown as a badge that opens the feed. */
  newCount: number;
  theme: any;
  universityShort?: string;
  onPress: (c: Confession) => void;
  onOpenFeed: () => void;
};

/**
 * One-line teaser of a live confession, floating over the top of the map.
 * The text itself is the call to action — curiosity gets the tap, not a button.
 */
export function ConfessionPeek({ items, newCount, theme, universityShort, onPress, onOpenFeed }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (items.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [items]);

  const item = items[index];

  // Nothing to tease yet — still the way in, so the feature never disappears.
  if (!item) {
    return (
      <Pressable
        onPress={onOpenFeed}
        style={({ pressed }) => [st.wrap, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Confessions"
      >
        <Text style={st.emoji}>🤫</Text>
        <Text style={[st.text, st.textWrap, { color: theme.text }]} numberOfLines={1}>
          <Text style={st.number}>Confessions  </Text>
          <Text style={{ color: theme.textSecondary }}>Be the first to spill</Text>
        </Text>
        <Feather name="chevron-right" size={16} color={theme.textSecondary} />
      </Pressable>
    );
  }

  const number = formatConfessionNo(item, universityShort);
  const text = item.content.replace(/\s+/g, ' ').trim();

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [st.wrap, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`Confession: ${text}`}
    >
      <Text style={st.emoji}>🤫</Text>
      <Animated.View key={item.id} entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={st.textWrap}>
        <Text style={[st.text, { color: theme.text }]} numberOfLines={1}>
          {number ? <Text style={st.number}>{number}  </Text> : null}
          {text}
        </Text>
      </Animated.View>
      {/* Separate target: the text opens that post, this opens the whole feed. */}
      <Pressable
        onPress={onOpenFeed}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
        style={[st.feedBtn, newCount > 0 && { backgroundColor: theme.primary }]}
        accessibilityRole="button"
        accessibilityLabel={newCount > 0 ? `All confessions, ${newCount} new` : 'All confessions'}
      >
        {newCount > 0 ? (
          <Text style={[st.newText, { color: theme.textInverse }]}>
            {newCount >= 50 ? '50+' : newCount} new
          </Text>
        ) : (
          <Feather name="chevron-right" size={16} color={theme.textSecondary} />
        )}
      </Pressable>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingLeft: 12, paddingRight: 10, height: 40, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  emoji: { fontSize: 15 },
  textWrap: { flex: 1 },
  text: { fontSize: 14, fontWeight: '500', letterSpacing: -0.1 },
  number: { fontWeight: '800' },
  feedBtn: { minHeight: 24, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  newText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
});

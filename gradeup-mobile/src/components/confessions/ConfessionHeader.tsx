import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import type { Confession } from '@/src/lib/confessionsApi';

/** Accent colour per tag — used sparingly: the tag word and the composer. */
export function getConfessionTagColor(tag: string | null | undefined): string {
  if (tag === '☕️ Tea') return '#D97706';
  if (tag === '❤️ Crush') return '#DB2777';
  if (tag === '📚 Rant') return '#DC2626';
  if (tag === '❓ Advice') return '#2563EB';
  return '#7C3AED';
}

/** Stored tags carry an emoji prefix ("📚 Rant") — display just the word. */
export function tagLabel(tag: string): string {
  return tag.replace(/^[^A-Za-z]+/, '').trim() || tag;
}

/** "UiTM Kampus Arau" → "Arau". */
export function campusShortName(name: string): string {
  return name.replace(/^.+?kampus\s+/i, '').replace(/^.+?campus\s+/i, '') || name;
}

/** "#Arau 1247" — hashtag-style so it reads like the FB confession pages. */
export function formatConfessionNo(c: Pick<Confession, 'campus' | 'confession_no'>, fallback?: string): string | null {
  if (!c.confession_no) return null;
  const place = (c.campus ? campusShortName(c.campus) : fallback || '').replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9]+/g, '');
  return place ? `#${place} ${c.confession_no}` : `#${c.confession_no}`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

type Props = {
  confession: Confession;
  theme: any;
  anonLabel: string;
  /** Used for the number hashtag when the uni has no campuses. */
  universityShort?: string;
  size?: 'card' | 'detail';
  youLabel?: string;
};

/**
 * One quiet meta line: `#Arau 1247 · Rant · 1h`. Anonymous posts get no
 * avatar at all — a placeholder face on every row is noise. Named posts lead
 * with the author's photo + name.
 */
export function ConfessionHeader({ confession, theme, anonLabel, universityShort, size = 'card', youLabel = 'you' }: Props) {
  const named = confession.is_anonymous === false && !!confession.author_name;
  const number = formatConfessionNo(confession, universityShort);
  const avatar = size === 'detail' ? 32 : 26;
  const lead = named ? confession.author_name! : number ?? anonLabel;

  return (
    <View style={st.row}>
      {named ? (
        confession.author_avatar ? (
          <Image source={{ uri: confession.author_avatar }} style={{ width: avatar, height: avatar, borderRadius: avatar / 2 }} />
        ) : (
          <View style={[st.initialWrap, { width: avatar, height: avatar, borderRadius: avatar / 2, backgroundColor: theme.backgroundSecondary }]}>
            <Text style={[st.initial, { color: theme.text }]}>{confession.author_name!.trim().charAt(0).toUpperCase()}</Text>
          </View>
        )
      ) : null}
      <Text style={[st.line, { color: theme.textSecondary }]} numberOfLines={1}>
        <Text style={[st.lead, { color: theme.text }]}>{lead}</Text>
        {named && number ? `  ${number}` : ''}
        {confession.tag ? (
          <>
            {'  ·  '}
            <Text style={{ color: getConfessionTagColor(confession.tag), fontWeight: '600' }}>{tagLabel(confession.tag)}</Text>
          </>
        ) : null}
        {'  ·  '}
        {timeAgo(confession.created_at)}
      </Text>
      {confession.is_mine && <Text style={[st.you, { color: theme.textSecondary }]}>{youLabel}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  initialWrap: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontWeight: '700', fontSize: 12 },
  line: { flex: 1, fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  lead: { fontWeight: '700', letterSpacing: -0.1 },
  you: { fontSize: 12, fontWeight: '600' },
});

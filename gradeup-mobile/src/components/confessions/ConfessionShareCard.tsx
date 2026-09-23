import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type ViewShot from 'react-native-view-shot';

import { ExportCanvas } from '@/components/ViewShotCompat';
import type { Confession } from '@/src/lib/confessionsApi';
import { formatConfessionNo, getConfessionTagColor, tagLabel } from './ConfessionHeader';

type Props = {
  confession: Confession | null;
  universityShort?: string;
};

/** Longer confessions step the type down so they still fit the 9:16 frame. */
function fontSizeFor(len: number): number {
  if (len <= 60) return 40;
  if (len <= 140) return 32;
  if (len <= 260) return 25;
  return 20;
}

/**
 * Off-screen 9:16 card captured for Instagram Story / WhatsApp status.
 * Solid tag colour + oversized white type — reads at thumbnail size in a
 * story tray, which pastel UI cards don't.
 */
export const ConfessionShareCard = React.forwardRef<ViewShot, Props>(({ confession, universityShort }, ref) => {
  if (!confession) return null;
  const color = getConfessionTagColor(confession.tag);
  const number = formatConfessionNo(confession, universityShort);
  const size = fontSizeFor(confession.content.length);
  const named = confession.is_anonymous === false && !!confession.author_name;

  return (
    <View style={st.offscreen} pointerEvents="none">
      <ExportCanvas ref={ref} format="png" quality={1} style={[st.canvas, { backgroundColor: color }]}>
        <View style={st.top}>
          <Text style={st.number}>{number ?? 'confession'}</Text>
          {confession.tag ? <Text style={st.tag}>{tagLabel(confession.tag).toLowerCase()}</Text> : null}
        </View>

        <Text style={[st.body, { fontSize: size, lineHeight: Math.round(size * 1.18) }]}>
          {confession.content}
        </Text>

        <View style={st.bottom}>
          <Text style={st.by}>{named ? `— ${confession.author_name}` : '— anon'}</Text>
          <Text style={st.brand}>rencana</Text>
        </View>
      </ExportCanvas>
    </View>
  );
});
ConfessionShareCard.displayName = 'ConfessionShareCard';

const st = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  canvas: { width: 360, height: 640, paddingHorizontal: 32, paddingTop: 48, paddingBottom: 40, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  tag: { color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: '700' },
  body: { color: '#fff', fontWeight: '800', letterSpacing: -0.8 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  by: { color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: '600' },
  brand: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.8 },
});

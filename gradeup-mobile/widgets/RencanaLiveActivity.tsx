import { HStack, VStack, Text, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, opacity } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityLayout } from 'expo-widgets';
import type { LiveActivityKind } from '../src/liveActivityPrefs';

/**
 * Props passed to the single Rencana Live Activity. The `kind` field selects
 * which of the four activity styles to render. Dates are passed as epoch
 * milliseconds (numbers) because Live Activity props are serialized to JSON
 * before crossing into the native widget runtime.
 */
export type RencanaLiveActivityProps = {
  kind: LiveActivityKind;
  /** Primary line, e.g. the subject, class, or task title. */
  title: string;
  /** Secondary line, e.g. location, course code, or a short hint. */
  subtitle?: string;
  /** Start of the countdown range (epoch ms). */
  startMs?: number;
  /** End of the countdown range (epoch ms) — when the timer reaches zero. */
  endMs?: number;
  /** When set, the timer is rendered frozen at this instant (epoch ms). */
  pauseAtMs?: number;
  /** Study-timer phase, only meaningful when kind === 'studyTimer'. */
  phase?: 'focus' | 'break';
  /** Theme accent color (hex). */
  accent?: string;
  /** Theme primary text color (hex). */
  text?: string;
  /** Theme secondary text color (hex). */
  textSecondary?: string;
};

function RencanaLiveActivityLayout(props: RencanaLiveActivityProps): LiveActivityLayout {
  'widget';

  const accent = props.accent || '#2563eb';
  const text = props.text || '#0f172a';
  const muted = props.textSecondary || '#64748b';

  const kind = props.kind;
  const phase = props.phase;

  // Per-kind presentation. Kept inline so the 'widget' transform captures it.
  let emoji = '⏱️';
  let label = 'Live';
  if (kind === 'studyTimer') {
    emoji = phase === 'break' ? '☕' : '📚';
    label = phase === 'break' ? 'Break' : 'Focus';
  } else if (kind === 'nextClass') {
    emoji = '📅';
    label = 'Next class';
  } else if (kind === 'deadline') {
    emoji = '⏰';
    label = 'Due soon';
  } else if (kind === 'attendance') {
    emoji = '✅';
    label = 'Check in';
  }

  const tint = kind === 'studyTimer' && phase === 'break' ? '#10b981' : accent;

  const hasRange =
    typeof props.startMs === 'number' &&
    typeof props.endMs === 'number' &&
    (props.endMs as number) > (props.startMs as number);

  const title = (props.title || label).trim();
  const subtitle = (props.subtitle || '').trim();

  // Inline timer factory — a native self-updating SwiftUI countdown that keeps
  // ticking on the Lock Screen / Dynamic Island even when the app is suspended.
  const timer = (size: number, weight: 'semibold' | 'bold' | 'heavy') => {
    if (hasRange) {
      return (
        <Text
          modifiers={[font({ size, weight }), foregroundStyle(tint), lineLimit(1)]}
          timerInterval={{ lower: new Date(props.startMs as number), upper: new Date(props.endMs as number) }}
          countsDown
          pauseTime={typeof props.pauseAtMs === 'number' ? new Date(props.pauseAtMs) : undefined}
        />
      );
    }
    if (typeof props.endMs === 'number') {
      return (
        <Text
          modifiers={[font({ size, weight }), foregroundStyle(tint), lineLimit(1)]}
          date={new Date(props.endMs)}
          dateStyle="time"
        />
      );
    }
    return <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted), lineLimit(1)]}>{subtitle}</Text>;
  };

  const banner = (
    <HStack
      spacing={12}
      modifiers={[padding({ top: 12, bottom: 12, leading: 16, trailing: 16 })]}
    >
      <Text modifiers={[font({ size: 30 })]}>{emoji}</Text>
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(tint), lineLimit(1)]}>
          {label.toUpperCase()}
        </Text>
        <Text modifiers={[font({ size: 16, weight: 'bold' }), foregroundStyle(text), lineLimit(1)]}>
          {title}
        </Text>
        {subtitle ? (
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(muted), lineLimit(1)]}>
            {subtitle}
          </Text>
        ) : null}
      </VStack>
      <Spacer />
      {timer(30, 'heavy')}
    </HStack>
  );

  // Ambient activities (class, deadline, check-in) stay on the Lock Screen only.
  // Study timer keeps Dynamic Island compact / expanded layouts.
  if (kind !== 'studyTimer') {
    return { banner };
  }

  return {
    banner,
    compactLeading: <Text modifiers={[font({ size: 14 })]}>{emoji}</Text>,
    compactTrailing: timer(13, 'semibold'),
    minimal: <Text modifiers={[font({ size: 14 })]}>{emoji}</Text>,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 4 })]}>
        <Text modifiers={[font({ size: 22 })]}>{emoji}</Text>
        <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(tint), opacity(0.9), lineLimit(1)]}>
          {label.toUpperCase()}
        </Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={0} modifiers={[padding({ trailing: 4 })]}>
        {timer(26, 'heavy')}
      </VStack>
    ),
    expandedCenter: (
      <VStack alignment="center" spacing={2}>
        <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(text), lineLimit(1)]}>{title}</Text>
        {subtitle ? (
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(muted), lineLimit(1)]}>
            {subtitle}
          </Text>
        ) : null}
      </VStack>
    ),
  };
}

export default createLiveActivity<RencanaLiveActivityProps>('RencanaLiveActivity', RencanaLiveActivityLayout);

import { Text, VStack, HStack, Spacer, Divider } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, frame, opacity } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { resolveHomeWidgetTheme, type HomeWidgetProps } from '../src/lib/homeWidgetProps';

function GradeUpTimetableWidgetView(props: HomeWidgetProps | null | undefined, env: WidgetEnvironment) {
  'widget';

  const th = resolveHomeWidgetTheme(props);
  const title = th.text;
  const muted = th.textSecondary;
  const accent = th.primary;

  const fallback: HomeWidgetProps = {
    dateISO: '',
    greeting: 'Rencana',
    signedIn: false,
    tasks: [],
    classes: [],
    theme: th,
  };
  const p = props ? { ...props, theme: th } : fallback;

  const family = env.widgetFamily;
  const small  = family === 'systemSmall';
  const large  = family === 'systemLarge';
  const isLock = family === 'accessoryInline' || family === 'accessoryCircular' || family === 'accessoryRectangular';

  if (!p.signedIn) {
    return (
      <VStack modifiers={[padding({ all: 14 })]} spacing={6}>
        <Text modifiers={[font({ weight: 'bold', size: 16 }), foregroundStyle(accent)]}>Classes</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(2)]}>Sign in to view timetable</Text>
      </VStack>
    );
  }

  const maxItems = large ? 6 : small ? 3 : 4;
  const cls = isLock ? p.classes.slice(0, 1) : p.classes.slice(0, maxItems);

  // Lock screen
  if (family === 'accessoryInline') {
    const c = cls[0];
    return <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(title), lineLimit(1)]}>{c ? `${c.startTime} ${c.label}` : 'No classes today'}</Text>;
  }
  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={1}>
        <Text modifiers={[font({ size: 24, weight: 'heavy' }), foregroundStyle(title)]}>{String(p.classes.length)}</Text>
        <Text modifiers={[font({ size: 8, weight: 'bold' }), foregroundStyle(muted)]}>CLASS</Text>
      </VStack>
    );
  }
  if (family === 'accessoryRectangular') {
    const c = cls[0];
    return (
      <VStack spacing={3}>
        <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(title)]}>{String(p.classes.length)} classes</Text>
        {c ? <Text modifiers={[font({ size: 12 }), foregroundStyle(title), lineLimit(1)]}>{c.startTime} {c.label}</Text> : null}
      </VStack>
    );
  }

  // ─── HOME SCREEN (small / medium / large) — no inner card bg ───
  return (
    <VStack modifiers={[padding({ all: 14 })]} spacing={small ? 8 : 10}>

      {/* ── Header ── */}
      <HStack spacing={6}>
        <VStack spacing={2}>
          <Text modifiers={[font({ weight: 'heavy', size: small ? 13 : 18 }), foregroundStyle(title), lineLimit(1)]}>
            {small ? 'Classes' : "Today's Classes"}
          </Text>
          <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(accent)]}>
            {small ? 'Today' : "Today's Schedule"}
          </Text>
        </VStack>
        <Spacer />
        <VStack spacing={0}>
          <Text modifiers={[font({ size: small ? 20 : 28, weight: 'heavy' }), foregroundStyle(accent)]}>
            {String(p.classes.length)}
          </Text>
          <Text modifiers={[font({ size: 8, weight: 'semibold' }), foregroundStyle(muted)]}>today</Text>
        </VStack>
      </HStack>

      {/* ── Thin separator ── */}
      <Divider modifiers={[opacity(0.12)]} />

      {/* ── Class list — no inner card background ── */}
      {cls.length === 0 ? (
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>No classes today 🎉</Text>
      ) : (
        <VStack spacing={0}>
          {cls.map((c, i) => (
            <VStack key={`${c.startTime}-${c.label}-${i}`} spacing={0}>
              {i > 0 ? <Divider modifiers={[padding({ vertical: small ? 4 : 6 }), opacity(0.08)]} /> : null}
              <HStack spacing={small ? 6 : 10} modifiers={[padding({ vertical: small ? 1 : 3 })]}>
                {/* Time column */}
                <VStack spacing={0} modifiers={small ? [] : [frame({ width: 46 })]}>
                  <Text modifiers={[font({ size: small ? 10 : 13, weight: 'heavy' }), foregroundStyle(accent), lineLimit(1)]}>
                    {c.startTime}
                  </Text>
                  {!small ? (
                    <Text modifiers={[font({ size: 9, weight: 'semibold' }), foregroundStyle(muted), lineLimit(1)]}>
                      {c.endTime}
                    </Text>
                  ) : null}
                </VStack>
                {/* Class name + location */}
                <VStack spacing={1}>
                  <Text modifiers={[font({ size: small ? 11 : 14, weight: 'bold' }), foregroundStyle(title), lineLimit(1)]}>
                    {c.label}
                  </Text>
                  <Text modifiers={[font({ size: small ? 8 : 9 }), foregroundStyle(muted), lineLimit(1)]}>
                    {c.location || '—'}
                  </Text>
                </VStack>
                <Spacer />
              </HStack>
            </VStack>
          ))}
        </VStack>
      )}

    </VStack>
  );
}

export default createWidget('GradeUpTimetable', GradeUpTimetableWidgetView);

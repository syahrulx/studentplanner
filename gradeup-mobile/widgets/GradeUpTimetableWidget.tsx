import { Text, VStack, HStack, Spacer, Divider } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, frame, opacity, background } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps } from '../src/lib/homeWidgetProps';

function GradeUpTimetableWidgetView(props: HomeWidgetProps | null | undefined, _env: WidgetEnvironment) {
  'widget';

  // Read theme colors from app — fallback to light if missing.
  const bg     = props?.theme?.background     || '#ffffff';
  const title  = props?.theme?.text           || '#0f172a';
  const muted  = props?.theme?.textSecondary  || '#64748b';
  const accent = props?.theme?.primary        || '#2563eb';
  const line   = props?.theme?.border         || '#e2e8f0';

  const fallback: HomeWidgetProps = { dateISO: '', greeting: 'Rencana', signedIn: false, tasks: [], classes: [], theme: { themeId: 'light', background: '#ffffff', backgroundSecondary: '#f1f5f9', card: '#ffffff', border: '#e2e8f0', primary: '#2563eb', text: '#0f172a', textSecondary: '#64748b', danger: '#dc2626', warning: '#d97706' } };
  const p = props || fallback;

  const family = _env.widgetFamily;
  const small  = family === 'systemSmall';
  const large  = family === 'systemLarge';
  const isLock = family === 'accessoryInline' || family === 'accessoryCircular' || family === 'accessoryRectangular';

  if (!p.signedIn) {
    return (
      <VStack modifiers={[padding({ all: 14 }), background(bg)]} spacing={6}>
        <Text modifiers={[font({ weight: 'bold', size: 16 }), foregroundStyle(accent)]}>Classes</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(2)]}>Sign in to view timetable</Text>
      </VStack>
    );
  }

  const maxItems = large ? 6 : small ? 4 : 4;
  const cls = p.classes.slice(0, maxItems);
  const denseSmall = small && cls.length >= 4;
  const denseMedium = !small && !large && cls.length >= 4;

  // ── LOCK SCREEN — no foregroundStyle so iOS auto-tints for visibility ──
  if (family === 'accessoryInline') {
    const c = p.classes[0];
    const total = p.classes.length;
    return (
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>
        {c ? `${total} classes · Next ${c.startTime}` : 'No classes today'}
      </Text>
    );
  }

  if (family === 'accessoryCircular') {
    const next = p.classes[0];
    if (next) {
      return (
        <VStack spacing={0}>
          <Text modifiers={[font({ size: 16, weight: 'heavy' })]}>{next.startTime}</Text>
          <Text modifiers={[font({ size: 7, weight: 'bold' }), opacity(0.7)]}>NEXT</Text>
        </VStack>
      );
    }
    return (
      <VStack spacing={0}>
        <Text modifiers={[font({ size: 22, weight: 'heavy' })]}>0</Text>
        <Text modifiers={[font({ size: 7, weight: 'bold' }), opacity(0.6)]}>CLASS</Text>
      </VStack>
    );
  }

  if (family === 'accessoryRectangular') {
    const show = p.classes.slice(0, 4);
    return (
      <VStack spacing={1}>
        <Text modifiers={[font({ size: 11, weight: 'heavy' }), lineLimit(1)]}>
          {String(p.classes.length)} Classes Today
        </Text>
        {show.length === 0 ? (
          <Text modifiers={[font({ size: 10 }), opacity(0.7)]}>Free day!</Text>
        ) : (
          <VStack spacing={1}>
            {show.map((c, i) => (
              <HStack key={`${c.startTime}-${i}`} spacing={4}>
                <Text modifiers={[font({ size: 10, weight: 'bold' }), lineLimit(1)]}>
                  {c.startTime}
                </Text>
                <Text modifiers={[font({ size: 10 }), opacity(0.85), lineLimit(1)]}>
                  {c.label}{c.location ? ` · ${c.location}` : ''}
                </Text>
                <Spacer />
              </HStack>
            ))}
          </VStack>
        )}
      </VStack>
    );
  }

  // ─── HOME SCREEN (small / medium / large) ───
  return (
    <VStack
      modifiers={[padding({ all: denseSmall ? 12 : denseMedium ? 10 : 14 }), background(bg)]}
      spacing={small ? (denseSmall ? 6 : 8) : denseMedium ? 4 : 10}
    >

      {/* Header */}
      <HStack spacing={6}>
        <VStack spacing={2}>
          <Text modifiers={[font({ weight: 'heavy', size: small ? 13 : denseMedium ? 15 : 18 }), foregroundStyle(title), lineLimit(1)]}>
            {small ? 'Classes' : "Today's Classes"}
          </Text>
          {!denseMedium ? (
            <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(accent)]}>
              {small ? 'Today' : "Today's Schedule"}
            </Text>
          ) : null}
        </VStack>
        <Spacer />
        <VStack spacing={0}>
          <Text modifiers={[font({ size: small ? 20 : denseMedium ? 20 : 28, weight: 'heavy' }), foregroundStyle(accent)]}>
            {String(p.classes.length)}
          </Text>
          {!denseMedium ? (
            <Text modifiers={[font({ size: 8, weight: 'semibold' }), foregroundStyle(muted)]}>today</Text>
          ) : null}
        </VStack>
      </HStack>

      <Divider modifiers={[foregroundStyle(line), opacity(0.2)]} />

      {/* Class list */}
      {cls.length === 0 ? (
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>No classes today 🎉</Text>
      ) : (
        <VStack spacing={0}>
          {cls.map((c, i) => (
            <VStack key={`${c.startTime}-${c.label}-${i}`} spacing={0}>
              {i > 0 ? <Divider modifiers={[padding({ vertical: small ? (denseSmall ? 2 : 4) : denseMedium ? 2 : 6 }), foregroundStyle(line), opacity(0.18)]} /> : null}
              <HStack spacing={small ? (denseSmall ? 4 : 6) : denseMedium ? 6 : 10} modifiers={[padding({ vertical: small ? (denseSmall ? 0 : 1) : denseMedium ? 1 : 3 })]}>
                <VStack spacing={0} modifiers={small ? [] : [frame({ width: 46 })]}>
                  <Text modifiers={[font({ size: small ? (denseSmall ? 9 : 10) : denseMedium ? 12 : 13, weight: 'heavy' }), foregroundStyle(accent), lineLimit(1)]}>
                    {c.startTime}
                  </Text>
                  {!small && !denseMedium ? (
                    <Text modifiers={[font({ size: denseMedium ? 8 : 9, weight: 'semibold' }), foregroundStyle(muted), lineLimit(1)]}>
                      {c.endTime}
                    </Text>
                  ) : null}
                </VStack>
                <VStack spacing={denseSmall || denseMedium ? 0 : 1}>
                  <Text modifiers={[font({ size: small ? (denseSmall ? 10 : 11) : denseMedium ? 13 : 14, weight: 'bold' }), foregroundStyle(title), lineLimit(1)]}>
                    {c.label}
                  </Text>
                  {!denseMedium ? (
                    <Text modifiers={[font({ size: small ? (denseSmall ? 7 : 8) : denseMedium ? 8 : 9 }), foregroundStyle(muted), lineLimit(1)]}>
                      {c.location || '—'}
                    </Text>
                  ) : null}
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

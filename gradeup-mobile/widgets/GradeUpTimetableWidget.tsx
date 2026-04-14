import { Text, VStack, HStack, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, cornerRadius, background, frame } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps } from '../src/lib/homeWidgetProps';

function GradeUpTimetableWidgetView(props: HomeWidgetProps | null | undefined, env: WidgetEnvironment) {
  'widget';

  // ── Brand palette ──
  const navy = '#003366';
  const gold = '#f59e0b';

  function sec(scheme: 'light' | 'dark' | undefined): string {
    return scheme === 'dark' ? '#94a3b8' : '#64748b';
  }

  // ── Normalize ──
  const fallback: HomeWidgetProps = { dateISO: '', greeting: 'Rencana', signedIn: false, tasks: [], classes: [] };
  const p = props
    ? {
        dateISO: typeof props.dateISO === 'string' ? props.dateISO : '',
        greeting: typeof props.greeting === 'string' && props.greeting.trim() ? props.greeting : 'Rencana',
        signedIn: Boolean(props.signedIn),
        tasks: Array.isArray(props.tasks) ? props.tasks : [],
        classes: Array.isArray(props.classes) ? props.classes : [],
      }
    : fallback;

  const scheme = env.colorScheme;
  const family = env.widgetFamily;
  const small = family === 'systemSmall';
  const txt = scheme === 'dark' ? '#f1f5f9' : '#0f172a';

  const isLock =
    family === 'accessoryInline' ||
    family === 'accessoryCircular' ||
    family === 'accessoryRectangular';

  // ── Signed-out ──
  if (!p.signedIn) {
    return (
      <VStack modifiers={[padding({ all: 12 })]} spacing={8}>
        <Text modifiers={[font({ weight: 'bold', size: 18 }), foregroundStyle(navy)]}>
          Timetable
        </Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(sec(scheme)), lineLimit(3)]}>
          Sign in to see today's class schedule.
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(gold)]}>
          Tap to open →
        </Text>
      </VStack>
    );
  }

  const classes = isLock ? p.classes.slice(0, 1) : small ? p.classes.slice(0, 3) : p.classes.slice(0, 5);

  // ── Lock screen: inline ──
  if (family === 'accessoryInline') {
    const c = classes[0];
    return (
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(txt), lineLimit(1)]}>
        {c ? `📚 ${c.startTime} ${c.label}` : '🎉 No classes today'}
      </Text>
    );
  }

  // ── Lock screen: circular ──
  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={2}>
        <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle(txt)]}>
          {String(p.classes.length)}
        </Text>
        <Text modifiers={[font({ size: 9, weight: 'semibold' }), foregroundStyle(sec(scheme))]}>
          classes
        </Text>
      </VStack>
    );
  }

  // ── Lock screen: rectangular ──
  if (family === 'accessoryRectangular') {
    const c = classes[0];
    return (
      <VStack spacing={2}>
        <HStack spacing={4}>
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(txt)]}>Classes</Text>
          <Text modifiers={[font({ size: 10, weight: 'medium' }), foregroundStyle(sec(scheme))]}>
            {String(p.classes.length)} today
          </Text>
        </HStack>
        {c ? (
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(txt), lineLimit(1)]}>
            {c.startTime} {c.label}
          </Text>
        ) : (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(sec(scheme))]}>Free day!</Text>
        )}
      </VStack>
    );
  }

  // ── Home screen ──
  return (
    <VStack spacing={0}>
      {/* Header */}
      <HStack modifiers={[padding({ horizontal: 12, vertical: 8 })]}>
        <Text modifiers={[font({ weight: 'bold', size: small ? 15 : 17 }), foregroundStyle(txt)]}>
          {small ? 'Classes' : "Today's Classes"}
        </Text>
        <Spacer />
        <Text modifiers={[
          font({ size: 11, weight: 'bold' }),
          foregroundStyle(navy),
          padding({ horizontal: 6, vertical: 2 }),
          background(gold),
          cornerRadius(8),
        ]}>
          {String(p.classes.length)}
        </Text>
      </HStack>

      {/* Class list */}
      <VStack modifiers={[padding({ horizontal: 12, bottom: 10 })]} spacing={small ? 5 : 7}>
        {classes.length === 0 ? (
          <VStack spacing={4}>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(sec(scheme))]}>
              No classes today — enjoy the break!
            </Text>
          </VStack>
        ) : (
          classes.map((c, i) => (
            <HStack key={`${c.startTime}-${c.label}-${i}`} spacing={8}>
              {/* Time badge */}
              <VStack modifiers={[
                padding({ horizontal: 5, vertical: 3 }),
                background(scheme === 'dark' ? '#1e3a5f' : navy),
                cornerRadius(4),
              ]}>
                <Text modifiers={[font({ size: 9, weight: 'bold' }), foregroundStyle('#ffffff')]}>
                  {c.startTime}
                </Text>
                <Text modifiers={[font({ size: 8, weight: 'medium' }), foregroundStyle(gold)]}>
                  {c.endTime}
                </Text>
              </VStack>

              {/* Class info */}
              <VStack spacing={1}>
                <Text modifiers={[font({ size: small ? 12 : 13, weight: 'semibold' }), foregroundStyle(txt), lineLimit(1)]}>
                  {c.label}
                </Text>
                {c.location ? (
                  <Text modifiers={[font({ size: 10 }), foregroundStyle(sec(scheme)), lineLimit(1)]}>
                    {c.location}
                  </Text>
                ) : null}
              </VStack>
            </HStack>
          ))
        )}
      </VStack>
    </VStack>
  );
}

export default createWidget('GradeUpTimetable', GradeUpTimetableWidgetView);

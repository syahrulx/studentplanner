import { Text, VStack, HStack, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, cornerRadius, background, frame } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps, HomeWidgetTaskRow } from '../src/lib/homeWidgetProps';

function GradeUpTasksWidgetView(props: HomeWidgetProps | null | undefined, env: WidgetEnvironment) {
  'widget';

  // ── Brand palette ──
  const navy = '#003366';
  const gold = '#f59e0b';
  const red = '#dc2626';
  const blue = '#2563eb';

  function dotColor(accent: HomeWidgetTaskRow['accent']): string {
    if (accent === 'overdue') return red;
    if (accent === 'today') return blue;
    return navy;
  }

  function accentLabel(accent: HomeWidgetTaskRow['accent']): string {
    if (accent === 'overdue') return 'Overdue';
    if (accent === 'today') return 'Today';
    return '';
  }

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
          Tasks
        </Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(sec(scheme)), lineLimit(3)]}>
          Sign in to see your upcoming tasks.
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(gold)]}>
          Tap to open →
        </Text>
      </VStack>
    );
  }

  const tasks = isLock ? p.tasks.slice(0, 1) : small ? p.tasks.slice(0, 3) : p.tasks.slice(0, 5);

  // ── Lock screen: inline ──
  if (family === 'accessoryInline') {
    const t = tasks[0];
    return (
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(txt), lineLimit(1)]}>
        {t ? `📋 ${t.title}` : '✅ No tasks due'}
      </Text>
    );
  }

  // ── Lock screen: circular ──
  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={2}>
        <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle(txt)]}>
          {String(p.tasks.length)}
        </Text>
        <Text modifiers={[font({ size: 9, weight: 'semibold' }), foregroundStyle(sec(scheme))]}>
          tasks
        </Text>
      </VStack>
    );
  }

  // ── Lock screen: rectangular ──
  if (family === 'accessoryRectangular') {
    return (
      <VStack spacing={2}>
        <HStack spacing={4}>
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(txt)]}>Tasks</Text>
          <Text modifiers={[font({ size: 10, weight: 'medium' }), foregroundStyle(sec(scheme))]}>
            {String(p.tasks.length)} due
          </Text>
        </HStack>
        {tasks[0] ? (
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(dotColor(tasks[0].accent)), lineLimit(1)]}>
            {tasks[0].title}
          </Text>
        ) : (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(sec(scheme))]}>All clear!</Text>
        )}
      </VStack>
    );
  }

  // ── Home screen: small + medium ──
  return (
    <VStack spacing={0}>
      {/* Header */}
      <HStack modifiers={[padding({ horizontal: 12, vertical: 8 })]}>
        <Text modifiers={[font({ weight: 'bold', size: small ? 15 : 17 }), foregroundStyle(txt)]}>
          Tasks
        </Text>
        <Spacer />
        {/* Count badge */}
        <Text modifiers={[
          font({ size: 11, weight: 'bold' }),
          foregroundStyle(navy),
          padding({ horizontal: 6, vertical: 2 }),
          background(gold),
          cornerRadius(8),
        ]}>
          {String(p.tasks.length)}
        </Text>
      </HStack>

      {/* Task list */}
      <VStack modifiers={[padding({ horizontal: 12, bottom: 10 })]} spacing={small ? 5 : 6}>
        {tasks.length === 0 ? (
          <VStack spacing={4}>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(sec(scheme))]}>
              All caught up — no tasks due!
            </Text>
          </VStack>
        ) : (
          tasks.map((t) => (
            <HStack key={t.id} spacing={8}>
              {/* Color indicator dot */}
              <Text modifiers={[font({ size: 10 }), foregroundStyle(dotColor(t.accent)), padding({ top: 2 })]}>●</Text>

              <VStack spacing={1}>
                <HStack spacing={4}>
                  <Text modifiers={[font({ size: small ? 12 : 13, weight: 'semibold' }), foregroundStyle(txt), lineLimit(1)]}>
                    {t.title}
                  </Text>
                  {!small && accentLabel(t.accent) ? (
                    <Text modifiers={[
                      font({ size: 9, weight: 'bold' }),
                      foregroundStyle('#ffffff'),
                      padding({ horizontal: 4, vertical: 1 }),
                      background(dotColor(t.accent)),
                      cornerRadius(3),
                    ]}>
                      {accentLabel(t.accent)}
                    </Text>
                  ) : null}
                </HStack>
                <Text modifiers={[font({ size: small ? 10 : 11 }), foregroundStyle(sec(scheme)), lineLimit(1)]}>
                  {t.subtitle}
                </Text>
              </VStack>
            </HStack>
          ))
        )}
      </VStack>
    </VStack>
  );
}

export default createWidget('GradeUpTasks', GradeUpTasksWidgetView);

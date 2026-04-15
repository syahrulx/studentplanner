import { Text, VStack, HStack, Spacer, Divider, Link } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, opacity, containerBackground, background } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps, HomeWidgetTaskRow } from '../src/lib/homeWidgetProps';

function GradeUpTasksWidgetView(props: HomeWidgetProps | null | undefined, env: WidgetEnvironment) {
  'widget';

  // Always use app theme colors — widget bg painted from theme.
  const bg     = props?.theme?.background     || '#f8fafc';
  const title  = props?.theme?.text           || '#0f172a';
  const muted  = props?.theme?.textSecondary  || '#94a3b8';
  const accent = props?.theme?.primary        || '#003466';
  const red    = props?.theme?.danger         || '#ef4444';
  const warn   = props?.theme?.warning        || '#d97706';

  function dotClr(a: HomeWidgetTaskRow['accent']): string {
    if (a === 'overdue') return red;
    if (a === 'today') return warn;
    return accent;
  }

  function statusLabel(a: HomeWidgetTaskRow['accent']): string {
    if (a === 'overdue') return 'Overdue';
    if (a === 'today') return 'Due today';
    return '';
  }

  const fallback: HomeWidgetProps = { dateISO: '', greeting: 'Rencana', signedIn: false, tasks: [], classes: [], theme: { themeId: 'light', background: '#f8fafc', backgroundSecondary: '#f1f5f9', card: '#ffffff', border: '#e2e8f0', primary: '#2563eb', text: '#0f172a', textSecondary: '#64748b', danger: '#dc2626', warning: '#d97706' } };
  const p = props || fallback;

  const family = env.widgetFamily;
  const small  = family === 'systemSmall';
  const large  = family === 'systemLarge';
  const isLock = family === 'accessoryInline' || family === 'accessoryCircular' || family === 'accessoryRectangular';

  if (!p.signedIn) {
    return (
      <VStack modifiers={[padding({ all: 14 }), containerBackground(bg)]} spacing={6}>
        <Text modifiers={[font({ weight: 'bold', size: 16 }), foregroundStyle(accent)]}>Tasks</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(2)]}>Sign in to view tasks</Text>
      </VStack>
    );
  }

  const maxItems = large ? 6 : small ? 3 : 4;
  const tasks = isLock ? p.tasks.slice(0, 1) : p.tasks.slice(0, maxItems);

  // Lock screen variants
  if (family === 'accessoryInline') {
    const t = tasks[0];
    return <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(title), lineLimit(1)]}>{t ? t.title : 'No tasks due'}</Text>;
  }
  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={1}>
        <Text modifiers={[font({ size: 24, weight: 'heavy' }), foregroundStyle(title)]}>{String(p.tasks.length)}</Text>
        <Text modifiers={[font({ size: 8, weight: 'bold' }), foregroundStyle(muted)]}>TASKS</Text>
      </VStack>
    );
  }
  if (family === 'accessoryRectangular') {
    return (
      <VStack spacing={3}>
        <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(title)]}>{String(p.tasks.length)} tasks due</Text>
        {tasks[0] ? <Text modifiers={[font({ size: 12 }), foregroundStyle(title), lineLimit(1)]}>{tasks[0].title}</Text> : null}
      </VStack>
    );
  }

  // ─── HOME SCREEN (small / medium / large) ───
  return (
    <VStack modifiers={[padding({ all: 14 }), containerBackground(bg)]} spacing={small ? 8 : 10}>

      {/* Header */}
      <HStack spacing={6}>
        <VStack spacing={2}>
          <Text modifiers={[font({ weight: 'heavy', size: small ? 15 : 18 }), foregroundStyle(title)]}>
            Tasks
          </Text>
          <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(accent)]}>
            {String(p.tasks.length)} pending
          </Text>
        </VStack>
        <Spacer />
        <VStack spacing={2}>
          <Text modifiers={[font({ size: small ? 22 : 28, weight: 'heavy' }), foregroundStyle(accent)]}>
            {String(p.tasks.length)}
          </Text>
          <Link destination="rencana://add-task">
            <Text modifiers={[font({ size: 9, weight: 'bold' }), foregroundStyle(accent)]}>
              + Add
            </Text>
          </Link>
        </VStack>
      </HStack>

      {/* Task list */}
      {tasks.length === 0 ? (
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>All caught up! 🎉</Text>
      ) : (
        <VStack spacing={0}>
          {tasks.map((t, i) => (
            <VStack key={t.id} spacing={0}>
              {i > 0 ? <Divider modifiers={[padding({ vertical: small ? 4 : 5 }), opacity(0.08)]} /> : null}
              <HStack spacing={8} modifiers={[padding({ vertical: small ? 2 : 4 })]}>
                <Text modifiers={[font({ size: 7 }), foregroundStyle(dotClr(t.accent)), padding({ top: 3 })]}>●</Text>
                <VStack spacing={2}>
                  <Text modifiers={[font({ size: small ? 12 : 14, weight: 'bold' }), foregroundStyle(title), lineLimit(1)]}>
                    {t.title}
                  </Text>
                  {statusLabel(t.accent) ? (
                    <Text modifiers={[font({ size: 9, weight: 'bold' }), foregroundStyle(dotClr(t.accent)), lineLimit(1)]}>
                      {statusLabel(t.accent)}
                    </Text>
                  ) : (
                    <Text modifiers={[font({ size: 9 }), foregroundStyle(muted), lineLimit(1)]}>
                      {t.subtitle}
                    </Text>
                  )}
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

export default createWidget('GradeUpTasks', GradeUpTasksWidgetView);

import { ZStack, Text, VStack, HStack, Spacer, Divider, Link } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, opacity, background } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps, HomeWidgetTaskRow } from '../src/lib/homeWidgetProps';

function GradeUpTasksWidgetView(props: HomeWidgetProps | null | undefined, _env: WidgetEnvironment) {
  'widget';

  // Read theme colors from app — fallback to light if missing.
  const bg     = props?.theme?.background     || '#ffffff';
  const title  = props?.theme?.text           || '#0f172a';
  const muted  = props?.theme?.textSecondary  || '#64748b';
  const accent = props?.theme?.primary        || '#2563eb';
  const red    = props?.theme?.danger         || '#dc2626';
  const warn   = props?.theme?.warning        || '#d97706';
  const line   = props?.theme?.border         || '#e2e8f0';
  const pack   = props?.theme?.themePack;
  const packIcon = pack === 'cat' ? '🐾' : pack === 'spider' ? '🕸' : pack === 'purple' ? '✨' : '';

  // Increase blue presence for Spider theme
  const widgetBg = pack === 'spider' ? (props?.theme?.focusCard || bg) : bg;
  const iconColor = pack === 'spider' ? (props?.theme?.border || accent) : 
                    pack === 'cat' ? (props?.theme?.primary || accent) : title;
  const iconOpacity = pack === 'spider' ? 0.45 : 
                      pack === 'cat' ? 0.4 : 0.25;

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

  const fallback: HomeWidgetProps = { dateISO: '', greeting: 'Rencana', signedIn: false, tasks: [], classes: [], theme: { themeId: 'light', background: '#ffffff', backgroundSecondary: '#f1f5f9', card: '#ffffff', border: '#e2e8f0', primary: '#2563eb', text: '#0f172a', textSecondary: '#64748b', danger: '#dc2626', warning: '#d97706' } };
  const p = props || fallback;

  const family = _env.widgetFamily;
  const small  = family === 'systemSmall';
  const large  = family === 'systemLarge';
  const isLock = family === 'accessoryInline' || family === 'accessoryCircular' || family === 'accessoryRectangular';

  if (!p.signedIn) {
    return (
      <ZStack alignment="bottomTrailing" modifiers={[background(widgetBg)]}>
        {packIcon ? (
          <Text modifiers={[font({ size: 110 }), foregroundStyle(iconColor), opacity(iconOpacity), padding({ bottom: -25, trailing: -20 })]}>
            {packIcon}
          </Text>
        ) : null}
        <VStack modifiers={[padding({ all: 14 })]} spacing={6}>
          <Text modifiers={[font({ weight: 'bold', size: 16 }), foregroundStyle(accent)]}>Tasks</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(2)]}>Sign in to view tasks</Text>
        </VStack>
      </ZStack>
    );
  }

  // Always cap the visible list to 3 items to guarantee the header
  // never gets pushed off-screen on small widget sizes.
  const tasks = p.tasks.slice(0, 3);

  // ── LOCK SCREEN — no foregroundStyle so iOS auto-tints for visibility ──
  if (family === 'accessoryInline') {
    const t = tasks[0];
    const total = p.tasks.length;
    if (!t) {
      return <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>No tasks due ✓</Text>;
    }
    return (
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>
        {total} tasks · {t.accent === 'overdue' ? '⚠ ' : ''}{t.title}
      </Text>
    );
  }

  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={0}>
        <Text modifiers={[font({ size: 22, weight: 'heavy' })]}>{String(p.tasks.length)}</Text>
        <Text modifiers={[font({ size: 7, weight: 'bold' }), opacity(0.7)]}>TASKS</Text>
      </VStack>
    );
  }

  if (family === 'accessoryRectangular') {
    const show = p.tasks.slice(0, 4);
    return (
      <VStack spacing={1}>
        <Text modifiers={[font({ size: 11, weight: 'heavy' }), lineLimit(1)]}>
          {String(p.tasks.length)} Tasks Due
        </Text>
        {show.length === 0 ? (
          <Text modifiers={[font({ size: 10 }), opacity(0.7)]}>All caught up! ✓</Text>
        ) : (
          <VStack spacing={1}>
            {show.map((t) => (
              <HStack key={t.id} spacing={4}>
                <Text modifiers={[font({ size: 10, weight: 'bold' }), lineLimit(1)]}>
                  {t.accent === 'overdue' ? '⚠' : t.accent === 'today' ? '•' : '○'}
                </Text>
                <Text modifiers={[font({ size: 10 }), lineLimit(1)]}>
                  {t.title}
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
    <ZStack alignment="bottomTrailing" modifiers={[background(widgetBg)]}>
      {packIcon ? (
        <Text modifiers={[font({ size: large ? 200 : small ? 120 : 160 }), foregroundStyle(iconColor), opacity(iconOpacity), padding({ bottom: small ? -25 : -35, trailing: small ? -20 : -30 })]}>
          {packIcon}
        </Text>
      ) : null}
      <VStack modifiers={[padding({ all: 14 })]} spacing={small ? 8 : 10}>

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
          {!small ? (
            <Link destination="rencana://add-task">
              <Text modifiers={[font({ size: 9, weight: 'bold' }), foregroundStyle(accent)]}>
                + Add
              </Text>
            </Link>
          ) : null}
        </VStack>
      </HStack>

      <Divider modifiers={[foregroundStyle(line), opacity(0.2)]} />

      {/* Task list */}
      {tasks.length === 0 ? (
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>All caught up! 🎉</Text>
      ) : (
        <VStack spacing={0}>
          {tasks.map((t, i) => (
            <VStack key={t.id} spacing={0}>
              {i > 0 ? <Divider modifiers={[padding({ vertical: small ? 4 : 5 }), foregroundStyle(line), opacity(0.18)]} /> : null}
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
    </ZStack>
  );
}

export default createWidget('GradeUpTasks', GradeUpTasksWidgetView);

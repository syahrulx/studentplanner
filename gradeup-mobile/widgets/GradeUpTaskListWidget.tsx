import { ZStack, Text, VStack, HStack, Spacer, Divider } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, frame, opacity, background, containerRelativeFrame, cornerRadius } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps, HomeWidgetTaskRow } from '../src/lib/homeWidgetProps';

/**
 * Task list — every deadline in one tall column.
 *
 * The existing Tasks widget is a two-row summary built for the small and
 * medium frames. This one exists for the large frame, where a student can see
 * the whole week of deadlines without opening anything: one row per task,
 * ordered by urgency, with a coloured bar carrying the state so the eye can
 * skip straight to what is overdue.
 */
function GradeUpTaskListWidgetView(props: HomeWidgetProps | null | undefined, _env: WidgetEnvironment) {
  'widget';

  const bg     = props?.theme?.background    || '#ffffff';
  const title  = props?.theme?.text          || '#0f172a';
  const muted  = props?.theme?.textSecondary || '#64748b';
  const accent = props?.theme?.primary       || '#2563eb';
  const danger = props?.theme?.danger        || '#dc2626';
  const warn   = props?.theme?.warning       || '#d97706';
  const line   = props?.theme?.border        || '#e2e8f0';
  const pack   = props?.theme?.themePack;

  const widgetBg = pack === 'spider' ? (props?.theme?.focusCard || bg) : bg;

  const renderMode = _env.widgetRenderingMode ?? 'fullColor';
  const isFullColor = renderMode === 'fullColor';
  const fg = (color: string) => (isFullColor ? [foregroundStyle(color)] : []);
  const bgMods = isFullColor
    ? [containerRelativeFrame({ axes: 'both' }), background(widgetBg)]
    : [containerRelativeFrame({ axes: 'both' })];

  const family = _env.widgetFamily;
  const small = family === 'systemSmall';
  const large = family === 'systemLarge';

  const insets = {
    top: small ? 16 : large ? 20 : 16,
    side: small ? 15 : 17,
    bottom: small ? 14 : large ? 16 : 13,
  };

  if (!props?.signedIn) {
    return (
      <ZStack alignment="topLeading" modifiers={bgMods}>
        <VStack alignment="leading" modifiers={[padding({ top: insets.top, leading: insets.side, trailing: insets.side, bottom: insets.bottom })]} spacing={6}>
          <Spacer />
          <Text modifiers={[font({ weight: 'bold', size: 16 }), ...fg(accent)]}>Tasks</Text>
          <Text modifiers={[font({ size: 12 }), ...fg(muted), lineLimit(2)]}>Sign in to view tasks</Text>
        </VStack>
      </ZStack>
    );
  }

  const all: HomeWidgetTaskRow[] = Array.isArray(props.tasks) ? props.tasks : [];
  // Each frame takes what it can show without the last row running off the
  // bottom edge; the header still reports the true total either way.
  const rows = all.slice(0, small ? 3 : large ? 8 : 4);
  const overdue = all.filter((t) => t.accent === 'overdue').length;

  const colorFor = (accentName: HomeWidgetTaskRow['accent']) =>
    accentName === 'overdue' ? danger : accentName === 'today' ? warn : accent;

  return (
    <ZStack alignment="topLeading" modifiers={bgMods}>
      <VStack
        alignment="leading"
        modifiers={[padding({ top: insets.top, leading: insets.side, trailing: insets.side, bottom: insets.bottom })]}
        spacing={small ? 7 : 9}
      >
        <HStack spacing={6} alignment="top">
          <VStack spacing={2} alignment="leading" modifiers={[padding({ leading: 4 })]}>
            <Text modifiers={[font({ weight: 'heavy', size: small ? 14 : large ? 19 : 17 }), ...fg(title), lineLimit(1)]}>
              {small ? 'Tasks' : 'Your tasks'}
            </Text>
            <Text modifiers={[font({ size: 10, weight: 'bold' }), ...fg(overdue > 0 ? danger : accent)]}>
              {overdue > 0
                ? `${overdue} overdue`
                : `${all.length} ${all.length === 1 ? 'task' : 'tasks'}`}
            </Text>
          </VStack>
          <Spacer />
          {!small ? (
            <Text modifiers={[font({ size: large ? 30 : 26, weight: 'heavy' }), ...fg(accent)]}>
              {String(all.length)}
            </Text>
          ) : null}
        </HStack>

        <Divider modifiers={[...fg(line), opacity(0.2)]} />

        {rows.length === 0 ? (
          <HStack>
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), ...fg(muted)]}>All caught up</Text>
            <Spacer />
          </HStack>
        ) : (
          <VStack spacing={small ? 6 : 8} alignment="leading">
            {rows.map((t) => (
              <HStack key={t.id} spacing={8} alignment="top">
                <VStack
                  modifiers={[
                    frame({ width: 3 }),
                    ...(isFullColor ? [background(colorFor(t.accent)), cornerRadius(2)] : []),
                  ]}
                >
                  <Spacer />
                </VStack>
                <VStack spacing={1} alignment="leading">
                  <Text modifiers={[font({ size: small ? 11 : 13, weight: 'semibold' }), ...fg(title), lineLimit(1)]}>
                    {t.title}
                  </Text>
                  <Text modifiers={[font({ size: small ? 9 : 10 }), ...fg(colorFor(t.accent)), lineLimit(1)]}>
                    {t.subtitle}
                  </Text>
                </VStack>
                <Spacer />
              </HStack>
            ))}
          </VStack>
        )}

        {all.length > rows.length ? (
          <Text modifiers={[font({ size: 10, weight: 'semibold' }), ...fg(muted)]}>
            {`+${all.length - rows.length} more`}
          </Text>
        ) : null}

        <Spacer />
      </VStack>
    </ZStack>
  );
}

export default createWidget<HomeWidgetProps>('GradeUpTaskList', GradeUpTaskListWidgetView);

import { ZStack, Text, VStack, HStack, Spacer, Divider } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, frame, opacity, background, containerRelativeFrame, cornerRadius } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps, HomeWidgetWeekDay } from '../src/lib/homeWidgetProps';

/**
 * Week — the seven-day strip as a widget.
 *
 * The other widgets answer "what is next"; this one answers "how heavy is this
 * week", which is the question the Timetable tab gets opened for most. It is
 * also the only one of the four that earns a lock-screen slot: a student
 * glancing at a locked phone wants the shape of the week, not a room number.
 *
 * On the lock screen iOS renders every widget in a single tint, so this draws
 * with weight and spacing instead of colour, and never sets foregroundStyle
 * there — letting the system tint it is what keeps it legible on any wallpaper.
 */
function GradeUpWeekWidgetView(props: HomeWidgetProps | null | undefined, _env: WidgetEnvironment) {
  'widget';

  const bg     = props?.theme?.background    || '#ffffff';
  const title  = props?.theme?.text          || '#0f172a';
  const muted  = props?.theme?.textSecondary || '#64748b';
  const accent = props?.theme?.primary       || '#2563eb';
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

  if (!props?.signedIn) {
    return (
      <ZStack alignment="topLeading" modifiers={bgMods}>
        <VStack alignment="leading" modifiers={[padding({ top: 16, leading: 16, trailing: 16, bottom: 14 })]} spacing={6}>
          <Spacer />
          <Text modifiers={[font({ weight: 'bold', size: 16 }), ...fg(accent)]}>Week</Text>
          <Text modifiers={[font({ size: 12 }), ...fg(muted), lineLimit(2)]}>Sign in to view your week</Text>
        </VStack>
      </ZStack>
    );
  }

  // Older app builds wrote a payload without `week`; fall back to an empty
  // strip rather than crashing the widget on a stale snapshot.
  const week: HomeWidgetWeekDay[] = Array.isArray(props.week) ? props.week : [];
  const total = week.reduce((n, d) => n + d.count, 0);
  const todayISO = props.dateISO || '';

  // ── LOCK SCREEN ───────────────────────────────────────────────────────────
  if (family === 'accessoryInline') {
    const today = week.find((d) => d.dateISO === todayISO);
    return (
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>
        {total === 0 ? 'No classes this week' : `${total} this week · ${today ? today.count : 0} today`}
      </Text>
    );
  }

  if (family === 'accessoryCircular') {
    const today = week.find((d) => d.dateISO === todayISO);
    return (
      <VStack spacing={0}>
        <Text modifiers={[font({ size: 22, weight: 'heavy' })]}>{String(today ? today.count : 0)}</Text>
        <Text modifiers={[font({ size: 7, weight: 'bold' }), opacity(0.7)]}>TODAY</Text>
      </VStack>
    );
  }

  if (family === 'accessoryRectangular') {
    if (week.length === 0) {
      return (
        <VStack spacing={1} alignment="leading">
          <Text modifiers={[font({ size: 11, weight: 'heavy' }), lineLimit(1)]}>This week</Text>
          <Text modifiers={[font({ size: 10 }), opacity(0.7)]}>No classes</Text>
        </VStack>
      );
    }
    return (
      <VStack spacing={2} alignment="leading">
        <Text modifiers={[font({ size: 11, weight: 'heavy' }), lineLimit(1)]}>
          {`This week · ${total}`}
        </Text>
        <HStack spacing={0}>
          {week.map((d) => (
            <VStack key={d.dateISO} spacing={0} modifiers={[frame({ width: 22 })]}>
              <Text modifiers={[font({ size: 9, weight: d.dateISO === todayISO ? 'heavy' : 'regular' }), opacity(d.dateISO === todayISO ? 1 : 0.6)]}>
                {d.initial}
              </Text>
              <Text modifiers={[font({ size: 12, weight: d.count > 0 ? 'heavy' : 'regular' }), opacity(d.count > 0 ? 1 : 0.35)]}>
                {d.count > 0 ? String(d.count) : '·'}
              </Text>
            </VStack>
          ))}
        </HStack>
      </VStack>
    );
  }

  // ── HOME SCREEN ───────────────────────────────────────────────────────────
  // Small fits the strip alone; medium adds a few codes under each day; large
  // is the "every class this week" frame and lists the lot.
  const codesPerDay = small ? 0 : large ? 6 : 3;

  return (
    <ZStack alignment="topLeading" modifiers={bgMods}>
      <VStack
        alignment="leading"
        modifiers={[padding({ top: large ? 20 : 16, leading: small ? 15 : 17, trailing: small ? 15 : 17, bottom: large ? 16 : small ? 14 : 13 })]}
        spacing={small ? 8 : large ? 12 : 10}
      >
        <HStack spacing={6} alignment="top">
          <VStack spacing={2} alignment="leading" modifiers={[padding({ leading: 4, top: 2 })]}>
            <Text modifiers={[font({ weight: 'heavy', size: small ? 14 : large ? 20 : 18 }), ...fg(title), lineLimit(1)]}>
              This week
            </Text>
            <Text modifiers={[font({ size: 10, weight: 'bold' }), ...fg(accent)]}>
              {`${total} ${total === 1 ? 'class' : 'classes'}`}
            </Text>
          </VStack>
          <Spacer />
        </HStack>

        <Divider modifiers={[...fg(line), opacity(0.2)]} />

        {week.length === 0 ? (
          <HStack>
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), ...fg(muted)]}>No classes this week</Text>
            <Spacer />
          </HStack>
        ) : (
          <HStack spacing={small ? 2 : 4} alignment="top">
            {week.map((d) => {
              const isToday = d.dateISO === todayISO;
              return (
                <VStack
                  key={d.dateISO}
                  spacing={2}
                  modifiers={[
                    containerRelativeFrame({ axes: 'horizontal', count: 7, span: 1, spacing: 0, alignment: 'center' }),
                    padding({ vertical: 4 }),
                    ...(isToday && isFullColor ? [background(`${accent}22`), cornerRadius(8)] : []),
                  ]}
                >
                  <Text modifiers={[font({ size: 9, weight: 'bold' }), ...fg(isToday ? accent : muted), lineLimit(1)]}>
                    {d.initial}
                  </Text>
                  <Text modifiers={[font({ size: small ? 12 : large ? 15 : 13, weight: 'heavy' }), ...fg(isToday ? accent : title), lineLimit(1)]}>
                    {String(d.date)}
                  </Text>
                  {codesPerDay > 0
                    ? d.codes.slice(0, codesPerDay).map((code, i) => (
                        <Text
                          key={`${d.dateISO}-${i}`}
                          modifiers={[font({ size: large ? 9 : 8, weight: 'semibold' }), ...fg(muted), lineLimit(1)]}
                        >
                          {code}
                        </Text>
                      ))
                    : d.count > 0
                      ? (
                        <Text modifiers={[font({ size: 9, weight: 'bold' }), ...fg(accent)]}>
                          {String(d.count)}
                        </Text>
                      )
                      : null}
                </VStack>
              );
            })}
          </HStack>
        )}

        <Spacer />
      </VStack>
    </ZStack>
  );
}

export default createWidget<HomeWidgetProps>('GradeUpWeek', GradeUpWeekWidgetView);

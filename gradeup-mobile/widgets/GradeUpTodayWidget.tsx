import { Text, VStack, HStack, Spacer } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, cornerRadius, background, frame, opacity } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps, HomeWidgetTaskRow, HomeWidgetClassRow } from '../src/lib/homeWidgetProps';

function GradeUpTodayWidgetView(props: HomeWidgetProps | null | undefined, env: WidgetEnvironment) {
  'widget';

  // ── Brand palette (inlined for JSContext) ──
  const navy = '#003366';
  const gold = '#f59e0b';
  const red = '#dc2626';
  const blue = '#2563eb';

  function dotColor(accent: HomeWidgetTaskRow['accent']): string {
    if (accent === 'overdue') return red;
    if (accent === 'today') return blue;
    return navy;
  }

  function sec(scheme: 'light' | 'dark' | undefined): string {
    return scheme === 'dark' ? '#94a3b8' : '#64748b';
  }

  // ── Normalize props ──
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
  const small = env.widgetFamily === 'systemSmall';
  const txt = scheme === 'dark' ? '#f1f5f9' : '#0f172a';

  // ── Format date ──
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let dateLabel = '';
  if (p.dateISO) {
    const d = new Date(p.dateISO + 'T12:00:00');
    dateLabel = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  }

  // ── Signed-out state ──
  if (!p.signedIn) {
    return (
      <VStack modifiers={[padding({ all: 12 })]} spacing={8}>
        <Text modifiers={[font({ weight: 'bold', size: 18 }), foregroundStyle(navy)]}>
          Rencana
        </Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(sec(scheme)), lineLimit(3)]}>
          Sign in to see your schedule and tasks.
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(gold)]}>
          Tap to open →
        </Text>
      </VStack>
    );
  }

  const taskRows = small ? p.tasks.slice(0, 2) : p.tasks.slice(0, 3);
  const classRows = small ? p.classes.slice(0, 2) : p.classes.slice(0, 3);

  return (
    <VStack spacing={0}>
      {/* ── Header ── */}
      <HStack modifiers={[padding({ horizontal: 12, vertical: 8 }), background(navy), cornerRadius(0)]}>
        <Text modifiers={[font({ weight: 'bold', size: small ? 14 : 16 }), foregroundStyle('#ffffff')]}>
          {p.greeting}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(gold)]}>
          {dateLabel}
        </Text>
      </HStack>

      {/* ── Content ── */}
      <VStack modifiers={[padding({ horizontal: 12, vertical: 8 })]} spacing={6}>

        {/* Tasks */}
        {taskRows.length > 0 ? (
          <VStack spacing={4}>
            {taskRows.map((t) => (
              <HStack key={t.id} spacing={6}>
                <Text modifiers={[font({ size: 8 }), foregroundStyle(dotColor(t.accent))]}>●</Text>
                <VStack spacing={1}>
                  <Text modifiers={[font({ size: small ? 12 : 13, weight: 'semibold' }), foregroundStyle(txt), lineLimit(1)]}>
                    {t.title}
                  </Text>
                  {!small ? (
                    <Text modifiers={[font({ size: 10 }), foregroundStyle(sec(scheme)), lineLimit(1)]}>
                      {t.subtitle}
                    </Text>
                  ) : null}
                </VStack>
              </HStack>
            ))}
          </VStack>
        ) : null}

        {/* Divider between tasks and classes */}
        {taskRows.length > 0 && classRows.length > 0 ? (
          <HStack modifiers={[frame({ height: 1 }), background(scheme === 'dark' ? '#334155' : '#e2e8f0'), cornerRadius(1)]} />
        ) : null}

        {/* Classes */}
        {classRows.length > 0 ? (
          <VStack spacing={3}>
            {classRows.map((c, i) => (
              <HStack key={`${c.startTime}-${i}`} spacing={6}>
                <Text modifiers={[
                  font({ size: 10, weight: 'bold' }),
                  foregroundStyle('#ffffff'),
                  padding({ horizontal: 4, vertical: 2 }),
                  background(navy),
                  cornerRadius(3),
                ]}>
                  {c.startTime}
                </Text>
                <VStack spacing={0}>
                  <Text modifiers={[font({ size: small ? 11 : 12, weight: 'medium' }), foregroundStyle(txt), lineLimit(1)]}>
                    {c.label}
                  </Text>
                  {!small && c.location ? (
                    <Text modifiers={[font({ size: 10 }), foregroundStyle(sec(scheme)), lineLimit(1)]}>
                      {c.location}
                    </Text>
                  ) : null}
                </VStack>
              </HStack>
            ))}
          </VStack>
        ) : null}

        {/* Empty state */}
        {taskRows.length === 0 && classRows.length === 0 ? (
          <VStack spacing={4}>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(sec(scheme)), lineLimit(3)]}>
              Nothing scheduled today — enjoy the free time!
            </Text>
          </VStack>
        ) : null}
      </VStack>
    </VStack>
  );
}

export default createWidget('GradeUpToday', GradeUpTodayWidgetView);

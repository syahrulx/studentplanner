import { Text, VStack, HStack, Spacer, Divider } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, frame, opacity } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps, HomeWidgetTaskRow } from '../src/lib/homeWidgetProps';

function GradeUpTodayWidgetView(props: HomeWidgetProps | null | undefined, env: WidgetEnvironment) {
  'widget';

  const dark    = env.colorScheme === 'dark';
  const title   = dark ? '#ffffff' : '#0f172a';
  const body    = dark ? '#e2e8f0' : '#1e293b';
  const muted   = dark ? '#64748b' : '#94a3b8';
  const accent  = dark ? '#60a5fa' : '#003466';
  const divClr  = dark ? '#2d3e52' : '#dde3ed';

  function dotClr(a: HomeWidgetTaskRow['accent']): string {
    if (a === 'overdue') return '#ef4444';
    if (a === 'today') return '#3b82f6';
    return accent;
  }

  function stsTxt(a: HomeWidgetTaskRow['accent']): string {
    if (a === 'overdue') return 'Overdue';
    if (a === 'today') return 'Due today';
    return '';
  }

  const fallback: HomeWidgetProps = { dateISO: '', greeting: 'Hi', signedIn: false, tasks: [], classes: [] };
  const p = props
    ? {
        dateISO:  typeof props.dateISO === 'string'  ? props.dateISO  : '',
        greeting: typeof props.greeting === 'string' && props.greeting.trim() ? props.greeting : 'Hi',
        signedIn: Boolean(props.signedIn),
        tasks:    Array.isArray(props.tasks)   ? props.tasks   : [],
        classes:  Array.isArray(props.classes) ? props.classes : [],
      }
    : fallback;

  const family = env.widgetFamily;
  const small  = family === 'systemSmall';
  const large  = family === 'systemLarge';

  const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let dl = 'Today';
  if (p.dateISO) {
    const d = new Date(p.dateISO + 'T12:00:00');
    dl = small
      ? `${dn[d.getDay()].slice(0,3)} ${d.getDate()} ${mn[d.getMonth()]}`
      : `${dn[d.getDay()]}, ${mn[d.getMonth()]} ${d.getDate()}`;
  }

  const count = p.tasks.length + p.classes.length;

  if (!p.signedIn) {
    return (
      <VStack modifiers={[padding({ all: 14 })]} spacing={6}>
        <Text modifiers={[font({ weight: 'bold', size: 16 }), foregroundStyle(accent)]}>Rencana</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), lineLimit(2)]}>Sign in to see your schedule</Text>
      </VStack>
    );
  }

  // ─────────────────────────────────────────────────────
  // SMALL: pure typography, single column
  // ─────────────────────────────────────────────────────
  if (small) {
    const sTasks = p.tasks.slice(0, 2);
    const sCls   = p.classes.slice(0, 2);
    return (
      <VStack modifiers={[padding({ all: 13 })]} spacing={6}>
        {/* Header */}
        <HStack spacing={4}>
          <VStack spacing={1}>
            <Text modifiers={[font({ weight: 'heavy', size: 13 }), foregroundStyle(title), lineLimit(1)]}>
              {p.greeting}
            </Text>
            <Text modifiers={[font({ size: 9, weight: 'semibold' }), foregroundStyle(accent), lineLimit(1)]}>
              {dl}
            </Text>
          </VStack>
          <Spacer />
          <Text modifiers={[font({ size: 18, weight: 'heavy' }), foregroundStyle(accent)]}>
            {String(count)}
          </Text>
        </HStack>

        {/* Tasks */}
        {sTasks.length > 0 ? (
          <VStack spacing={4}>
            {sTasks.map((t) => (
              <HStack key={t.id} spacing={5}>
                <Text modifiers={[font({ size: 6 }), foregroundStyle(dotClr(t.accent))]}>●</Text>
                <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(body), lineLimit(1)]}>
                  {t.title}
                </Text>
              </HStack>
            ))}
          </VStack>
        ) : null}

        {sTasks.length > 0 && sCls.length > 0 ? (
          <Divider modifiers={[opacity(0.15)]} />
        ) : null}

        {/* Classes */}
        {sCls.length > 0 ? (
          <VStack spacing={5}>
            {sCls.map((c, i) => (
              <HStack key={`${c.startTime}-${i}`} spacing={6}>
                <Text modifiers={[font({ size: 10, weight: 'heavy' }), foregroundStyle(accent), lineLimit(1)]}>
                  {c.startTime}
                </Text>
                <VStack spacing={0}>
                  <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(body), lineLimit(1)]}>
                    {c.label}
                  </Text>
                  <Text modifiers={[font({ size: 8 }), foregroundStyle(muted), lineLimit(1)]}>
                    {c.location || '—'}
                  </Text>
                </VStack>
              </HStack>
            ))}
          </VStack>
        ) : null}

        {sTasks.length === 0 && sCls.length === 0 ? (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>Free day! 🎉</Text>
        ) : null}
      </VStack>
    );
  }

  // ─────────────────────────────────────────────────────
  // MEDIUM / LARGE: 2-column layout — NO inner card bg
  // Just a thin 1pt vertical line separates columns
  // ─────────────────────────────────────────────────────
  const colMax  = large ? 4 : 2;
  const colTask = p.tasks.slice(0, colMax);
  const colCls  = p.classes.slice(0, colMax);

  return (
    <VStack modifiers={[padding({ all: 14 })]} spacing={10}>

      {/* ── Header ── */}
      <HStack spacing={6}>
        <VStack spacing={2}>
          <Text modifiers={[font({ weight: 'heavy', size: 18 }), foregroundStyle(title), lineLimit(1)]}>
            {p.greeting}
          </Text>
          <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(accent), lineLimit(1)]}>
            {dl}
          </Text>
        </VStack>
        <Spacer />
        <VStack spacing={0}>
          <Text modifiers={[font({ size: 28, weight: 'heavy' }), foregroundStyle(accent)]}>
            {String(count)}
          </Text>
          <Text modifiers={[font({ size: 8, weight: 'semibold' }), foregroundStyle(muted)]}>items</Text>
        </VStack>
      </HStack>

      {/* ── Separator ── */}
      <Divider modifiers={[opacity(0.1)]} />

      {/* ── Two-column content — no background, just vertical divider ── */}
      <HStack spacing={0}>

        {/* TASKS column */}
        <VStack spacing={6} modifiers={[padding({ trailing: 12 })]}>
          <HStack spacing={4}>
            <Text modifiers={[font({ size: 8, weight: 'heavy' }), foregroundStyle(accent)]}>TASKS</Text>
            <Spacer />
            <Text modifiers={[font({ size: 8, weight: 'bold' }), foregroundStyle(muted)]}>
              {String(p.tasks.length)}
            </Text>
          </HStack>

          {colTask.length === 0 ? (
            <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>All done! 🎉</Text>
          ) : (
            <VStack spacing={5}>
              {colTask.map((t) => (
                <HStack key={t.id} spacing={5}>
                  <Text modifiers={[font({ size: 6 }), foregroundStyle(dotClr(t.accent)), padding({ top: 2 })]}>●</Text>
                  <VStack spacing={1}>
                    <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(title), lineLimit(1)]}>
                      {t.title}
                    </Text>
                    {stsTxt(t.accent) ? (
                      <Text modifiers={[font({ size: 8, weight: 'bold' }), foregroundStyle(dotClr(t.accent)), lineLimit(1)]}>
                        {stsTxt(t.accent)}
                      </Text>
                    ) : (
                      <Text modifiers={[font({ size: 8 }), foregroundStyle(muted), lineLimit(1)]}>
                        {t.subtitle}
                      </Text>
                    )}
                  </VStack>
                  <Spacer />
                </HStack>
              ))}
            </VStack>
          )}
          <Spacer />
        </VStack>

        {/* Vertical 1pt line */}
        <VStack modifiers={[frame({ width: 1 }), opacity(0.12)]}>
          <Divider />
          <Spacer />
        </VStack>

        {/* CLASSES column */}
        <VStack spacing={6} modifiers={[padding({ leading: 12 })]}>
          <HStack spacing={4}>
            <Text modifiers={[font({ size: 8, weight: 'heavy' }), foregroundStyle(accent)]}>CLASSES</Text>
            <Spacer />
            <Text modifiers={[font({ size: 8, weight: 'bold' }), foregroundStyle(muted)]}>
              {String(p.classes.length)}
            </Text>
          </HStack>

          {colCls.length === 0 ? (
            <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>Free! 🎉</Text>
          ) : (
            <VStack spacing={6}>
              {colCls.map((c, i) => (
                <VStack key={`${c.startTime}-${c.label}-${i}`} spacing={1}>
                  <HStack spacing={5}>
                    <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(accent), lineLimit(1)]}>
                      {c.startTime}
                    </Text>
                    <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(title), lineLimit(1)]}>
                      {c.label}
                    </Text>
                  </HStack>
                  <Text modifiers={[font({ size: 8 }), foregroundStyle(muted), lineLimit(1)]}>
                    {c.location || '—'}
                  </Text>
                </VStack>
              ))}
            </VStack>
          )}
          <Spacer />
        </VStack>

      </HStack>
    </VStack>
  );
}

export default createWidget('GradeUpToday', GradeUpTodayWidgetView);

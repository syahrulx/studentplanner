import { ZStack, Text, VStack, HStack, Spacer, Divider } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding, frame, opacity, background, containerRelativeFrame } from '@expo/ui/swift-ui/modifiers';
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
  const pack   = props?.theme?.themePack;

  // Increase blue presence for Spider theme
  const widgetBg = pack === 'spider' ? (props?.theme?.focusCard || bg) : bg;

  // ── Rendering-mode awareness (iOS 16+) ──
  // 'fullColor' = normal home screen, 'accented' = Tinted, 'vibrant' = Clear
  const renderMode = _env.widgetRenderingMode ?? 'fullColor';
  const isFullColor = renderMode === 'fullColor';

  // Helper: only apply foregroundStyle when in fullColor mode;
  // in accented/vibrant modes, omit it so iOS auto-tints for legibility.
  const fg = (color: string) => isFullColor ? [foregroundStyle(color)] : [];
  const bgMods = isFullColor
    ? [containerRelativeFrame({ axes: 'both' }), background(widgetBg)]
    : [containerRelativeFrame({ axes: 'both' })];

  const fallback: HomeWidgetProps = { dateISO: '', greeting: 'Rencana', signedIn: false, tasks: [], classes: [], theme: { themeId: 'light', background: '#ffffff', backgroundSecondary: '#f1f5f9', card: '#ffffff', border: '#e2e8f0', primary: '#2563eb', text: '#0f172a', textSecondary: '#64748b', danger: '#dc2626', warning: '#d97706' } };
  const p = props || fallback;

  const family = _env.widgetFamily;
  const small  = family === 'systemSmall';
  const large  = family === 'systemLarge';
  const contentInsets = {
    top: small ? 16 : large ? 18 : 12,
    side: small ? 13 : 14,
    bottom: small ? 12 : large ? 13 : 10,
  };
  const isLock = family === 'accessoryInline' || family === 'accessoryCircular' || family === 'accessoryRectangular';

  if (!p.signedIn) {
    return (
      <ZStack alignment="topLeading" modifiers={bgMods}>
        <VStack
          alignment="leading"
          modifiers={[padding({ top: contentInsets.top, leading: contentInsets.side, trailing: contentInsets.side, bottom: contentInsets.bottom })]}
          spacing={6}
        >
          <Spacer />
          <Text modifiers={[font({ weight: 'bold', size: 16 }), ...fg(accent)]}>Classes</Text>
          <Text modifiers={[font({ size: 12 }), ...fg(muted), lineLimit(2)]}>Sign in to view timetable</Text>
        </VStack>
      </ZStack>
    );
  }

  // WidgetKit's systemSmall and systemMedium families are both short. Capping
  // their rows prevents the 3–6 class layout from extending below the widget;
  // the header still reports the full class count.
  const maxItems = small ? 2 : family === 'systemMedium' ? 4 : 6;
  const cls = p.classes.slice(0, maxItems);
  const isDense = cls.length > 2;
  const denseSmall = small && isDense;
  const denseMedium = family === 'systemMedium' && isDense;

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

  const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let dl = 'Today';
  if (p.dateISO) {
    const d = new Date(p.dateISO + 'T12:00:00');
    dl = small
      ? `${dn[d.getDay()].slice(0,3)} ${d.getDate()} ${mn[d.getMonth()]}`
      : `${dn[d.getDay()]}, ${mn[d.getMonth()]} ${d.getDate()}`;
  }

  return (
    <ZStack alignment="topLeading" modifiers={bgMods}>
      <VStack
        alignment="leading"
        modifiers={[
          padding({ top: contentInsets.top, leading: contentInsets.side, trailing: contentInsets.side, bottom: contentInsets.bottom })
        ]}
        spacing={small ? (denseSmall ? 4 : 8) : denseMedium ? 4 : 10}
      >
        {/* Header */}
        <HStack spacing={6} alignment="top">
          <VStack spacing={denseMedium ? 0 : 2} alignment="leading" modifiers={[padding({ leading: 6, top: denseMedium ? 2 : 6 })]}>
            <Text modifiers={[font({ weight: 'heavy', size: small ? 13 : denseMedium ? 15 : 18 }), ...fg(title), lineLimit(1)]}>
              {small ? 'Classes' : "Today's Classes"}
            </Text>
            {!small ? (
              <Text modifiers={[font({ size: 10, weight: 'bold' }), ...fg(accent)]}>
                {dl}
              </Text>
            ) : null}
          </VStack>
          <Spacer />
          <VStack spacing={0} alignment="trailing">
            <Text modifiers={[font({ size: small ? 20 : denseMedium ? 20 : 28, weight: 'heavy' }), ...fg(accent)]}>
              {String(p.classes.length)}
            </Text>
            {!denseMedium ? (
              <Text modifiers={[font({ size: 8, weight: 'semibold' }), ...fg(muted)]}>today</Text>
            ) : null}
          </VStack>
        </HStack>

        <Divider modifiers={[...fg(line), opacity(0.2)]} />

        {/* Content Section */}
        {cls.length === 0 ? (
          <HStack>
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), ...fg(muted)]}>No classes today</Text>
            <Spacer />
          </HStack>
        ) : (denseSmall || denseMedium) ? (
          <HStack spacing={0} alignment="top">
            {/* Left Column */}
            <VStack
              spacing={0}
              alignment="center"
              modifiers={[containerRelativeFrame({ axes: 'horizontal', count: 2, span: 1, spacing: 0, alignment: 'center' })]}
            >
              {/* Cell 1 (Index 0) */}
              <VStack spacing={1} alignment="center" modifiers={[padding({ horizontal: 8, bottom: denseMedium ? 4 : 8 })]}>
                <Text modifiers={[font({ size: small ? 10 : 12, weight: 'heavy' }), ...fg(accent), lineLimit(1)]}>{cls[0].startTime}</Text>
                <Text modifiers={[font({ size: small ? 11 : 13, weight: 'bold' }), ...fg(title), lineLimit(1)]}>{cls[0].label}</Text>
                {!denseMedium ? <Text modifiers={[font({ size: small ? 8 : 9 }), ...fg(muted), lineLimit(1)]}>{cls[0].location || '—'}</Text> : null}
              </VStack>

              <Divider modifiers={[...fg(line), opacity(0.18)]} />

              {/* Cell 3 (Index 2) */}
              <VStack spacing={1} alignment="center" modifiers={[padding({ horizontal: 8, vertical: denseMedium ? 4 : 8 })]}>
                {cls[2] ? (
                  <>
                    <Text modifiers={[font({ size: small ? 10 : 12, weight: 'heavy' }), ...fg(accent), lineLimit(1)]}>{cls[2].startTime}</Text>
                    <Text modifiers={[font({ size: small ? 11 : 13, weight: 'bold' }), ...fg(title), lineLimit(1)]}>{cls[2].label}</Text>
                    {!denseMedium ? <Text modifiers={[font({ size: small ? 8 : 9 }), ...fg(muted), lineLimit(1)]}>{cls[2].location || '—'}</Text> : null}
                  </>
                ) : <Spacer />}
              </VStack>

              {cls.length > 4 ? (
                <>
                  <Divider modifiers={[...fg(line), opacity(0.18)]} />
                  {/* Cell 5 (Index 4) */}
                  <VStack spacing={1} alignment="center" modifiers={[padding({ horizontal: 8, top: 8 })]}>
                    <Text modifiers={[font({ size: small ? 10 : 12, weight: 'heavy' }), ...fg(accent), lineLimit(1)]}>{cls[4].startTime}</Text>
                    <Text modifiers={[font({ size: small ? 11 : 13, weight: 'bold' }), ...fg(title), lineLimit(1)]}>{cls[4].label}</Text>
                    <Text modifiers={[font({ size: small ? 8 : 9 }), ...fg(muted), lineLimit(1)]}>{cls[4].location || '—'}</Text>
                  </VStack>
                </>
              ) : null}
            </VStack>

            {/* Continuous Vertical Divider */}
            <VStack modifiers={[frame({ width: 1 }), ...(isFullColor ? [background(line)] : []), opacity(0.22), padding({ vertical: 2 })]}>
              <Spacer />
            </VStack>

            {/* Right Column */}
            <VStack
              spacing={0}
              alignment="center"
              modifiers={[containerRelativeFrame({ axes: 'horizontal', count: 2, span: 1, spacing: 0, alignment: 'center' })]}
            >
              {/* Cell 2 (Index 1) */}
              <VStack spacing={1} alignment="center" modifiers={[padding({ horizontal: 8, bottom: denseMedium ? 4 : 8 })]}>
                {cls[1] ? (
                  <>
                    <Text modifiers={[font({ size: small ? 10 : 12, weight: 'heavy' }), ...fg(accent), lineLimit(1)]}>{cls[1].startTime}</Text>
                    <Text modifiers={[font({ size: small ? 11 : 13, weight: 'bold' }), ...fg(title), lineLimit(1)]}>{cls[1].label}</Text>
                    {!denseMedium ? <Text modifiers={[font({ size: small ? 8 : 9 }), ...fg(muted), lineLimit(1)]}>{cls[1].location || '—'}</Text> : null}
                  </>
                ) : <Spacer />}
              </VStack>

              <Divider modifiers={[...fg(line), opacity(0.18)]} />

              {/* Cell 4 (Index 3) */}
              <VStack spacing={1} alignment="center" modifiers={[padding({ horizontal: 8, vertical: denseMedium ? 4 : 8 })]}>
                {cls[3] ? (
                  <>
                    <Text modifiers={[font({ size: small ? 10 : 12, weight: 'heavy' }), ...fg(accent), lineLimit(1)]}>{cls[3].startTime}</Text>
                    <Text modifiers={[font({ size: small ? 11 : 13, weight: 'bold' }), ...fg(title), lineLimit(1)]}>{cls[3].label}</Text>
                    {!denseMedium ? <Text modifiers={[font({ size: small ? 8 : 9 }), ...fg(muted), lineLimit(1)]}>{cls[3].location || '—'}</Text> : null}
                  </>
                ) : <Spacer />}
              </VStack>

              {cls.length > 4 ? (
                <>
                  <Divider modifiers={[...fg(line), opacity(0.18)]} />
                  {/* Cell 6 (Index 5) */}
                  <VStack spacing={1} alignment="center" modifiers={[padding({ horizontal: 8, top: 8 })]}>
                    {cls[5] ? (
                      <>
                        <Text modifiers={[font({ size: small ? 10 : 12, weight: 'heavy' }), ...fg(accent), lineLimit(1)]}>{cls[5].startTime}</Text>
                        <Text modifiers={[font({ size: small ? 11 : 13, weight: 'bold' }), ...fg(title), lineLimit(1)]}>{cls[5].label}</Text>
                        <Text modifiers={[font({ size: small ? 8 : 9 }), ...fg(muted), lineLimit(1)]}>{cls[5].location || '—'}</Text>
                      </>
                    ) : <Spacer />}
                  </VStack>
                </>
              ) : null}
            </VStack>
          </HStack>
        ) : (
          <VStack spacing={0} alignment="leading">
            {cls.map((c, i) => (
              <VStack key={`${c.startTime}-${c.label}-${i}`} spacing={0} alignment="leading">
                {i > 0 ? <Divider modifiers={[padding({ vertical: small ? 4 : 6 }), ...fg(line), opacity(0.18)]} /> : null}
                <HStack spacing={small ? 6 : 10} alignment="top" modifiers={[padding({ vertical: small ? 0 : 3 })]}>
                  <VStack spacing={0} alignment="leading" modifiers={small ? [] : [frame({ width: 46 })]}>
                    <Text modifiers={[font({ size: small ? 10 : 13, weight: 'heavy' }), ...fg(accent), lineLimit(1)]}>
                      {c.startTime}
                    </Text>
                    {!small ? (
                      <Text modifiers={[font({ size: 9, weight: 'semibold' }), ...fg(muted), lineLimit(1)]}>
                        {c.endTime}
                      </Text>
                    ) : null}
                  </VStack>
                  <VStack spacing={1} alignment="leading">
                    <Text modifiers={[font({ size: small ? 11 : 14, weight: 'bold' }), ...fg(title), lineLimit(1)]}>
                      {c.label}
                    </Text>
                    <Text modifiers={[font({ size: small ? 8 : 9 }), ...fg(muted), lineLimit(1)]}>
                      {c.location || '—'}
                    </Text>
                  </VStack>
                  <Spacer />
                </HStack>
              </VStack>
            ))}
          </VStack>
        )}

        <Spacer />
      </VStack>
    </ZStack>
  );
}

export default createWidget<HomeWidgetProps>('GradeUpTimetable', GradeUpTimetableWidgetView);

import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps } from '../src/lib/homeWidgetProps';

const FORCE_STATIC_WIDGET = true;

function secondaryColor(scheme: 'light' | 'dark' | undefined): string {
  return scheme === 'dark' ? '#a3a3a3' : '#525252';
}

function normalizeProps(input: HomeWidgetProps | null | undefined): HomeWidgetProps {
  const fallback: HomeWidgetProps = {
    dateISO: '',
    greeting: 'Rencana',
    signedIn: false,
    tasks: [],
    classes: [],
  };
  if (!input) return fallback;
  return {
    dateISO: typeof input.dateISO === 'string' ? input.dateISO : '',
    greeting: typeof input.greeting === 'string' && input.greeting.trim() ? input.greeting : 'Rencana',
    signedIn: Boolean(input.signedIn),
    tasks: Array.isArray(input.tasks) ? input.tasks : [],
    classes: Array.isArray(input.classes) ? input.classes : [],
  };
}

function GradeUpTimetableWidgetView(props: HomeWidgetProps | null | undefined, env: WidgetEnvironment) {
  'widget';
  const p = normalizeProps(props);

  const scheme = env.colorScheme;
  const family = env.widgetFamily;
  const small = family === 'systemSmall';
  const titleColor = scheme === 'dark' ? '#fafafa' : '#0a0a0a';
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const devDebugLabel = isDev
    ? `DBG ${(p.dateISO || '--').slice(5)} T${p.tasks.length} C${p.classes.length}`
    : '';

  if (FORCE_STATIC_WIDGET) {
    return (
      <VStack modifiers={[padding({ all: 10 })]} spacing={4}>
        <Text modifiers={[font({ weight: 'bold', size: small ? 15 : 17 }), foregroundStyle(titleColor)]}>Rencana OK</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(secondaryColor(scheme)), lineLimit(2)]}>
          Static widget test
        </Text>
      </VStack>
    );
  }

  // Lock screen families: keep it short.
  const isLock =
    family === 'accessoryInline' ||
    family === 'accessoryCircular' ||
    family === 'accessoryRectangular';

  if (!p.signedIn) {
    return (
      <VStack modifiers={[padding({ all: 10 })]} spacing={6}>
        <Text modifiers={[font({ weight: 'bold', size: small ? 15 : 17 }), foregroundStyle(titleColor)]}>Rencana</Text>
        <Text modifiers={[font({ size: small ? 11 : 13 }), foregroundStyle(secondaryColor(scheme)), lineLimit(3)]}>
          Open the app and sign in to see your classes.
        </Text>
      </VStack>
    );
  }

  const classes = isLock ? p.classes.slice(0, 1) : small ? p.classes.slice(0, 4) : p.classes.slice(0, 6);

  if (family === 'accessoryInline') {
    const c = classes[0];
    return (
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(titleColor), lineLimit(1)]}>
        {devDebugLabel ? `${devDebugLabel} · ` : ''}
        {c ? `Class: ${c.startTime} ${c.label}` : 'No classes today'}
      </Text>
    );
  }

  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={2}>
        <Text modifiers={[font({ size: 16, weight: 'bold' }), foregroundStyle(titleColor), lineLimit(1)]}>
          {String(p.classes.length || 0)}
        </Text>
        <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(secondaryColor(scheme)), lineLimit(1)]}>
          classes
        </Text>
      </VStack>
    );
  }

  if (family === 'accessoryRectangular') {
    const c = classes[0];
    return (
      <VStack spacing={2}>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondaryColor(scheme)), lineLimit(1)]}>
          Upcoming class
        </Text>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(titleColor), lineLimit(2)]}>
          {c ? `${c.startTime}–${c.endTime} ${c.label}` : 'No classes today'}
        </Text>
        {c?.location ? (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(secondaryColor(scheme)), lineLimit(1)]}>
            {c.location}
          </Text>
        ) : null}
      </VStack>
    );
  }

  return (
    <VStack modifiers={[padding({ all: small ? 8 : 10 })]} spacing={small ? 4 : 6}>
      <Text modifiers={[font({ weight: 'semibold', size: small ? 14 : 16 }), foregroundStyle(titleColor), lineLimit(1)]}>
        Timetable
      </Text>
      {devDebugLabel ? (
        <Text modifiers={[font({ size: 10 }), foregroundStyle(secondaryColor(scheme)), lineLimit(1)]}>
          {devDebugLabel}
        </Text>
      ) : null}
      {classes.length === 0 ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(secondaryColor(scheme)), lineLimit(3)]}>
          Nothing scheduled for today.
        </Text>
      ) : (
        <VStack spacing={3}>
          {classes.map((c, i) => (
            <Text
              key={`${c.startTime}-${c.label}-${i}`}
              modifiers={[font({ size: small ? 11 : 12 }), foregroundStyle(titleColor), lineLimit(2)]}>
              {c.startTime}–{c.endTime} {c.label}
              {!small && c.location ? ` · ${c.location}` : ''}
            </Text>
          ))}
        </VStack>
      )}
    </VStack>
  );
}

export default createWidget('GradeUpTimetable', GradeUpTimetableWidgetView);


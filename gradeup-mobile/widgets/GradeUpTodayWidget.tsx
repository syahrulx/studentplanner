import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { HomeWidgetProps, HomeWidgetTaskRow } from '../src/lib/homeWidgetProps';

function accentColor(accent: HomeWidgetTaskRow['accent'], scheme: 'light' | 'dark' | undefined): string {
  if (accent === 'overdue') return '#dc2626';
  if (accent === 'today') return '#2563eb';
  return scheme === 'dark' ? '#e5e5e5' : '#171717';
}

function secondaryColor(scheme: 'light' | 'dark' | undefined): string {
  return scheme === 'dark' ? '#a3a3a3' : '#525252';
}

function GradeUpTodayWidgetView(props: HomeWidgetProps, env: WidgetEnvironment) {
  'widget';

  const scheme = env.colorScheme;
  const small = env.widgetFamily === 'systemSmall';
  const titleColor = scheme === 'dark' ? '#fafafa' : '#0a0a0a';

  if (!props.signedIn) {
    return (
      <VStack modifiers={[padding({ all: 10 })]} spacing={6}>
        <Text modifiers={[font({ weight: 'bold', size: small ? 15 : 17 }), foregroundStyle(titleColor)]}>Rencana</Text>
        <Text modifiers={[font({ size: small ? 11 : 13 }), foregroundStyle(secondaryColor(scheme)), lineLimit(3)]}>
          Open the app and sign in to see today’s tasks and classes.
        </Text>
      </VStack>
    );
  }

  const taskRows = small ? props.tasks.slice(0, 2) : props.tasks.slice(0, 5);
  const classRows = small ? props.classes.slice(0, 2) : props.classes.slice(0, 5);

  return (
    <VStack modifiers={[padding({ all: small ? 8 : 10 })]} spacing={small ? 4 : 6}>
      <Text modifiers={[font({ weight: 'semibold', size: small ? 14 : 16 }), foregroundStyle(titleColor), lineLimit(1)]}>
        {props.greeting}
      </Text>

      {taskRows.length > 0 && (
        <VStack spacing={3}>
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondaryColor(scheme))]}>Tasks</Text>
          {taskRows.map((t) => (
            <VStack key={t.id} spacing={1}>
              <Text
                modifiers={[
                  font({ size: small ? 12 : 13, weight: 'medium' }),
                  foregroundStyle(accentColor(t.accent, scheme)),
                  lineLimit(1),
                ]}>
                {t.title}
              </Text>
              {!small && (
                <Text modifiers={[font({ size: 11 }), foregroundStyle(secondaryColor(scheme)), lineLimit(1)]}>
                  {t.subtitle}
                </Text>
              )}
            </VStack>
          ))}
        </VStack>
      )}

      {classRows.length > 0 && (
        <VStack spacing={3}>
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondaryColor(scheme))]}>
            Classes
          </Text>
          {classRows.map((c, i) => (
            <Text
              key={`${c.startTime}-${c.label}-${i}`}
              modifiers={[font({ size: small ? 11 : 12 }), foregroundStyle(titleColor), lineLimit(2)]}>
              {c.startTime}–{c.endTime} {c.label}
              {!small && c.location ? ` · ${c.location}` : ''}
            </Text>
          ))}
        </VStack>
      )}

      {taskRows.length === 0 && classRows.length === 0 && (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(secondaryColor(scheme)), lineLimit(3)]}>
          Nothing scheduled for today. Enjoy the break.
        </Text>
      )}
    </VStack>
  );
}

export default createWidget('GradeUpToday', GradeUpTodayWidgetView);

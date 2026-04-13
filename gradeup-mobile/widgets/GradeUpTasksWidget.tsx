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

function GradeUpTasksWidgetView(props: HomeWidgetProps, env: WidgetEnvironment) {
  'widget';

  const scheme = env.colorScheme;
  const family = env.widgetFamily;
  const small = family === 'systemSmall';
  const titleColor = scheme === 'dark' ? '#fafafa' : '#0a0a0a';

  // Lock screen families: keep it short.
  const isLock =
    family === 'accessoryInline' ||
    family === 'accessoryCircular' ||
    family === 'accessoryRectangular';

  if (!props.signedIn) {
    return (
      <VStack modifiers={[padding({ all: 10 })]} spacing={6}>
        <Text modifiers={[font({ weight: 'bold', size: small ? 15 : 17 }), foregroundStyle(titleColor)]}>Rencana</Text>
        <Text modifiers={[font({ size: small ? 11 : 13 }), foregroundStyle(secondaryColor(scheme)), lineLimit(3)]}>
          Open the app and sign in to see your tasks.
        </Text>
      </VStack>
    );
  }

  const tasks = isLock ? props.tasks.slice(0, 1) : small ? props.tasks.slice(0, 4) : props.tasks.slice(0, 6);

  if (family === 'accessoryInline') {
    const t = tasks[0];
    return (
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(titleColor), lineLimit(1)]}>
        {t ? `Task: ${t.title}` : 'No tasks today'}
      </Text>
    );
  }

  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={2}>
        <Text modifiers={[font({ size: 16, weight: 'bold' }), foregroundStyle(titleColor), lineLimit(1)]}>
          {String(props.tasks.length || 0)}
        </Text>
        <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(secondaryColor(scheme)), lineLimit(1)]}>
          tasks
        </Text>
      </VStack>
    );
  }

  if (family === 'accessoryRectangular') {
    const t = tasks[0];
    return (
      <VStack spacing={2}>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondaryColor(scheme)), lineLimit(1)]}>
          Upcoming task
        </Text>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(accentColor(t?.accent ?? 'default', scheme)), lineLimit(2)]}>
          {t ? t.title : 'No tasks today'}
        </Text>
        {t?.subtitle ? (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(secondaryColor(scheme)), lineLimit(1)]}>
            {t.subtitle}
          </Text>
        ) : null}
      </VStack>
    );
  }

  return (
    <VStack modifiers={[padding({ all: small ? 8 : 10 })]} spacing={small ? 4 : 6}>
      <Text modifiers={[font({ weight: 'semibold', size: small ? 14 : 16 }), foregroundStyle(titleColor), lineLimit(1)]}>
        Tasks
      </Text>
      {tasks.length === 0 ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(secondaryColor(scheme)), lineLimit(3)]}>
          Nothing due today.
        </Text>
      ) : (
        <VStack spacing={3}>
          {tasks.map((t) => (
            <VStack key={t.id} spacing={1}>
              <Text
                modifiers={[
                  font({ size: small ? 12 : 13, weight: 'medium' }),
                  foregroundStyle(accentColor(t.accent, scheme)),
                  lineLimit(1),
                ]}>
                {t.title}
              </Text>
              {!small ? (
                <Text modifiers={[font({ size: 11 }), foregroundStyle(secondaryColor(scheme)), lineLimit(1)]}>
                  {t.subtitle}
                </Text>
              ) : null}
            </VStack>
          ))}
        </VStack>
      )}
    </VStack>
  );
}

export default createWidget('GradeUpTasks', GradeUpTasksWidgetView);


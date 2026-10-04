import DateTimePicker from '@react-native-community/datetimepicker';
import React from 'react';

import { themeIsDark } from '@/constants/Themes';
import { useTheme } from '@/hooks/useTheme';

/**
 * The native date picker, told which way round the app's theme is.
 *
 * iOS renders this control in the *phone's* appearance unless it is told
 * otherwise, while the sheet around it uses the app's theme. A student with a
 * dark phone and a light theme in Rencana therefore got white text on a white
 * card: the wheel was there, it turned, it clicked, and nothing could be read.
 * That is how it was reported — "no visible date even if dragged up or down,
 * but it does make sound as if it's functional".
 *
 * Both hints are set because they cover different cases: themeVariant steers
 * the inline and compact displays, textColor the spinner. Props spread last,
 * so a caller can still override either.
 */
export default function ThemedDateTimePicker(
  props: React.ComponentProps<typeof DateTimePicker>,
) {
  const theme = useTheme();
  return (
    <DateTimePicker
      themeVariant={themeIsDark(theme) ? 'dark' : 'light'}
      textColor={theme.text}
      {...props}
    />
  );
}

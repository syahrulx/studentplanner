import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '@/hooks/useResponsive';

type ScreenContainerProps = {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'style' | 'contentContainerStyle'>;
  /** Override default max content width from useResponsive */
  maxWidth?: number;
  /** Include top safe area inset (default true) */
  safeTop?: boolean;
  /** Include bottom safe area inset (default false — tab bar handles bottom) */
  safeBottom?: boolean;
  /** When true, content stretches full width (e.g. maps) */
  fullWidth?: boolean;
};

export function ScreenContainer({
  children,
  scroll = false,
  style,
  contentStyle,
  scrollProps,
  maxWidth,
  safeTop = true,
  safeBottom = false,
  fullWidth = false,
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  const { contentMaxWidth, gutter } = useResponsive();

  const resolvedMaxWidth = fullWidth ? undefined : (maxWidth ?? contentMaxWidth);

  const containerStyle: ViewStyle = {
    flex: 1,
    width: '100%',
    maxWidth: resolvedMaxWidth,
    alignSelf: resolvedMaxWidth ? 'center' : undefined,
    paddingHorizontal: fullWidth ? 0 : gutter,
    paddingTop: safeTop ? insets.top : 0,
    paddingBottom: safeBottom ? insets.bottom : 0,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.flex, style]}
        contentContainerStyle={[containerStyle, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...scrollProps}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.flex, containerStyle, style, contentStyle]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

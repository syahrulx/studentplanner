import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SymbolView } from 'expo-symbols';
import { useTheme } from '@/hooks/useTheme';
import { THEME_ICON_MAP, type ThemeIconKey } from '@/constants/ThemeIcons';
import { SF_SYMBOL_NAMES } from '@/constants/SFSymbols';
import type { ThemeId } from '@/constants/Themes';

type ThemeIconProps = {
  name: ThemeIconKey;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** When set, use this theme's icon instead of current theme (e.g. for dropdown previews). */
  themeId?: ThemeId;
};

function FallbackIcon({
  def,
  size,
  iconColor,
  style,
}: {
  def: { family: 'Feather' | 'FontAwesome'; name: string };
  size: number;
  iconColor: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (def.family === 'FontAwesome') {
    return (
      <FontAwesome
        name={def.name as React.ComponentProps<typeof FontAwesome>['name']}
        size={size}
        color={iconColor}
        style={style as any}
      />
    );
  }
  return (
    <Feather
      name={def.name as React.ComponentProps<typeof Feather>['name']}
      size={size}
      color={iconColor}
      style={style as any}
    />
  );
}

export function ThemeIcon({ name, size = 24, color, style, themeId: overrideThemeId }: ThemeIconProps) {
  const theme = useTheme();
  const resolvedThemeId = overrideThemeId ?? theme.id;
  const def =
    (THEME_ICON_MAP as any)?.[resolvedThemeId]?.[name] ??
    (THEME_ICON_MAP as any)?.[theme.id]?.[name] ??
    { family: 'Feather', name: 'help-circle' as const };
  const iconColor = color ?? theme.text;
  const sfName = SF_SYMBOL_NAMES[name];
  const fallback = <FallbackIcon def={def} size={size} iconColor={iconColor} style={style} />;

  return (
    <SymbolView
      name={sfName as any}
      tintColor={iconColor}
      size={size}
      style={[{ width: size, height: size }, style]}
      fallback={fallback}
    />
  );
}

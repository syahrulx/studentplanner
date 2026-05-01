import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Ionicons from '@expo/vector-icons/Ionicons';
import Octicons from '@expo/vector-icons/Octicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AntDesign from '@expo/vector-icons/AntDesign';
import { SymbolView } from 'expo-symbols';
import { useTheme, useThemePack } from '@/hooks/useTheme';
import {
  resolveIconDef,
  type IconDef,
  type IconFamily,
  type ThemeIconKey,
} from '@/constants/ThemeIcons';
import { SF_SYMBOL_NAMES } from '@/constants/SFSymbols';
import type { ThemeId } from '@/constants/Themes';
import type { ThemePackId } from '@/src/storage';

type ThemeIconProps = {
  name: ThemeIconKey;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** When set, pretend this theme is active (e.g. for picker previews). */
  themeId?: ThemeId;
  /** When set, pretend this pack is active (e.g. for pack previews in the picker). */
  themePack?: ThemePackId;
};

function FallbackIcon({
  def,
  size,
  iconColor,
  style,
}: {
  def: IconDef;
  size: number;
  iconColor: string;
  style?: StyleProp<ViewStyle>;
}) {
  const common = { size, color: iconColor, style: style as any };
  switch (def.family as IconFamily) {
    case 'FontAwesome':
      return <FontAwesome name={def.name as React.ComponentProps<typeof FontAwesome>['name']} {...common} />;
    case 'Ionicons':
      return <Ionicons name={def.name as React.ComponentProps<typeof Ionicons>['name']} {...common} />;
    case 'Octicons':
      return <Octicons name={def.name as React.ComponentProps<typeof Octicons>['name']} {...common} />;
    case 'MaterialCommunityIcons':
      return (
        <MaterialCommunityIcons
          name={def.name as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
          {...common}
        />
      );
    case 'AntDesign':
      return <AntDesign name={def.name as React.ComponentProps<typeof AntDesign>['name']} {...common} />;
    case 'Feather':
    default:
      return <Feather name={def.name as React.ComponentProps<typeof Feather>['name']} {...common} />;
  }
}

export function ThemeIcon({
  name,
  size = 24,
  color,
  style,
  themePack: overridePack,
}: ThemeIconProps) {
  const theme = useTheme();
  const activePack = useThemePack();
  const pack = overridePack ?? activePack;

  const def = resolveIconDef(name, pack);
  const iconColor = color ?? theme.text;
  const fallback = <FallbackIcon def={def} size={size} iconColor={iconColor} style={style} />;

  // SF Symbols only apply to the default look (free themes). Pack icons must
  // render through their dedicated vector family on every platform so the
  // pack-specific aesthetic stays distinct on iOS as well as Android.
  if (pack && pack !== 'none') {
    return fallback;
  }

  const sfName = SF_SYMBOL_NAMES[name];
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

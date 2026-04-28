import { useApp } from '@/src/context/AppContext';
import { THEMES, type ThemePalette, type ThemeId } from '@/constants/Themes';

const CAT_THEME_OVERRIDE: ThemePalette = {
  id: 'blush',
  name: 'Cat Theme',
  background: '#fff8f1',
  backgroundSecondary: '#fdf0e2',
  card: '#fffdf9',
  cardBorder: '#edd9c3',
  primary: '#b26f45',
  secondary: '#c8895a',
  accent: '#e4a06c',
  accent2: '#9e5f38',
  accent3: '#f8e2c9',
  text: '#4b2f1d',
  textSecondary: '#9a6f52',
  textInverse: '#fffaf4',
  border: '#ecd6bf',
  tabIconDefault: '#bb926f',
  tabIconSelected: '#b26f45',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  focusCard: '#fdebd9',
  focusCardText: '#674127',
  shortcutColors: ['#b26f45', '#e4a06c', '#c8895a'],
};

const MONO_THEME_OVERRIDE: ThemePalette = {
  id: 'dark',
  name: 'Mono Theme',
  background: '#000000',
  backgroundSecondary: '#050505',
  card: '#0a0a0a',
  cardBorder: '#1a1a1a',
  primary: '#ffffff',
  secondary: '#ffffff',
  accent: '#ffffff',
  accent2: '#ffffff',
  accent3: '#111111',
  text: '#ffffff',
  textSecondary: '#b3b3b3',
  textInverse: '#000000',
  border: '#1f1f1f',
  tabIconDefault: '#ffffff',
  tabIconSelected: '#ffffff',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  focusCard: '#0d0d0d',
  focusCardText: '#f5f5f5',
  shortcutColors: ['#ffffff', '#ffffff', '#ffffff'],
};

export function useTheme(): ThemePalette {
  const { theme, themePack } = useApp();
  if (themePack === 'cat') return CAT_THEME_OVERRIDE;
  if (themePack === 'mono') return MONO_THEME_OVERRIDE;
  return THEMES[theme];
}

export function useThemeId(): ThemeId {
  const { theme } = useApp();
  return theme;
}

export function useThemePack() {
  const { themePack } = useApp();
  return themePack;
}

export function useSetTheme(): (theme: ThemeId) => void {
  const { setTheme } = useApp();
  return setTheme;
}

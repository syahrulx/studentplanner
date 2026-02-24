import { useApp } from '@/src/context/AppContext';
import { THEMES, type ThemePalette, type ThemeId } from '@/constants/Themes';

export function useTheme(): ThemePalette {
  const { theme } = useApp();
  return THEMES[theme];
}

export function useThemeId(): ThemeId {
  const { theme } = useApp();
  return theme;
}

export function useSetTheme(): (theme: ThemeId) => void {
  const { setTheme } = useApp();
  return setTheme;
}

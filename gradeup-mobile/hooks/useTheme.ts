import { useApp } from '@/src/context/AppContext';
import { THEMES, type ThemePalette, type ThemeId, CAT_THEME_OVERRIDE, MONO_THEME_OVERRIDE, PURPLE_THEME_OVERRIDE, resolveSpiderTheme } from '@/constants/Themes';


export function useTheme(): ThemePalette {
  const { theme, themePack, spiderBlueAccents } = useApp();
  if (themePack === 'cat') return CAT_THEME_OVERRIDE;
  if (themePack === 'mono') return MONO_THEME_OVERRIDE;
  if (themePack === 'spider') return resolveSpiderTheme(spiderBlueAccents);
  if (themePack === 'purple') return PURPLE_THEME_OVERRIDE;
  return THEMES[theme];
}

/** Mono + Spider: neutral subject colors, planner greyscale, shared “dark minimal” UI rules. */
export function useDarkMinimalThemePack(): boolean {
  const { themePack } = useApp();
  return themePack === 'mono' || themePack === 'spider';
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

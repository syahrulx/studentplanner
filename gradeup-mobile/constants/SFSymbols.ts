/**
 * SF Symbol names (Apple) for each icon key.
 * Used on iOS when expo-symbols is available; fallback to Feather/FontAwesome on other platforms.
 * @see https://developer.apple.com/sf-symbols/
 */

import type { ThemeIconKey } from './ThemeIcons';

export const SF_SYMBOL_NAMES: Record<ThemeIconKey, string> = {
  home: 'house.fill',
  tasks: 'checkmark.circle.fill',
  notes: 'book.closed.fill',
  profile: 'person.fill',
  add: 'plus.circle.fill',
  calendar: 'calendar',
  checkCircle: 'checkmark.circle.fill',
  sparkles: 'bolt.fill',
  user: 'person.fill',
  layers: 'square.stack.3d.up.fill',
  target: 'target',
  award: 'trophy.fill',
  star: 'star.fill',
  clock: 'clock.fill',
  pieChart: 'chart.pie.fill',
  settings: 'gearshape.fill',
  arrowRight: 'chevron.right',
  bookOpen: 'book.fill',
  helpCircle: 'questionmark.circle.fill',
  stressMap: 'square.stack.3d.up.fill',
  weeklySummary: 'calendar',
  leaderboard: 'trophy.fill',
  themeDark: 'moon.fill',
  themeLight: 'sun.max.fill',
  themeMinimal: 'circle.fill',
  themeModern: 'bolt.fill',
  themeRetro: 'film.fill',
};

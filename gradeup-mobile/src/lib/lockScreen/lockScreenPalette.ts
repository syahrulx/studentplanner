import type { ThemePalette } from '@/constants/Themes';
import { contrastText, withAlpha } from '@/src/lib/contrast';

import type { LockGradientId, LockPanelStyle } from './types';

/**
 * Colours for the lock screen picture: the gradient backgrounds and the ink
 * (panel glass, text, accent) the templates draw with.
 *
 * Everything drawn on the canvas is a translucent fill rather than a blur,
 * because the picture is captured offscreen, where a BlurView has nothing
 * behind it to blur.
 */

export type LockGradientColors = [string, string, string, string];

export interface LockGradient {
  /** Display name. Kept in English in both languages, like Apple's own wallpaper names. */
  name: string;
  /** c1 → c2 is the base diagonal, c3 glows from the top left, c4 from the bottom right. */
  c: LockGradientColors;
}

export const LOCK_GRADIENTS: Readonly<Record<LockGradientId, LockGradient>> = {
  dusk: { name: 'Dusk', c: ['#1E1B4B', '#7C3AED', '#F472B6', '#FB923C'] },
  lagoon: { name: 'Lagoon', c: ['#042F2E', '#0E7490', '#22D3EE', '#A7F3D0'] },
  matcha: { name: 'Matcha', c: ['#14231A', '#3F6212', '#A3E635', '#FEF9C3'] },
  peach: { name: 'Peach', c: ['#7C2D12', '#FB7185', '#FDBA74', '#FFF1F2'] },
  midnight: { name: 'Midnight', c: ['#020617', '#1E3A8A', '#312E81', '#0EA5E9'] },
  aurora: { name: 'Aurora', c: ['#0B1026', '#10B981', '#6366F1', '#22D3EE'] },
  graphite: { name: 'Graphite', c: ['#0A0A0A', '#262626', '#404040', '#737373'] },
  sakura: { name: 'Sakura', c: ['#FDF2F8', '#F9A8D4', '#C4B5FD', '#FFFFFF'] },
};

/** Order of the swatches in the Background tab. */
export const LOCK_GRADIENT_ORDER: readonly LockGradientId[] = [
  'dusk',
  'lagoon',
  'matcha',
  'peach',
  'midnight',
  'aurora',
  'graphite',
  'sakura',
];

/** Photo dim overlay (black) per LockDim level. */
export const PHOTO_DIM_ALPHA = [0.1, 0.22, 0.36] as const;
/** Black wash over every gradient, so the white lock screen clock keeps its edge. */
export const GRADIENT_DIM_ALPHA = 0.06;

export interface LockGradientLayer {
  colors: readonly [string, string];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * The three stacked LinearGradients that make one background: the base
 * diagonal, then the c3 and c4 glows. Shared by the canvas, the Studio's
 * ambient backdrop and the swatches, so all three look the same.
 */
export function lockGradientLayers(
  c: Readonly<LockGradientColors>,
): readonly [LockGradientLayer, LockGradientLayer, LockGradientLayer] {
  return [
    { colors: [c[0], c[1]], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    {
      colors: [withAlpha(c[2], 'D9'), withAlpha(c[2], '00')],
      start: { x: 0, y: 0 },
      end: { x: 0.6, y: 0.6 },
    },
    {
      colors: [withAlpha(c[3], '00'), withAlpha(c[3], 'B3')],
      start: { x: 0.4, y: 0.4 },
      end: { x: 1, y: 1 },
    },
  ];
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * '#RRGGBB' for any hex form (#rgb, #rgba, #rrggbb, #rrggbbaa), else null.
 * Custom theme colours come from a picker, and withAlpha only works by
 * appending to six digits.
 */
function toHex6(color: string): string | null {
  const m = HEX.exec((color || '').trim());
  if (!m) return null;
  const digits = m[1];
  const rgb =
    digits.length <= 4
      ? digits
          .slice(0, 3)
          .split('')
          .map((d) => d + d)
          .join('')
      : digits.slice(0, 6);
  return `#${rgb.toUpperCase()}`;
}

/** WCAG relative luminance of a '#RRGGBB' colour, 0 (black) to 1 (white). */
function relativeLuminance(hex6: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex6.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Above this, a colour reads as white: invisible under the clock, washed out on light glass. */
const NEAR_WHITE = 0.8;

export function themeGradient(theme: ThemePalette): LockGradientColors {
  const dusk = LOCK_GRADIENTS.dusk.c;
  const pick = (color: string, i: number) => toHex6(color) ?? dusk[i];
  const c: LockGradientColors = [
    pick(theme.primary, 0),
    pick(theme.accent, 1),
    pick(theme.accent2, 2),
    pick(theme.background, 3),
  ];
  // Mono (and white-primary custom themes) would give an all-white picture
  // with the white clock on top of it. Build it from the dark surfaces
  // instead, keeping the white as the corner glow.
  if (relativeLuminance(c[0]) > NEAR_WHITE && relativeLuminance(c[1]) > NEAR_WHITE) {
    return [pick(theme.background, 0), pick(theme.card, 1), pick(theme.accent3, 2), c[0]];
  }
  return c;
}

export interface LockInk {
  panelFill: string;
  panelBorder: string;
  panelTopBorder: string;
  text1: string;
  text2: string;
  text3: string;
  divider: string;
  todayTint: string;
  neutralChip: string;
  accent: string;
  onAccent: string;
  /** Overdue pill and dot. */
  overdue: string;
  onOverdue: string;
  shadowOpacity: number;
}

type GlassInk = Omit<LockInk, 'accent' | 'onAccent' | 'overdue' | 'onOverdue'>;

const DARK_GLASS: GlassInk = {
  panelFill: 'rgba(14,16,20,0.58)',
  panelBorder: 'rgba(255,255,255,0.10)',
  panelTopBorder: 'rgba(255,255,255,0.16)',
  text1: 'rgba(255,255,255,0.96)',
  text2: 'rgba(255,255,255,0.68)',
  text3: 'rgba(255,255,255,0.46)',
  divider: 'rgba(255,255,255,0.12)',
  todayTint: 'rgba(255,255,255,0.12)',
  neutralChip: 'rgba(255,255,255,0.16)',
  shadowOpacity: 0.28,
};

const LIGHT_GLASS: GlassInk = {
  panelFill: 'rgba(255,255,255,0.80)',
  panelBorder: 'rgba(0,0,0,0.06)',
  panelTopBorder: 'rgba(255,255,255,0.9)',
  text1: 'rgba(11,12,14,0.94)',
  text2: 'rgba(11,12,14,0.62)',
  text3: 'rgba(11,12,14,0.42)',
  divider: 'rgba(0,0,0,0.08)',
  todayTint: 'rgba(0,0,0,0.06)',
  neutralChip: 'rgba(0,0,0,0.08)',
  shadowOpacity: 0.12,
};

/** Near-black used for the accent on light glass when the theme's own would wash out. */
const INK_ON_LIGHT = '#0B0C0E';

/**
 * @param darkMinimalPack Mono or Spider: their UI accent is white, so the
 *   picture follows it (white on dark glass, near-black on light glass) rather
 *   than Spider's red primary.
 */
export function resolveLockInk(
  panel: LockPanelStyle,
  theme: ThemePalette,
  darkMinimalPack: boolean,
): LockInk {
  const light = panel === 'light';
  let accent: string;
  if (darkMinimalPack) {
    accent = light ? INK_ON_LIGHT : '#FFFFFF';
  } else {
    const primary = toHex6(theme.primary);
    accent = primary ?? LOCK_GRADIENTS.dusk.c[1];
    if (light && primary && relativeLuminance(primary) > NEAR_WHITE) accent = INK_ON_LIGHT;
  }
  return {
    ...(light ? LIGHT_GLASS : DARK_GLASS),
    accent,
    onAccent: contrastText(accent),
    overdue: 'rgba(255,69,58,0.92)',
    onOverdue: '#FFFFFF',
  };
}

/** The lighter of the Studio's and the setup sheet's backgrounds, so the stricter test. */
const CHROME_BG = '#0E0F12';
/** WCAG AA for text below 18 pt. */
const MIN_TEXT_CONTRAST = 4.5;
const LIFT_STEPS = 20;

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `hex6` moved `t` (0..1) of the way to white. */
function towardWhite(hex6: string, t: number): string {
  const channel = (i: number) => {
    const v = parseInt(hex6.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * t)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}

/**
 * The accent as text, a link or a track on the always-dark Studio and setup
 * sheet. Theme primaries are chosen for light surfaces, so many (the default
 * blue, Emerald, Blush, any navy custom theme) fall under 4.5:1 on near-black;
 * those are lifted toward white just far enough to read. Filled buttons keep
 * the raw accent, since contrastText already keeps their label readable, and
 * so does the picture itself.
 */
export function lockChromeAccent(accent: string): string {
  const hex = toHex6(accent);
  if (!hex) return accent;
  for (let i = 0; i <= LIFT_STEPS; i++) {
    const lifted = towardWhite(hex, i / LIFT_STEPS);
    if (contrastRatio(lifted, CHROME_BG) >= MIN_TEXT_CONTRAST) return lifted;
  }
  return '#FFFFFF';
}

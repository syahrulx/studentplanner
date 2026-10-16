import { Dimensions, Platform } from 'react-native';

import { LOCK_METRICS, fitModel, type LockFit, type LockSafeZone } from './lockScreenGeometry';
import type { LockScreenConfig, LockScreenDayModel, LockTimetableDay } from './types';

/**
 * Landscape wallpapers for tablets and laptops, saved from the Studio.
 *
 * Separate from the phone picture on purpose. The phone picture is what the
 * iPhone automation sets every day, so nothing here is stored in
 * LockScreenConfig or read by the render host: choosing Tablet or Laptop in
 * the Studio can't change what lands on the phone. Only the two dateless
 * templates are offered (Timetable and Grid), because a tablet or laptop
 * wallpaper is saved once and kept: it has no automation to refresh it.
 *
 * Units follow the phone's: design points × s. Here s comes from the height
 * (H / 600), not the width, so text is the size a lock screen needs and a
 * wide screen gets more room rather than bigger letters.
 */

export type LockShape = 'phone' | 'tablet' | 'laptop';
export type LandscapeShape = Exclude<LockShape, 'phone'>;
export type LandscapeTemplate = 'timetable' | 'grid';

export interface LandscapeOptions {
  shape: LockShape;
  template: LandscapeTemplate;
  /** iPad keeps lock screen widgets in a column on the left in landscape. */
  widgetsLeft: boolean;
}

export const DEFAULT_LANDSCAPE_OPTIONS: LandscapeOptions = { shape: 'phone', template: 'timetable', widgetsLeft: false };

export function sanitizeLandscapeOptions(raw: unknown): LandscapeOptions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<LandscapeOptions>;
  return {
    shape: r.shape === 'tablet' || r.shape === 'laptop' ? r.shape : 'phone',
    template: r.template === 'grid' ? 'grid' : 'timetable',
    widgetsLeft: r.widgetsLeft === true,
  };
}

/** iPad 11" in landscape, and a 16:10 laptop. Capture comes out at points × the phone's scale. */
const TABLET = { W: 1194, H: 834 };
const LAPTOP = { W: 1280, H: 800 };
const DESIGN_H = 600;

export function landscapeCanvasSize(shape: LandscapeShape): { W: number; H: number; s: number } {
  let { W, H } = shape === 'tablet' ? TABLET : LAPTOP;
  if (shape === 'tablet' && Platform.OS === 'ios' && Platform.isPad) {
    // On an iPad, its own screen turned sideways.
    const { width, height } = Dimensions.get('screen');
    W = Math.max(width, height);
    H = Math.min(width, height);
  }
  return { W, H, s: H / DESIGN_H };
}

/**
 * Where the card may sit, as fractions of H.
 * Tablet: below the clock, to the bottom edge (no flashlight or camera buttons).
 * Laptop: below the clock, above the name and password field of the lock
 * screen, which is also clear of the dock on a desktop.
 */
const ZONES: Record<LandscapeShape, LockSafeZone> = {
  tablet: { minTop: 0.34, maxBottom: 0.95 },
  laptop: { minTop: 0.28, maxBottom: 0.85 },
};

export const LANDSCAPE_TT = {
  headerH: 18,
  headerGap: 10,
  colGap: 8,
  colPad: 9,
  dayHeadH: 16,
  dayHeadGap: 6,
  /** One class: time, code, room. */
  rowH: 46,
  rowGap: 6,
  /** "No classes" and "+n more". */
  noteH: 18,
} as const;

export interface LandscapeLayout {
  W: number;
  H: number;
  s: number;
  /** Panel box in canvas pt. */
  left: number;
  width: number;
  topPx: number;
  panelH: number;
  template: LandscapeTemplate;
  /** Grid: the phone fit, worked out for this zone. */
  fit: LockFit | null;
  /** Timetable: classes drawn per day before "+n more". */
  rows: number;
}

function ttChrome(): number {
  const t = LANDSCAPE_TT;
  const p = LOCK_METRICS.panel;
  return p.padTop + p.padBottom + t.headerH + t.headerGap + 2 * t.colPad + t.dayHeadH + t.dayHeadGap;
}

/** Height in design units of the days-across timetable with `rows` class rows. */
export function landscapeTimetableUnits(days: LockTimetableDay[], rows: number): number {
  const t = LANDSCAPE_TT;
  const busiest = days.reduce((m, d) => Math.max(m, d.classes.length), 0);
  const drawn = Math.min(busiest, rows);
  const more = busiest > rows ? 1 : 0;
  const body = drawn === 0 ? t.noteH : drawn * t.rowH + (drawn - 1) * t.rowGap + (more ? t.rowGap + t.noteH : 0);
  return ttChrome() + body;
}

export function landscapeLayout(
  model: LockScreenDayModel,
  config: LockScreenConfig,
  opts: LandscapeOptions,
): LandscapeLayout {
  const shape: LandscapeShape = opts.shape === 'laptop' ? 'laptop' : 'tablet';
  const { W, H, s } = landscapeCanvasSize(shape);
  const zone = ZONES[shape];
  const sideFrac = shape === 'laptop' ? 0.08 : 0.05;
  // The widget column on a landscape iPad is about a quarter of the width.
  const left = shape === 'tablet' && opts.widgetsLeft ? W * 0.3 : W * sideFrac;
  const width = W - left - W * sideFrac;

  if (opts.template === 'grid') {
    const fit = fitModel(model, { ...config, template: 'grid', topFrac: zone.minTop }, H, s, zone);
    return { W, H, s, left, width, topPx: fit.topPx, panelH: fit.panelH, template: 'grid', fit, rows: 0 };
  }

  const topPx = H * zone.minTop;
  const avail = (zone.maxBottom * H - topPx) / s;
  const busiest = model.timetable.reduce((m, d) => Math.max(m, d.classes.length), 0);
  // Every class if they fit; otherwise as many as fit, with the last row giving way to "+n more".
  let rows = Math.max(1, busiest);
  while (rows > 1 && landscapeTimetableUnits(model.timetable, rows) > avail) rows--;
  const panelH = landscapeTimetableUnits(model.timetable, rows) * s;
  return { W, H, s, left, width, topPx, panelH, template: 'timetable', fit: null, rows };
}

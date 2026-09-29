/**
 * Shared contracts for the self-refreshing lock screen.
 *
 * The app draws one picture per upcoming day (LockScreenRenderHost) and the
 * "Get lock screen image" App Intent serves today's picture to a Shortcuts
 * automation that sets it as the wallpaper. See lockScreenStore.ts for the
 * App Group file layout and modules/smart-capture/ios-app-target/
 * LockScreenIntents.swift for the intent.
 */

// ─── Config (per user, AsyncStorage) ─────────────────────────────────────────

export type LockTemplateId = 'today' | 'week' | 'timetable' | 'grid';
export type LockGradientId =
  | 'dusk'
  | 'lagoon'
  | 'matcha'
  | 'peach'
  | 'midnight'
  | 'aurora'
  | 'graphite'
  | 'sakura';
export type LockBackgroundId = LockGradientId | 'theme' | 'photo';
/** What already occupies the top of the student's lock screen. */
export type LockTopPreset = 'standard' | 'widgets' | 'bigClock' | 'compact';
export type LockPanelStyle = 'dark' | 'light';
export type LockSize = 'short' | 'medium' | 'tall';
/** Photo dim level: index into PHOTO_DIM_ALPHA. */
export type LockDim = 0 | 1 | 2;

export interface LockShowOptions {
  tasks: boolean;
  /** On by default; the Show tab warns that a lock screen is readable while locked. */
  rooms: boolean;
  /** Group / section code (e.g. CDCS2596A). Off by default: one code on every class is noise. */
  group: boolean;
  weekNo: boolean;
}

export interface LockScreenConfig {
  version: 1;
  template: LockTemplateId;
  background: LockBackgroundId;
  /** file:// under Paths.document/lock-screen-bg/, or null. */
  photoPath: string | null;
  dim: LockDim;
  panel: LockPanelStyle;
  top: LockTopPreset;
  /** Panel top as a fraction of screen height; null = recommendedTopFrac(top). */
  topFrac: number | null;
  size: LockSize;
  show: LockShowOptions;
  autoRefresh: boolean;
}

export const DEFAULT_LOCK_SCREEN_CONFIG: LockScreenConfig = {
  version: 1,
  template: 'today',
  background: 'dusk',
  photoPath: null,
  dim: 1,
  panel: 'dark',
  top: 'standard',
  topFrac: null,
  size: 'medium',
  show: { tasks: true, rooms: true, group: false, weekNo: true },
  autoRefresh: false,
};

// ─── Setup state (per device, AsyncStorage, not user-scoped) ─────────────────

export interface LockScreenSetupState {
  shortcutOpenedAt: number | null;
  shortcutStepDoneAt: number | null;
  firstRunVerifiedAt: number | null;
  completedAt: number | null;
  /** Set when a run started from inside Rencana. */
  lastManualRunAt: number | null;
  /** Set by the render host whenever the app goes to the background. */
  lastBackgroundAt: number | null;
  /** A picture was served while Rencana was backgrounded and no manual run was in flight. */
  automationConfirmedAt: number | null;
  /** Same, served within 60 s of going to the background (the "Is Closed" recipe). */
  closeAutomationConfirmedAt: number | null;
  /** Show the "updated itself" banner once in the Studio. */
  automationBannerPending: boolean;
  /** Consecutive wallpaperFailed outcomes; drives the photo-type fix panel. */
  wallpaperFailCount: number;
}

export const DEFAULT_LOCK_SCREEN_SETUP: LockScreenSetupState = {
  shortcutOpenedAt: null,
  shortcutStepDoneAt: null,
  firstRunVerifiedAt: null,
  completedAt: null,
  lastManualRunAt: null,
  lastBackgroundAt: null,
  automationConfirmedAt: null,
  closeAutomationConfirmedAt: null,
  automationBannerPending: false,
  wallpaperFailCount: 0,
};

// ─── Day model (what one picture shows) ──────────────────────────────────────

export interface LockClassRow {
  key: string;
  /** 'HH:MM' 24 h, formatted at draw time. */
  start: string;
  end: string;
  /** displayName || subjectCode || subjectName */
  label: string;
  /** subjectName when it differs from label. */
  name: string | null;
  /** location; "Online" when there is none, as the timetable grid shows it. */
  room: string | null;
  /** 'G2' for a bare number, else the section code as stored; null when none. */
  group: string | null;
  color: string;
  onColor: string;
}

export interface LockTaskRow {
  key: string;
  title: string;
  /** Formatted due time, or the course label when the task has no real time. */
  trailing: string;
  color: string;
}

export interface LockWeekChip {
  label: string;
  color: string;
  onColor: string;
}

export interface LockWeekCell {
  dateISO: string;
  /** 'MON' / 'ISN' */
  dayShort: string;
  /** 'M' / 'I' */
  initial: string;
  dayNum: number;
  isFocus: boolean;
  isPast: boolean;
  chips: LockWeekChip[];
  hasClasses: boolean;
  firstColor: string | null;
}

/** One day of the Timetable template: every class that weekday, whatever the date. */
export interface LockTimetableDay {
  /** 0=Sun..6=Sat */
  weekday: number;
  /** 'MON' / 'ISN' */
  dayShort: string;
  classes: LockClassRow[];
}

export interface LockNextClass {
  dayShort: string;
  /** Formatted time. */
  time: string;
  label: string;
  room: string | null;
  group: string | null;
}

export interface LockScreenDayModel {
  kind: 'day' | 'fallback';
  /** null for the fallback. */
  dateISO: string | null;
  /** 0=Sun..6=Sat, -1 for the fallback. */
  weekday: number;
  /** 'TUE · 30 SEP' ('' for the fallback). */
  headerDate: string;
  /** 'WEEK 5' | 'STUDY WEEK' | 'EXAM WEEK' | 'SEMESTER BREAK' | null */
  weekLabel: string | null;
  /** True in study, exam and semester-break weeks: no classes are drawn. */
  noClassesPeriod: boolean;
  classes: LockClassRow[];
  tasks: LockTaskRow[];
  overdueCount: number;
  /** Next day with classes within 14 days (only computed when D has none). */
  next: LockNextClass | null;
  /** 7 cells in weekStartsOn order, containing D. */
  week: LockWeekCell[];
  /** '29 SEP – 5 OCT' ('' for the fallback). */
  weekRange: string;
  /**
   * The weekly timetable for the Timetable template, in week order: the first
   * five days always, a later day only when it has a class. Undated and
   * blind to break weeks on purpose — it is the picture Android saves once and
   * keeps, so nothing in it may go stale.
   */
  timetable: LockTimetableDay[];
  /** 'as of Sat 11:40 PM'. Excluded from the signature. */
  asOf: string;
  uses24h: boolean;
}

// ─── Render pipeline and health ──────────────────────────────────────────────

export interface LockRenderState {
  phase: 'idle' | 'waiting' | 'rendering' | 'error';
  done: number;
  total: number;
  lastWrittenAt: number | null;
  /** Today's picture is live in the App Group. */
  todayReady: boolean;
  error?: string;
}

export const INITIAL_LOCK_RENDER_STATE: LockRenderState = {
  phase: 'idle',
  done: 0,
  total: 0,
  lastWrittenAt: null,
  todayReady: false,
};

export type LockScreenHealth =
  | { kind: 'unsupported'; reason: 'android' | 'ipad' | 'noAppGroup' }
  | { kind: 'off' }
  | { kind: 'setup'; step: 1 | 2 | 3 }
  | { kind: 'pending'; since: number }
  | { kind: 'healthy'; lastServedAt: number; usedFallback: boolean; servedDateISO: string }
  | { kind: 'stale'; lastServedAt: number | null };

export const STALE_AFTER_MS = 36 * 3600 * 1000;

export type LockRunOutcome =
  | { kind: 'ok'; servedAt: number; usedFallback: boolean }
  | { kind: 'wallpaperFailed'; errorMessage?: string }
  | { kind: 'previewCancelled' }
  | { kind: 'wrongShortcut' }
  | { kind: 'notReady' }
  | { kind: 'notFound'; errorMessage?: string }
  | { kind: 'couldntRun'; errorMessage?: string }
  | { kind: 'locked' }
  | { kind: 'storage' }
  | { kind: 'cancelled' }
  | { kind: 'noShortcutsApp' };

export type LockRunOutcomeKind = LockRunOutcome['kind'];

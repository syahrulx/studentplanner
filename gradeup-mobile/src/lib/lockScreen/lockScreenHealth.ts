import { Platform } from 'react-native';

import { loadLockScreenSetup, updateLockScreenSetup } from './lockScreenConfig';
import { isLockScreenStoreAvailable, readLockScreenStatus, type LockScreenStatus } from './lockScreenStore';
import { STALE_AFTER_MS, type LockScreenHealth, type LockScreenSetupState } from './types';

/**
 * Whether the self-refreshing lock screen is working, derived from what we can
 * observe: the student's config, how far setup got, and status.json (written
 * by the App Intent every time a shortcut takes a picture).
 */

export { STALE_AFTER_MS };

export type LockScreenUnsupportedReason = Extract<LockScreenHealth, { kind: 'unsupported' }>['reason'];

/**
 * A manual run opens Shortcuts, which sends Rencana to the background, so its
 * picture is also "served while in the background". A background that began
 * this soon after a manual run started (or after Rencana opened Shortcuts for
 * the student) belongs to that. The runner expects the switch within 8 s;
 * anything later is the student leaving on their own.
 */
const MANUAL_RUN_WINDOW_MS = 15_000;

/** Served this soon after Rencana went to the background: the "Is Closed" recipe. */
const CLOSE_AUTOMATION_WINDOW_MS = 60_000;

let unsupportedReason: LockScreenUnsupportedReason | null | undefined;

/** Why this device can't auto-refresh its lock screen, or null when it can. Web counts as 'android'. */
export function lockScreenUnsupportedReason(): LockScreenUnsupportedReason | null {
  if (unsupportedReason === undefined) {
    if (Platform.OS !== 'ios') unsupportedReason = 'android';
    else if (Platform.isPad) unsupportedReason = 'ipad';
    else unsupportedReason = isLockScreenStoreAvailable() ? null : 'noAppGroup';
  }
  return unsupportedReason;
}

export interface LockScreenHealthInput {
  unsupported: LockScreenUnsupportedReason | null;
  autoRefresh: boolean;
  setup: LockScreenSetupState;
  status: LockScreenStatus | null;
  now: number;
}

/** Spec §2.6, checked in order. Pure, so the pill, the CTA and the Smart automations card agree. */
export function deriveLockScreenHealth({
  unsupported,
  autoRefresh,
  setup,
  status,
  now,
}: LockScreenHealthInput): LockScreenHealth {
  if (unsupported) return { kind: 'unsupported', reason: unsupported };
  if (!autoRefresh) return { kind: 'off' };
  if (!setup.completedAt) {
    const step = !setup.shortcutStepDoneAt ? 1 : !setup.firstRunVerifiedAt ? 2 : 3;
    return { kind: 'setup', step };
  }
  if (status && now - status.lastServedAt <= STALE_AFTER_MS) {
    return {
      kind: 'healthy',
      lastServedAt: status.lastServedAt,
      usedFallback: status.usedFallback,
      servedDateISO: status.servedDateISO,
    };
  }
  if (now - setup.completedAt <= STALE_AFTER_MS) return { kind: 'pending', since: setup.completedAt };
  return { kind: 'stale', lastServedAt: status?.lastServedAt ?? null };
}

export interface LockAutomationCheck {
  /**
   * A picture was served while Rencana was away, after setup's verified run,
   * by something other than Rencana itself: an automation, as far as we can tell.
   */
  confirmedNow: boolean;
  /** That serve came within a minute of leaving Rencana: the "Is Closed" recipe. */
  viaClose: boolean;
  servedAt: number | null;
}

const NOT_CONFIRMED: LockAutomationCheck = { confirmedNow: false, viaClose: false, servedAt: null };

/**
 * When Rencana last opened Shortcuts for the student (to add the shortcut or
 * an automation). Only this session's trips matter, so it lives in memory.
 */
let shortcutsTripAt: number | null = null;

/** Called as Rencana sends the student to Shortcuts, where they may well run the shortcut by hand. */
export function noteLockShortcutsTrip(): void {
  shortcutsTripAt = Date.now();
}

let detectorRun: Promise<LockAutomationCheck> | null = null;

async function detectAutomation(): Promise<LockAutomationCheck> {
  const status = readLockScreenStatus();
  if (!status) return NOT_CONFIRMED;

  const setup = await loadLockScreenSetup();
  const backgroundAt = setup.lastBackgroundAt;
  if (!backgroundAt || status.lastServedAt <= backgroundAt) return NOT_CONFIRMED;

  // Setup shows the automation recipes only after its verified run, so any
  // serve before that is the student trying the shortcut while building it.
  const verifiedAt = setup.firstRunVerifiedAt;
  if (verifiedAt == null || status.lastServedAt <= verifiedAt) return NOT_CONFIRMED;

  // A background this soon after Rencana started a run, or sent the student
  // to Shortcuts, belongs to that: the serve is the run, or the student
  // tapping the shortcut there. Also true when either started after the last
  // background, i.e. is still in flight in this session.
  const startedHere = (at: number | null) => at != null && backgroundAt - at <= MANUAL_RUN_WINDOW_MS;
  if (startedHere(setup.lastManualRunAt) || startedHere(shortcutsTripAt)) return NOT_CONFIRMED;

  const viaClose = status.lastServedAt - backgroundAt <= CLOSE_AUTOMATION_WINDOW_MS;
  // Already recorded for this serve (another caller in the same activation, or
  // an inactive → active bounce): nothing new to write.
  if (setup.automationConfirmedAt == null || setup.automationConfirmedAt < status.lastServedAt) {
    const now = Date.now();
    await updateLockScreenSetup((current) => ({
      automationConfirmedAt: now,
      // Until setup is finished, only the setup sheet's close test (which
      // records this itself) says a quick serve was the close recipe.
      closeAutomationConfirmedAt:
        viaClose && current.completedAt != null ? now : current.closeAutomationConfirmedAt,
      automationBannerPending: current.automationConfirmedAt == null ? true : current.automationBannerPending,
    }));
  }
  return { confirmedNow: true, viaClose, servedAt: status.lastServedAt };
}

/**
 * Passive automation check (spec §3.7), run on AppState 'active' by the render
 * host and the setup sheet; also safe on mount, which covers a cold start after
 * the automation ran while the app was killed.
 *
 * The answer stays the same for every check until the next background (or a
 * newer serve), so each caller can react. Concurrent calls share one run.
 */
export function runLockScreenAutomationDetector(): Promise<LockAutomationCheck> {
  if (!detectorRun) {
    detectorRun = detectAutomation()
      .catch(() => NOT_CONFIRMED)
      .finally(() => {
        detectorRun = null;
      });
  }
  return detectorRun;
}

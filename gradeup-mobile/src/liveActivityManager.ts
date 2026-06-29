import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { isLiveActivityKindEnabled, type LiveActivityKind } from './liveActivityPrefs';
import type { RencanaLiveActivityProps } from '../widgets/RencanaLiveActivity';

/**
 * Host-side controller for the single Rencana iOS Live Activity. At most one
 * activity is shown at a time; a higher-priority trigger replaces a lower one.
 *
 * Mirrors the defensive loading in `iosWidgetTimelineSync.ts`: the `expo-widgets`
 * JS eagerly touches the native module, so we never import the Live Activity
 * factory unless the native modules are actually linked (i.e. not Expo Go and
 * not a build without the widget extension).
 */

export type LiveActivityInput = Omit<RencanaLiveActivityProps, 'kind'>;

type NativeLiveActivityInstance = {
  update: (props: RencanaLiveActivityProps) => Promise<void>;
  end: (
    dismissalPolicy?: 'default' | 'immediate' | { after: Date },
    props?: RencanaLiveActivityProps,
    contentDate?: Date,
  ) => Promise<void>;
};

type NativeLiveActivityFactory = {
  start: (props: RencanaLiveActivityProps, url?: string) => NativeLiveActivityInstance;
  getInstances: () => NativeLiveActivityInstance[];
};

// Higher number = higher priority. Explicit, user-driven activities (a focus
// session, an open check-in window) outrank the ambient countdowns that the
// app starts on its own (next class, next deadline).
const PRIORITY: Record<LiveActivityKind, number> = {
  studyTimer: 3,
  attendance: 2,
  nextClass: 1,
  deadline: 0,
};

let cachedFactory: NativeLiveActivityFactory | null = null;
let current: { kind: LiveActivityKind; instance: NativeLiveActivityInstance; props: RencanaLiveActivityProps } | null =
  null;

function modulesAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  return (
    requireOptionalNativeModule('ExpoUI') != null && requireOptionalNativeModule('ExpoWidgets') != null
  );
}

function getFactory(): NativeLiveActivityFactory | null {
  if (!modulesAvailable()) return null;
  if (cachedFactory) return cachedFactory;
  try {
    const mod = require('../widgets/RencanaLiveActivity') as {
      default?: NativeLiveActivityFactory;
    };
    const factory = mod?.default;
    if (factory && typeof factory.start === 'function') {
      cachedFactory = factory;
      return factory;
    }
  } catch {}
  return null;
}

/** End any activities the system still knows about (e.g. left over from a previous launch). */
function endNativeInstances(factory: NativeLiveActivityFactory): void {
  try {
    for (const inst of factory.getInstances()) {
      inst.end('immediate').catch(() => {});
    }
  } catch {}
}

/**
 * Start the given Live Activity, replacing any currently shown one. No-op when
 * the kind is disabled in settings, when running without the native modules, or
 * when an equal/higher-priority activity is already showing.
 */
export async function startOrReplaceLiveActivity(
  kind: LiveActivityKind,
  input: LiveActivityInput,
): Promise<void> {
  if (!modulesAvailable()) return;

  try {
    if (!(await isLiveActivityKindEnabled(kind))) return;

    const factory = getFactory();
    if (!factory) return;

    const props: RencanaLiveActivityProps = { kind, ...input };

    // Same kind already showing → just update its content.
    if (current && current.kind === kind) {
      current.props = props;
      await current.instance.update(props).catch(() => {});
      return;
    }

    // A different, equal-or-higher-priority activity owns the slot → leave it.
    if (current && PRIORITY[current.kind] > PRIORITY[kind]) return;

    // Take over the single slot.
    endNativeInstances(factory);
    current = null;

    const instance = factory.start(props);
    current = { kind, instance, props };
  } catch {}
}

/** Update the currently shown activity if it matches `kind`; merges with the last props. */
export async function updateLiveActivity(kind: LiveActivityKind, patch: Partial<LiveActivityInput>): Promise<void> {
  if (!current || current.kind !== kind) return;
  try {
    const props: RencanaLiveActivityProps = { ...current.props, ...patch, kind };
    current.props = props;
    await current.instance.update(props).catch(() => {});
  } catch {}
}

/** End the currently shown activity if it matches `kind`. */
export async function endLiveActivity(kind: LiveActivityKind): Promise<void> {
  if (!current || current.kind !== kind) return;
  const inst = current.instance;
  current = null;
  try {
    await inst.end('immediate').catch(() => {});
  } catch {}
}

/** End every Rencana Live Activity (used on sign-out or when all kinds are disabled). */
export async function endAllLiveActivities(): Promise<void> {
  current = null;
  const factory = getFactory();
  if (!factory) return;
  try {
    for (const inst of factory.getInstances()) {
      await inst.end('immediate').catch(() => {});
    }
  } catch {}
}

/** The kind currently shown (or null). Exposed mainly for diagnostics/tests. */
export function getCurrentLiveActivityKind(): LiveActivityKind | null {
  return current?.kind ?? null;
}

import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';

import SegmentedControl, { type SegmentedOption } from '@/components/SegmentedControl';
import { iosMajorVersion } from '@/src/lib/lockScreen/lockScreenShortcut';
import type { LockSize, LockTopPreset } from '@/src/lib/lockScreen/types';

import { trayRowEntering, type StudioPanelProps } from './StudioTabs';

/**
 * Layout tab (spec §3.3): what already sits at the top of the student's lock
 * screen (which sets the card's safe zone), the card size, and a way back to
 * the recommended position after dragging.
 *
 * Props (on top of StudioPanelProps): `accent`, the Reset position link colour
 * (the dark-glass accent lifted for the dark tray, lockChromeAccent).
 *
 * - Top presets: Standard / Widgets / Big clock, plus Compact on iOS 27+,
 *   where the time can sit inline in the top row. Picking one clears
 *   `topFrac`, so the card snaps to that preset's recommended spot.
 * - Android and iPad have no presets (one fixed safe band, lockSafeZone),
 *   so the question is hidden there.
 * - Size is hidden for Timetable and Grid, which always show every class
 *   that fits; a note takes the row so the tab doesn't jump.
 */

export interface LayoutPanelProps extends StudioPanelProps {
  accent: string;
}

const COMPACT_MIN_IOS = 27;

export function LayoutPanel({ config, update, T, reduceMotion, accent }: LayoutPanelProps) {
  const showTop = Platform.OS === 'ios' && !Platform.isPad;

  const topOptions: SegmentedOption<LockTopPreset>[] = [
    { value: 'standard', label: T('lsTopStandard') },
    { value: 'widgets', label: T('lsTopWidgets') },
    { value: 'bigClock', label: T('lsTopBig') },
  ];
  // Also kept if already chosen, so a stored value never leaves the control without a thumb.
  if (iosMajorVersion() >= COMPACT_MIN_IOS || config.top === 'compact') {
    topOptions.push({ value: 'compact', label: T('lsTopCompact') });
  }

  const sizeOptions: SegmentedOption<LockSize>[] = [
    { value: 'short', label: T('lsSizeShort') },
    { value: 'medium', label: T('lsSizeMedium') },
    { value: 'tall', label: T('lsSizeTall') },
  ];

  const canReset = config.topFrac != null;
  const reset = useCallback(() => {
    if (config.topFrac == null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    void update({ topFrac: null });
  }, [config.topFrac, update]);

  let row = 0;
  return (
    <View style={styles.root}>
      {showTop ? (
        <Animated.View entering={trayRowEntering(row++, reduceMotion)}>
          <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {T('lsTopQuestion')}
          </Text>
          <SegmentedControl
            options={topOptions}
            value={config.top}
            onChange={(top) => void update({ top, topFrac: null })}
            reduceMotion={reduceMotion}
            accessibilityLabel={T('lsTopQuestion')}
          />
        </Animated.View>
      ) : null}

      <Animated.View entering={trayRowEntering(row++, reduceMotion)} style={showTop && styles.sizeBlock}>
        <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {T('lsSize')}
        </Text>
        {config.template === 'timetable' || config.template === 'grid' ? (
          <View style={styles.sizeNote}>
            <Text style={styles.sizeNoteText} numberOfLines={2} maxFontSizeMultiplier={1.2}>
              {T('lsTtSizeNote')}
            </Text>
          </View>
        ) : (
          <SegmentedControl
            options={sizeOptions}
            value={config.size}
            onChange={(size) => void update({ size })}
            reduceMotion={reduceMotion}
            accessibilityLabel={T('lsSize')}
          />
        )}
      </Animated.View>

      <Animated.View entering={trayRowEntering(row++, reduceMotion)} style={styles.footer}>
        <Text style={styles.hint} numberOfLines={2} maxFontSizeMultiplier={1.2}>
          {T('lsTopHint')}
        </Text>
        <Pressable
          onPress={reset}
          disabled={!canReset}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canReset }}
          style={({ pressed }) => [styles.resetHit, pressed && canReset && styles.resetPressed]}
        >
          <Text
            style={[styles.reset, { color: accent }, !canReset && styles.resetDisabled]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            {T('lsResetPosition')}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default LayoutPanel;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  sizeBlock: {
    marginTop: 10,
  },
  sizeNote: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(118,118,128,0.14)',
  },
  sizeNoteText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hint: {
    flex: 1,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
  },
  resetHit: {
    paddingVertical: 2,
  },
  resetPressed: {
    opacity: 0.6,
  },
  reset: {
    fontSize: 13,
    fontWeight: '700',
  },
  resetDisabled: {
    opacity: 0.35,
  },
});

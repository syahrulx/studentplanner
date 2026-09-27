import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import type { TranslationKey } from '@/src/i18n';
import { contrastText, withAlpha } from '@/src/lib/contrast';
import { lockChromeAccent } from '@/src/lib/lockScreen/lockScreenPalette';
import type { LockShowOptions } from '@/src/lib/lockScreen/types';

import { trayRowEntering, type StudioPanelProps } from './StudioTabs';

/**
 * Show tab (spec §3.3): what the picture includes: tasks due, rooms, the week
 * number. Rooms carry a warning, since anything on a lock screen is readable
 * without unlocking, and the tab ends with the same reminder in general.
 *
 * Props (on top of StudioPanelProps):
 * - `accent`: the switches' on colour (the dark-glass accent,
 *   resolveLockInk('dark', …).accent).
 * - `darkMinimal`: Mono and Spider packs; white thumbs, like their other switches.
 * - `timetableEmpty`: with no classes there is nothing for these switches to
 *   shape yet, so the tab becomes a card that sends the student to add their
 *   timetable (the preview still shows tasks meanwhile).
 * - `onAddTimetable`: defaults to pushing /timetable-edit.
 */

export interface ShowPanelProps extends StudioPanelProps {
  accent: string;
  darkMinimal: boolean;
  timetableEmpty?: boolean;
  onAddTimetable?: () => void;
}

const ROWS: readonly { key: keyof LockShowOptions; label: TranslationKey; hint?: TranslationKey }[] = [
  { key: 'tasks', label: 'lsShowTasks' },
  { key: 'rooms', label: 'lsShowRooms', hint: 'lsShowRoomsHint' },
  { key: 'weekNo', label: 'lsShowWeekNo' },
];

const TRACK_OFF = 'rgba(255,255,255,0.16)';
/**
 * A near-white accent (Mono, Spider) would put the white thumb on a white
 * track; iOS's own grey reads as "on" against the dim off track instead.
 */
const TRACK_ON_FOR_WHITE_ACCENT = '#8E8E93';

export function ShowPanel({
  config,
  update,
  T,
  reduceMotion,
  accent,
  darkMinimal,
  timetableEmpty = false,
  onAddTimetable,
}: ShowPanelProps) {
  const toggle = useCallback(
    (key: keyof LockShowOptions, value: boolean) => {
      Haptics.selectionAsync().catch(() => {});
      void update({ show: { ...config.show, [key]: value } });
    },
    [config.show, update],
  );

  if (timetableEmpty) {
    return (
      <EmptyTimetableCard
        T={T}
        accent={accent}
        reduceMotion={reduceMotion}
        onPress={onAddTimetable ?? (() => router.push('/timetable-edit'))}
      />
    );
  }

  // Lifted like a link: a dark primary on the near-black tray would be no brighter than the off track.
  const trackOn = contrastText(accent) === '#ffffff' ? lockChromeAccent(accent) : TRACK_ON_FOR_WHITE_ACCENT;

  // At default text sizes this fits the 156-pt tray and sits centred. From
  // Dynamic Type xLarge the hint and the note wrap, and the tray (fixed, so
  // the preview keeps its size) would spill them under the buttons: scroll.
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      alwaysBounceVertical={false}
      showsVerticalScrollIndicator={false}
    >
      {ROWS.map((row, i) => (
        <Animated.View key={row.key} entering={trayRowEntering(i, reduceMotion)}>
          <View style={styles.row}>
            <Text style={styles.rowLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {T(row.label)}
            </Text>
            <Switch
              value={config.show[row.key]}
              onValueChange={(value) => toggle(row.key, value)}
              trackColor={{ false: TRACK_OFF, true: trackOn }}
              thumbColor={darkMinimal ? '#fff' : undefined}
              ios_backgroundColor={TRACK_OFF}
              accessibilityLabel={T(row.label)}
              accessibilityHint={row.hint ? T(row.hint) : undefined}
            />
          </View>
          {row.hint ? (
            <Text style={styles.rowHint} numberOfLines={2} maxFontSizeMultiplier={1.2}>
              {T(row.hint)}
            </Text>
          ) : null}
        </Animated.View>
      ))}
      <Animated.View entering={trayRowEntering(ROWS.length, reduceMotion)} style={styles.privacy}>
        <Feather name="lock" size={11} color="rgba(255,255,255,0.45)" />
        <Text style={styles.privacyText} numberOfLines={2} maxFontSizeMultiplier={1.2}>
          {T('lsPrivacyNote')}
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

export default ShowPanel;

export interface EmptyTimetableCardProps {
  T: (key: TranslationKey) => string;
  accent: string;
  reduceMotion: boolean;
  onPress: () => void;
}

/** Replaces the Show tab while the timetable is empty (spec §3.2 "Empty timetable"). */
export function EmptyTimetableCard({ T, accent, reduceMotion, onPress }: EmptyTimetableCardProps) {
  const onAccent = contrastText(accent);
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  return (
    <View style={styles.emptyRoot}>
      <Animated.View entering={trayRowEntering(0, reduceMotion)} style={styles.emptyCard}>
        <View style={styles.emptyHeader}>
          <View style={[styles.emptyIcon, { backgroundColor: withAlpha(accent, '29') }]}>
            <Feather name="calendar" size={18} color={lockChromeAccent(accent)} />
          </View>
          <View style={styles.emptyText}>
            <Text style={styles.emptyTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {T('lsEmptyTitle')}
            </Text>
            <Text style={styles.emptyBody} numberOfLines={2} maxFontSizeMultiplier={1.2}>
              {T('lsEmptyBody')}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onPress();
          }}
          onPressIn={() => {
            if (!reduceMotion) press.value = withTiming(0.97, { duration: 90 });
          }}
          onPressOut={() => {
            press.value = withSpring(1, { damping: 18, stiffness: 260, mass: 1 });
          }}
          accessibilityRole="button"
        >
          <Animated.View style={[styles.emptyButton, { backgroundColor: accent }, pressStyle]}>
            <Feather name="plus" size={16} color={onAccent} />
            <Text style={[styles.emptyButtonText, { color: onAccent }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {T('lsEmptyCta')}
            </Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  rowHint: {
    // Tucked up against its row: the label is centred in 40 pt, so the gap under it is mostly air.
    marginTop: -6,
    marginBottom: 4,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  privacy: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  privacyText: {
    flex: 1,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  emptyRoot: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: 18,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  emptyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    flex: 1,
    gap: 2,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  emptyBody: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  emptyButton: {
    height: 38,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
});

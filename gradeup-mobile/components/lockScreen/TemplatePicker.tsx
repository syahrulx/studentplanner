import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import type { ThemePalette } from '@/constants/Themes';
import type { TranslationKey } from '@/src/i18n';
import type { LockScreenConfig, LockScreenDayModel, LockTemplateId } from '@/src/lib/lockScreen/types';

import { lockScreenUnsupportedReason } from '@/src/lib/lockScreen/lockScreenHealth';

import LockCanvas from './LockCanvas';
import { STUDIO_TRAY_HEIGHT, trayRowEntering, type StudioPanelProps } from './StudioTabs';

/**
 * Template tab (spec §3.3): three live miniatures of today's picture, one per
 * template, drawn by the same LockCanvas the automation captures, so each card
 * is an honest preview in the student's own background and panel style.
 *
 * Props (on top of StudioPanelProps):
 * - `model`: today's day model (the same object the Studio previews).
 * - `theme`, `darkMinimal`: as passed to the Studio's LockCanvas.
 * - `W`, `H`, `s`: getLockCanvasSize(). The miniatures scale the full canvas
 *   down with a transform, never re-layout at a small W.
 * - `height`: the tray height the cards must fit, default 156.
 *
 * A tap plays the selection tick and saves `{ template }`.
 */

export interface TemplatePickerProps extends StudioPanelProps {
  model: LockScreenDayModel;
  theme: ThemePalette;
  darkMinimal: boolean;
  W: number;
  H: number;
  s: number;
  height?: number;
}

const TEMPLATES: readonly {
  id: LockTemplateId;
  label: TranslationKey;
  sub: TranslationKey;
  /**
   * True when the picture is only right for one day, so it is worth nothing
   * without something to redraw it each morning.
   *
   * iPadOS has no Shortcuts action for setting the wallpaper, so nothing can.
   * Offering "Today" there hands an iPad student a lock screen that is correct
   * once and quietly wrong every morning after — worse than not offering it,
   * because they have no reason to doubt it. The week-based templates stay:
   * they are still true for the rest of the week and a student can re-save
   * them when it turns over.
   */
  daily?: boolean;
}[] = [
  { id: 'today', label: 'lsTplToday', sub: 'lsTplTodaySub', daily: true },
  { id: 'week', label: 'lsTplWeek', sub: 'lsTplWeekSub' },
  { id: 'timetable', label: 'lsTplTimetable', sub: 'lsTplTimetableSub' },
  { id: 'grid', label: 'lsTplGrid', sub: 'lsTplGridSub' },
];

const MAX_CARD_W = 58;
const CARD_RADIUS = 12;
const RING_GAP = 2;
const RING_BORDER = 2;
const RING_INSET = RING_GAP + RING_BORDER;
const LABEL_GAP = 5;
const LABEL_LINE = 14;
const SUB_LINE = 12;
/** The labels follow Dynamic Type up to this; RN scales their lineHeight with them. */
const LABEL_MAX_SCALE = 1.15;

export function TemplatePicker({
  config,
  update,
  T,
  reduceMotion,
  model,
  theme,
  darkMinimal,
  W,
  H,
  s,
  height = STUDIO_TRAY_HEIGHT,
}: TemplatePickerProps) {
  // useTranslations hands out a new function every render. The model is
  // rebuilt whenever the language changes, so a stable wrapper loses nothing
  // and keeps three full canvases from redrawing on every Studio render.
  const tRef = useRef(T);
  tRef.current = T;
  const stableT = useCallback((key: TranslationKey) => tRef.current(key), []);

  // Sub-labels like "Whole week, with rooms" need two lines in a quarter of
  // the tray, so two are always reserved and the columns line up, at whatever
  // size Dynamic Type draws them.
  const { fontScale } = useWindowDimensions();
  const textScale = Math.min(fontScale, LABEL_MAX_SCALE);
  const subH = Math.ceil(SUB_LINE * 2 * textScale);
  const labelBlock = LABEL_GAP + Math.ceil(LABEL_LINE * textScale) + subH;

  // 58 pt wide as designed when it fits; on a phone this tall the ring and two
  // label lines leave less, so the card shrinks to keep the whole column inside the tray.
  const cardH = Math.max(0, Math.min((MAX_CARD_W * H) / W, height - RING_INSET * 2 - labelBlock));
  const cardW = (cardH * W) / H;

  // Nothing can redraw a wallpaper on iPadOS, so a day-only template cannot be
  // kept true there.
  const noAutomation = lockScreenUnsupportedReason() === 'ipad';
  const isLocked = useCallback(
    (id: LockTemplateId) => noAutomation && TEMPLATES.some((t) => t.id === id && t.daily),
    [noAutomation],
  );

  const select = useCallback(
    (id: LockTemplateId) => {
      if (id === config.template || isLocked(id)) return;
      Haptics.selectionAsync().catch(() => {});
      void update({ template: id });
    },
    [config.template, isLocked, update],
  );

  // A student who picked Today on a phone and opened the Studio on their iPad
  // would otherwise sit on a locked card with no way back.
  useEffect(() => {
    if (isLocked(config.template)) void update({ template: 'week' });
  }, [config.template, isLocked, update]);

  return (
    <View style={[styles.row, { height }]}>
      {TEMPLATES.map((tpl, i) => (
        <Animated.View key={tpl.id} entering={trayRowEntering(i, reduceMotion)} style={styles.column}>
          <TemplateCard
            id={tpl.id}
            label={T(tpl.label)}
            sub={T(tpl.sub)}
            selected={config.template === tpl.id}
            locked={isLocked(tpl.id)}
            lockedNote={T('lsTplNeedsAutomation')}
            onSelect={select}
            model={model}
            config={config}
            theme={theme}
            darkMinimal={darkMinimal}
            W={W}
            H={H}
            s={s}
            T={stableT}
            cardW={cardW}
            cardH={cardH}
            subH={subH}
            reduceMotion={reduceMotion}
          />
        </Animated.View>
      ))}
    </View>
  );
}

export default TemplatePicker;

interface TemplateCardProps {
  id: LockTemplateId;
  label: string;
  sub: string;
  selected: boolean;
  locked: boolean;
  lockedNote: string;
  onSelect: (id: LockTemplateId) => void;
  model: LockScreenDayModel;
  config: LockScreenConfig;
  theme: ThemePalette;
  darkMinimal: boolean;
  W: number;
  H: number;
  s: number;
  T: (key: TranslationKey) => string;
  cardW: number;
  cardH: number;
  subH: number;
  reduceMotion: boolean;
}

const TemplateCard = memo(function TemplateCard({
  id,
  label,
  sub,
  selected,
  locked,
  lockedNote,
  onSelect,
  model,
  config,
  theme,
  darkMinimal,
  W,
  H,
  s,
  T,
  cardW,
  cardH,
  subH,
  reduceMotion,
}: TemplateCardProps) {
  const cardConfig = useMemo(() => ({ ...config, template: id }), [config, id]);
  const press = useSharedValue(1);

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(selected ? '#FFFFFF' : 'rgba(255,255,255,0)', { duration: 180 }),
  }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  return (
    <Pressable
      onPress={() => onSelect(id)}
      disabled={locked}
      onPressIn={() => {
        if (!reduceMotion && !locked) press.value = withTiming(0.96, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = withSpring(1, { damping: 18, stiffness: 260, mass: 1 });
      }}
      style={styles.pressable}
      accessibilityRole="button"
      accessibilityLabel={locked ? `${label}. ${sub}. ${lockedNote}` : `${label}. ${sub}`}
      accessibilityState={{ selected, disabled: locked }}
    >
      <Animated.View style={[styles.ring, ringStyle, pressStyle]}>
        <View style={[styles.card, { width: cardW, height: cardH }]} pointerEvents="none">
          <View style={[styles.canvas, { width: W, height: H, transform: [{ scale: cardW / W }] }]}>
            <LockCanvas model={model} config={cardConfig} W={W} H={H} s={s} theme={theme} darkMinimal={darkMinimal} T={T} />
          </View>
          {/* Gives the dark gradients an edge against the dark tray. */}
          <View style={styles.cardEdge} />
          {locked ? (
            <View style={styles.lockedVeil}>
              <Feather name="lock" size={Math.max(11, cardW * 0.22)} color="rgba(255,255,255,0.92)" />
            </View>
          ) : null}
        </View>
      </Animated.View>
      <Text
        style={[styles.label, !selected && styles.labelIdle, locked && styles.labelLocked]}
        numberOfLines={1}
        maxFontSizeMultiplier={LABEL_MAX_SCALE}
      >
        {label}
      </Text>
      <Text style={[styles.sub, { height: subH }]} numberOfLines={2} maxFontSizeMultiplier={LABEL_MAX_SCALE}>
        {sub}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  pressable: {
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 4,
  },
  ring: {
    padding: RING_GAP,
    borderWidth: RING_BORDER,
    borderRadius: CARD_RADIUS + RING_INSET,
  },
  card: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#15161A',
  },
  canvas: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'top left',
  },
  lockedVeil: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,10,14,0.62)',
  },
  labelLocked: { opacity: 0.45 },
  cardEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  label: {
    marginTop: LABEL_GAP,
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: LABEL_LINE,
    fontWeight: '700',
    textAlign: 'center',
  },
  labelIdle: {
    color: 'rgba(255,255,255,0.7)',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    lineHeight: SUB_LINE,
    fontWeight: '600',
    textAlign: 'center',
  },
});

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import SegmentedControl from '@/components/SegmentedControl';
import type { ThemePalette } from '@/constants/Themes';
import { persistLockScreenPhoto } from '@/src/lib/lockScreen/lockScreenConfig';
import {
  LOCK_GRADIENTS,
  LOCK_GRADIENT_ORDER,
  lockGradientLayers,
  themeGradient,
  type LockGradientColors,
} from '@/src/lib/lockScreen/lockScreenPalette';
import type { LockBackgroundId, LockDim, LockPanelStyle } from '@/src/lib/lockScreen/types';

import { STUDIO_TRAY_PAD_X, trayRowEntering, type StudioPanelProps } from './StudioTabs';

/**
 * Background tab (spec §3.3): the student's photo, the theme gradient and the
 * eight curated gradients as swatches, then the photo dim (photo only) and the
 * card's glass style.
 *
 * Props (on top of StudioPanelProps): `theme`, for the Theme swatch.
 *
 * The photo swatch picks a photo when there is none, switches to the saved
 * photo when another background is on, and opens Change / Remove when the
 * photo is already the background. A picked photo is copied into the app's
 * documents (persistLockScreenPhoto) before it is saved, because the picker's
 * file is temporary and the render host redraws from it for days.
 *
 * The swatch row scrolls edge to edge through the tray's 16-pt side padding.
 */

export interface BackgroundPickerProps extends StudioPanelProps {
  theme: ThemePalette;
}

const SWATCH = 48;
const RING_GAP = 3;
const RING_BORDER = 2;
const TILE = SWATCH + (RING_GAP + RING_BORDER) * 2;
const TILE_GAP = 12;
const ROW_GAP = 8;
const CONTROL_LABEL_W = 64;
const POP_SCALE = 1.08;

type SwatchId = LockBackgroundId;

const SWATCHES: readonly SwatchId[] = ['photo', 'theme', ...LOCK_GRADIENT_ORDER];

export function BackgroundPicker({ config, update, T, reduceMotion, theme }: BackgroundPickerProps) {
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrolledToSelection = useRef(false);

  const themeColors = useMemo(() => themeGradient(theme), [theme]);

  const pickPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      const uri = !result.canceled ? result.assets?.[0]?.uri : null;
      if (!uri) return;
      setBusy(true);
      const photoPath = await persistLockScreenPhoto(uri, config.photoPath);
      await update({ background: 'photo', photoPath });
    } catch (e) {
      if (__DEV__) console.warn('[lockScreen] could not use the picked photo', e);
      // react-native-web's Alert is a no-op.
      if (Platform.OS === 'web') window.alert(T('lsSaveError'));
      else Alert.alert(T('lsBgPhoto'), T('lsSaveError'));
    } finally {
      setBusy(false);
    }
  }, [config.photoPath, update, T]);

  // Only offered while the photo is the background. Clearing the path also
  // deletes the copied file (lockScreenConfig); Dusk's swatch pops as it takes over.
  const removePhoto = useCallback(() => {
    void update({ photoPath: null, background: 'dusk' });
  }, [update]);

  const openPhotoOptions = useCallback(() => {
    // No button alerts on the web: picking again is Change, and any other
    // swatch does what Remove would (there is no copied file to delete there).
    if (Platform.OS === 'web') {
      void pickPhoto();
      return;
    }
    const change = T('lsBgChangePhoto');
    const remove = T('lsBgRemovePhoto');
    const cancel = T('lsCancel');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [change, remove, cancel],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
          userInterfaceStyle: 'dark',
        },
        (index) => {
          if (index === 0) void pickPhoto();
          else if (index === 1) removePhoto();
        },
      );
      return;
    }
    Alert.alert(T('lsBgPhoto'), undefined, [
      { text: change, onPress: () => void pickPhoto() },
      { text: remove, style: 'destructive', onPress: removePhoto },
      { text: cancel, style: 'cancel' },
    ]);
  }, [T, pickPhoto, removePhoto]);

  const onSwatch = useCallback(
    (id: SwatchId) => {
      if (busy) return;
      if (id === 'photo') {
        if (!config.photoPath) void pickPhoto();
        else if (config.background === 'photo') openPhotoOptions();
        else void update({ background: 'photo' });
        return;
      }
      if (id !== config.background) void update({ background: id });
    },
    [busy, config.photoPath, config.background, pickPhoto, openPhotoOptions, update],
  );

  // Land with the selected swatch in view (Sakura sits past the right edge).
  const onScrollLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (scrolledToSelection.current) return;
      scrolledToSelection.current = true;
      const index = SWATCHES.indexOf(config.background);
      if (index < 0) return;
      const visible = e.nativeEvent.layout.width;
      const content = STUDIO_TRAY_PAD_X * 2 + SWATCHES.length * TILE + (SWATCHES.length - 1) * TILE_GAP;
      const center = STUDIO_TRAY_PAD_X + index * (TILE + TILE_GAP) + TILE / 2;
      const x = Math.min(Math.max(0, center - visible / 2), Math.max(0, content - visible));
      if (x > 0) scrollRef.current?.scrollTo({ x, animated: false });
    },
    [config.background],
  );

  const dimOptions = [
    { value: 0 as LockDim, label: T('lsDimLow') },
    { value: 1 as LockDim, label: T('lsDimMid') },
    { value: 2 as LockDim, label: T('lsDimHigh') },
  ];
  const panelOptions = [
    { value: 'dark' as LockPanelStyle, label: T('lsPanelDark') },
    { value: 'light' as LockPanelStyle, label: T('lsPanelLight') },
  ];
  const photoOn = config.background === 'photo';
  // The dim row comes and goes with the photo; the other rows glide to make room.
  const glide = reduceMotion ? undefined : LinearTransition.duration(200);

  return (
    <View style={styles.root}>
      {/* The bleed sits on the wrapper: a child hanging outside its parent can't be touched on iOS. */}
      <Animated.View entering={trayRowEntering(0, reduceMotion)} layout={glide} style={styles.bleed}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={onScrollLayout}
          contentContainerStyle={styles.swatchRow}
        >
          {SWATCHES.map((id) => (
            <Swatch
              key={id}
              id={id}
              label={
                id === 'photo' ? T('lsBgPhoto') : id === 'theme' ? T('lsBgTheme') : LOCK_GRADIENTS[id].name
              }
              colors={id === 'photo' ? null : id === 'theme' ? themeColors : LOCK_GRADIENTS[id].c}
              photoPath={id === 'photo' ? config.photoPath : null}
              busy={id === 'photo' && busy}
              selected={config.background === id}
              onPress={onSwatch}
              reduceMotion={reduceMotion}
            />
          ))}
        </ScrollView>
      </Animated.View>

      {photoOn ? (
        <Animated.View
          entering={trayRowEntering(1, reduceMotion)}
          exiting={FadeOut.duration(150)}
          style={styles.controlRow}
        >
          <Text style={styles.controlLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {T('lsDim')}
          </Text>
          <SegmentedControl
            options={dimOptions}
            value={config.dim}
            onChange={(dim) => void update({ dim })}
            reduceMotion={reduceMotion}
            accessibilityLabel={T('lsDim')}
            style={styles.control}
          />
        </Animated.View>
      ) : null}

      <Animated.View
        entering={trayRowEntering(photoOn ? 2 : 1, reduceMotion)}
        layout={glide}
        style={styles.controlRow}
      >
        <Text style={styles.controlLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {T('lsPanel')}
        </Text>
        <SegmentedControl
          options={panelOptions}
          value={config.panel}
          onChange={(panel) => void update({ panel })}
          reduceMotion={reduceMotion}
          accessibilityLabel={T('lsPanel')}
          style={styles.control}
        />
      </Animated.View>
    </View>
  );
}

export default BackgroundPicker;

interface SwatchProps {
  id: SwatchId;
  label: string;
  /** Gradient colours; null for the photo tile. */
  colors: Readonly<LockGradientColors> | null;
  photoPath: string | null;
  busy: boolean;
  selected: boolean;
  onPress: (id: SwatchId) => void;
  reduceMotion: boolean;
}

const Swatch = memo(function Swatch({
  id,
  label,
  colors,
  photoPath,
  busy,
  selected,
  onPress,
  reduceMotion,
}: SwatchProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const wasSelected = useRef(selected);

  // The pop plays when the swatch becomes the background, not on every tap:
  // a tap on the photo tile may only open the picker.
  useEffect(() => {
    if (selected && !wasSelected.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (reduceMotion) {
        opacity.value = withSequence(withTiming(0.55, { duration: 0 }), withTiming(1, { duration: 150 }));
      } else {
        scale.value = withSequence(
          withTiming(POP_SCALE, { duration: 110 }),
          withSpring(1, { damping: 12, stiffness: 260, mass: 1 }),
        );
      }
    }
    wasSelected.current = selected;
  }, [selected, reduceMotion, scale, opacity]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  const ringStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(selected ? '#FFFFFF' : 'rgba(255,255,255,0)', { duration: 160 }),
  }));

  return (
    <Pressable
      onPress={() => onPress(id)}
      style={styles.tile}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, busy }}
    >
      <Animated.View style={[styles.ring, ringStyle, popStyle]}>
        <View style={styles.swatch}>
          {colors ? (
            <GradientFill colors={colors} />
          ) : photoPath ? (
            <Image
              source={{ uri: photoPath }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
              accessible={false}
            />
          ) : (
            <View style={styles.addPhoto}>
              <Feather name="plus" size={20} color="#FFFFFF" />
            </View>
          )}
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
          ) : null}
          <View style={styles.swatchEdge} pointerEvents="none" />
        </View>
      </Animated.View>
      <Text style={styles.tileLabel} numberOfLines={1} maxFontSizeMultiplier={1.15}>
        {label}
      </Text>
    </Pressable>
  );
});

/** The same three layers the canvas paints, so a swatch is the background in miniature. */
function GradientFill({ colors }: { colors: Readonly<LockGradientColors> }) {
  return (
    <>
      {lockGradientLayers(colors).map((layer, i) => (
        <LinearGradient
          key={i}
          colors={layer.colors}
          start={layer.start}
          end={layer.end}
          style={StyleSheet.absoluteFill}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    gap: ROW_GAP,
  },
  bleed: {
    marginHorizontal: -STUDIO_TRAY_PAD_X,
  },
  swatchRow: {
    paddingHorizontal: STUDIO_TRAY_PAD_X,
    gap: TILE_GAP,
  },
  tile: {
    width: TILE,
    alignItems: 'center',
  },
  ring: {
    width: TILE,
    height: TILE,
    borderRadius: TILE / 2,
    borderWidth: RING_BORDER,
    padding: RING_GAP,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    overflow: 'hidden',
    backgroundColor: '#15161A',
  },
  swatchEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SWATCH / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  addPhoto: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  busy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tileLabel: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlLabel: {
    width: CONTROL_LABEL_W,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
  },
  control: {
    flex: 1,
  },
});

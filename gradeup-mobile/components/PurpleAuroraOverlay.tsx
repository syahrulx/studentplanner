import React from 'react';
import { Image, StyleSheet, View, type ImageStyle, type ViewStyle, type StyleProp } from 'react-native';

type PurpleAuroraOverlayProps = {
  /**
   * "soft" — full-cover wallpaper with a dark veil (default, blends without seams).
   * "right" / "left" — anchor variant for hero headers; uses cover so the image
   *   fills the container instead of leaving a hard cropped edge.
   */
  variant?: 'soft' | 'right' | 'left' | 'cover' | 'card';
  /** 0..1 — how visible the aurora flames are above the dark base. Default 0.32. */
  opacity?: number;
  /** Veil color overlaid on top of the wallpaper. Defaults to a lavender-tinted dark. */
  veilColor?: string;
  /** Custom container style overrides. */
  style?: StyleProp<ViewStyle>;
};

/**
 * Decorative purple aurora background — uses the dark/violet "flame" wallpaper
 * blended under a soft lavender-dark veil so it always reads as a smooth
 * background instead of a pasted corner image.
 */
export function PurpleAuroraOverlay({
  variant = 'soft',
  opacity = 0.32,
  veilColor = 'rgba(84,66,145,0.22)',
  style,
}: PurpleAuroraOverlayProps) {
  const imageStyle: ImageStyle = styles.fullImage;
  const source =
    variant === 'soft'
      ? require('../assets/purple-wallpaper-glitter.jpg')
      : require('../assets/purple-wallpaper-dark.jpg');

  return (
    <View style={[styles.fill, style]} pointerEvents="none">
      <Image
        source={source}
        style={[imageStyle, { opacity }]}
        resizeMode="cover"
      />
      {variant !== 'cover' ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: veilColor }]} />
      ) : null}
    </View>
  );
}

type PurpleGlitterAccentProps = {
  variant?: 'soft' | 'cover';
  opacity?: number;
  veilColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Soft lavender glitter wash — uses the marbled wallpaper as a full-surface
 * texture under a heavy veil for a pearlescent feel without visible edges.
 */
export function PurpleGlitterAccent({
  variant = 'soft',
  opacity = 0.32,
  veilColor = 'rgba(94,74,164,0.16)',
  style,
}: PurpleGlitterAccentProps) {
  return (
    <View style={[styles.fill, style]} pointerEvents="none">
      <Image
        source={require('../assets/purple-wallpaper-glitter.jpg')}
        style={[styles.fullImage, { opacity }]}
        resizeMode="cover"
      />
      {variant !== 'cover' ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: veilColor }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  fullImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});

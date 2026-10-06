import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { FlashcardStyleFace } from '@/src/lib/flashcardStyles';

/**
 * The painted surface of a flashcard, without any of its content.
 *
 * Each style is a few declarative fields rather than a branch in the review
 * screen, so adding a fourth never means touching the logic that grades cards.
 * Children are drawn above whatever this paints.
 */
export function FlashcardFace({
  face,
  minHeight,
  children,
}: {
  face: FlashcardStyleFace;
  minHeight: number;
  children: React.ReactNode;
}) {
  const radius = face.radius;

  const shell: ViewStyle = {
    borderRadius: radius,
    minHeight,
    paddingVertical: 32,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: face.borderWidth ?? 0,
    borderColor: face.border,
  };

  const body = (
    <View style={[shell, face.background.length === 1 && { backgroundColor: face.background[0] }]}>
      {face.background.length > 1 ? (
        <LinearGradient
          colors={face.background as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* Ruled paper. Drawn behind the words, never over them. */}
      {face.rules ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {Array.from({ length: Math.ceil(minHeight / face.rules.gap) }).map((_, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: (i + 1) * face.rules!.gap,
                height: StyleSheet.hairlineWidth,
                backgroundColor: face.rules!.color,
              }}
            />
          ))}
          {face.rules.margin ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 46,
                width: StyleSheet.hairlineWidth * 2,
                backgroundColor: face.rules.margin,
              }}
            />
          ) : null}
        </View>
      ) : null}

      {children}
    </View>
  );

  // Holographic: a foil edge around a dark panel. The sheen is a gradient ring
  // rather than a texture, so it costs nothing to draw on every card.
  if (face.foil) {
    return (
      <LinearGradient
        colors={['#ff5ebc', '#ffd166', '#5ef0c0', '#5eb8ff', '#b05eff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius + 4, padding: 4 }}
      >
        {body}
      </LinearGradient>
    );
  }

  // Bold: a hard offset shadow, which is the whole point of the style, so it is
  // drawn as a second slab rather than faked with elevation.
  if (face.hardShadow) {
    return (
      <View>
        <View
          style={{
            position: 'absolute',
            left: 9,
            top: 10,
            right: -9,
            bottom: -10,
            borderRadius: radius,
            backgroundColor: face.hardShadow,
          }}
        />
        {body}
      </View>
    );
  }

  return body;
}

export default FlashcardFace;

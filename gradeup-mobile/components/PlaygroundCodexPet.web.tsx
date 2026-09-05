import React, { useEffect, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

/** Shared Codex / Petdex spritesheet layout (mirrors PlaygroundCodexPet.tsx). */
export const CODEX_PET_ATLAS = {
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  animations: {
    idle: { row: 0, frames: 6, frameDurations: [280, 110, 110, 140, 140, 320] },
    'running-right': { row: 1, frames: 8, frameDurations: [120, 120, 120, 120, 120, 120, 120, 220] },
    'running-left': { row: 2, frames: 8, frameDurations: [120, 120, 120, 120, 120, 120, 120, 220] },
    waving: { row: 3, frames: 4, frameDurations: [140, 140, 140, 280] },
    jumping: { row: 4, frames: 5, frameDurations: [140, 140, 140, 140, 280] },
    failed: { row: 5, frames: 8, frameDurations: [140, 140, 140, 140, 140, 140, 140, 240] },
    waiting: { row: 6, frames: 6, frameDurations: [150, 150, 150, 150, 150, 260] },
    running: { row: 7, frames: 6, frameDurations: [120, 120, 120, 120, 120, 220] },
    review: { row: 8, frames: 6, frameDurations: [150, 150, 150, 150, 150, 280] },
  },
} as const;

export type CodexPetAnimationName = keyof typeof CODEX_PET_ATLAS.animations;

export const ACIDLING_SPRITE_URL =
  'https://pub-94495283df974cfea5e98d6a9e3fa462.r2.dev/pets/acidling-2bd6aa6eeade/sprite.webp';

export const NOIR_WEBLING_SPRITE_URL =
  'https://pub-94495283df974cfea5e98d6a9e3fa462.r2.dev/curated/noir-webling/spritesheet.webp';

export const DIO_CAT_SPRITE_URL =
  'https://pub-94495283df974cfea5e98d6a9e3fa462.r2.dev/pets/dio-9cd915e4fa61/sprite.webp';

type Props = {
  style?: StyleProp<ViewStyle>;
  spriteUri: string;
  animation: CodexPetAnimationName;
  size?: number;
};

/**
 * Web spritesheet pet. Renders a DOM `<div>` (react-native-web outputs DOM) and
 * steps the background-position to animate frames, replacing the native WebView
 * implementation in PlaygroundCodexPet.tsx.
 */
export function PlaygroundCodexPet({ style, spriteUri, animation, size = 120 }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    const atlas = CODEX_PET_ATLAS;
    const a = atlas.animations[animation] ?? atlas.animations.idle;
    const cw = atlas.cellWidth;
    const ch = atlas.cellHeight;
    const scale = Math.min(size / cw, size / ch);
    const fw = cw * scale;
    const fh = ch * scale;
    const bw = atlas.columns * cw * scale;
    const bh = atlas.rows * ch * scale;

    el.style.width = `${fw}px`;
    el.style.height = `${fh}px`;
    el.style.backgroundImage = `url("${spriteUri}")`;
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = `${bw}px ${bh}px`;
    (el.style as any).imageRendering = 'pixelated';

    let frameIndex = 0;
    const applyFrame = () => {
      el.style.backgroundPosition = `${-frameIndex * fw}px ${-a.row * fh}px`;
    };
    const tick = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const dur = a.frameDurations[frameIndex] || a.frameDurations[a.frameDurations.length - 1] || 150;
      timerRef.current = setTimeout(() => {
        frameIndex = (frameIndex + 1) % a.frames;
        applyFrame();
        tick();
      }, dur);
    };
    applyFrame();
    tick();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [spriteUri, animation, size]);

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]} pointerEvents="none">
      <div ref={frameRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});

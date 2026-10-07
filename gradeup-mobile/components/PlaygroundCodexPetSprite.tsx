/**
 * Draws a Codex spritesheet pet natively, with no WebView.
 *
 * ── Why this exists ──
 * The timetable's premium pet used to be a WebView: a whole browser engine,
 * its own process on Android, tens of megabytes of memory, loading an HTML
 * document that did nothing but step a background-position. It is the most
 * expensive way React Native offers to move a picture, and it sat on the
 * screen students look at most.
 *
 * This does the same job with two Views and an Image. The spritesheet is the
 * same remote WebP, the frame durations are the same numbers, and the maths is
 * the same maths the HTML did — so the pet looks and moves exactly as before.
 *
 * ── Why not a GIF ──
 * A GIF would also have been lighter than the WebView, but it is the wrong
 * format: 256 colours and 1-bit transparency, which gives a hard jagged edge
 * around anything drawn over the timetable grid. A spritesheet keeps full
 * alpha, holds every animation in one file, and lets the app choose which
 * clip to play — a GIF plays one loop and nothing else.
 */
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { CODEX_PET_ATLAS, type CodexPetAnimationName } from '@/components/PlaygroundCodexPet';

type Props = {
  style?: StyleProp<ViewStyle>;
  /** Remote spritesheet URL (webp). */
  spriteUri: string;
  animation: CodexPetAnimationName;
  /** Viewport size in points; the sheet scales to fit. */
  size?: number;
};

export function PlaygroundCodexPetSprite({ style, spriteUri, animation, size = 120 }: Props) {
  const [frameIndex, setFrameIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const atlas = CODEX_PET_ATLAS;
  const clip = atlas.animations[animation] ?? atlas.animations.idle;

  /**
   * Fit a cell into the viewport, exactly as the old HTML did:
   * scale = min(viewport / cellWidth, viewport / cellHeight).
   *
   * The cells are 192x208, so on a square viewport the height is what binds
   * and a frame comes out narrower than it is tall. Keeping the same rule
   * rather than a tidier one is deliberate — a different fit would move the
   * pet by a few points and change a layout nobody asked to change.
   */
  const scale = Math.min(size / atlas.cellWidth, size / atlas.cellHeight);
  const frameW = atlas.cellWidth * scale;
  const frameH = atlas.cellHeight * scale;
  const sheetW = atlas.columns * atlas.cellWidth * scale;
  const sheetH = atlas.rows * atlas.cellHeight * scale;

  // Restart from the first frame whenever the clip changes, so a pet that
  // starts running does not begin halfway through the run.
  useEffect(() => {
    setFrameIndex(0);
  }, [animation]);

  useEffect(() => {
    const durations = clip.frameDurations as readonly number[];
    const delay = durations[frameIndex] ?? durations[durations.length - 1] ?? 150;
    timer.current = setTimeout(() => {
      setFrameIndex((i) => (i + 1 >= clip.frames ? 0 : i + 1));
    }, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [frameIndex, clip]);

  return (
    <View style={[{ width: size, height: size }, styles.wrap, style]} pointerEvents="none">
      {/* The window on to one cell. The sheet behind it is shifted so the cell
          we want lands in the window — the same trick as a CSS sprite. */}
      <View style={[styles.window, { width: frameW, height: frameH }]}>
        <Image
          source={{ uri: spriteUri }}
          style={{
            position: 'absolute',
            width: sheetW,
            height: sheetH,
            left: -frameIndex * frameW,
            top: -clip.row * frameH,
          }}
          contentFit="fill"
          // The sheet is fetched once and kept. Without this the pet would
          // re-request it every time the timetable remounts.
          cachePolicy="memory-disk"
          // No fade. A transition would play on the first paint of every
          // frame change and the pet would flicker as it walked.
          transition={0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: 'transparent' },
  window: { overflow: 'hidden', backgroundColor: 'transparent' },
});

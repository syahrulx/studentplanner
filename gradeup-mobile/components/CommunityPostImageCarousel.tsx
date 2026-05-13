import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';

type NaturalDims = { w: number; h: number } | null;

function boxHeightForDims(screenW: number, screenH: number, d: NaturalDims): number {
  const maxH = screenH * 0.88;
  const fallback = screenW;
  if (!d || d.w < 1 || d.h < 1) return fallback;
  const natural = screenW * (d.h / d.w);
  return Math.min(natural, maxH);
}

/**
 * Full-width post images without cropping: uses the bitmap's natural aspect
 * ratio (from onLoad) and `resizeMode="contain"` so portrait posters and
 * landscape photos both show in full. Very tall images are capped to ~88% of
 * the screen height with letterboxing on the sides inside the box.
 */
export function CommunityPostImageCarousel({ images }: { images: string[] }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [dims, setDims] = useState<NaturalDims[]>(() => images.map(() => null));
  const [activeIndex, setActiveIndex] = useState(0);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const imagesKey = images.join('|');
  useEffect(() => {
    setDims(images.map(() => null));
    setActiveIndex(0);
  }, [imagesKey, images.length]);

  const onImageLoad = useCallback((index: number, w: number, h: number) => {
    if (!w || !h) return;
    setDims((prev) => {
      const len = imagesRef.current.length;
      if (index >= len) return prev;
      const next: NaturalDims[] = Array.from({ length: len }, (_, j) =>
        j < prev.length ? prev[j] : null,
      );
      next[index] = { w, h };
      return next;
    });
  }, []);

  const perSlideHeights = useMemo(
    () => images.map((_, i) => boxHeightForDims(screenW, screenH, dims[i] ?? null)),
    [images, dims, screenW, screenH],
  );

  const carouselHeight = useMemo(() => {
    if (images.length <= 1) return perSlideHeights[0] ?? screenW;
    return Math.max(...perSlideHeights, screenW * 0.55);
  }, [images.length, perSlideHeights, screenW]);

  if (!images.length) return null;

  if (images.length === 1) {
    const h = perSlideHeights[0] ?? screenW;
    return (
      <View style={{ width: screenW, height: h, backgroundColor: '#111' }}>
        <Image
          source={{ uri: images[0] }}
          style={{ width: screenW, height: h }}
          resizeMode="contain"
          onLoad={(e) => {
            const s = e.nativeEvent.source;
            const w = typeof s?.width === 'number' ? s.width : 0;
            const h0 = typeof s?.height === 'number' ? s.height : 0;
            if (w > 0 && h0 > 0) onImageLoad(0, w, h0);
          }}
        />
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ height: carouselHeight }}
        onScroll={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / screenW);
          setActiveIndex(idx);
        }}
        scrollEventThrottle={32}
      >
        {images.map((uri, i) => (
          <View
            key={`${i}-${uri}`}
            style={{
              width: screenW,
              height: carouselHeight,
              backgroundColor: '#111',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Image
              source={{ uri }}
              style={{ width: screenW, height: carouselHeight }}
              resizeMode="contain"
              onLoad={(e) => {
                const s = e.nativeEvent.source;
                const w = typeof s?.width === 'number' ? s.width : 0;
                const h0 = typeof s?.height === 'number' ? s.height : 0;
                if (w > 0 && h0 > 0) onImageLoad(i, w, h0);
              }}
            />
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {images.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  dot: { borderRadius: 4 },
  dotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0A84FF',
  },
  dotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(150,150,150,0.4)',
  },
});

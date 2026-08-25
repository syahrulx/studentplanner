import { useCallback, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

/**
 * The home hero: Recommended today and Today's focus as one swipeable card
 * instead of two stacked sections.
 *
 * Pages are supplied by the caller, already styled. A single page renders with
 * no dots and no horizontal scrolling, which matters because the
 * recommendation is frequently absent (it returns null once the user accepts
 * or dismisses one that day) — the hero must not look like a broken carousel
 * with one empty slide.
 */
export function HomeHeroCarousel({
  pages,
  dotColor,
  dotActiveColor,
  horizontalMargin = 20,
  header,
  footer,
}: {
  pages: React.ReactNode[];
  dotColor: string;
  dotActiveColor: string;
  /** Must match the surrounding section margin so pages line up with the page gutter. */
  horizontalMargin?: number;
  /** Fixed slots may react to the selected page without moving with it. */
  header?: React.ReactNode | ((index: number) => React.ReactNode);
  footer?: React.ReactNode | ((index: number) => React.ReactNode);
}) {
  const { width } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const lastIndex = useRef(0);
  // A page is the full screen width with the gutter *inside* it. Insetting the
  // scroll content instead would leave a sliver of the neighbouring page
  // showing at the screen edge, with its text clipped mid-word.
  // On phones the carousel fills the screen. On tablets it can also live in a
  // dashboard column, so measure the actual container instead of always
  // snapping by the full window width.
  const pageWidth = Math.max(1, measuredWidth || width);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    if (next !== lastIndex.current) {
      lastIndex.current = next;
      setIndex(next);
    }
  }, [pageWidth]);

  const visible = pages.filter(Boolean);
  if (visible.length === 0) return null;
  const fixedHeader = typeof header === 'function' ? header(index) : header;
  const fixedFooter = typeof footer === 'function' ? footer(index) : footer;

  // One page: render it plainly. A paging ScrollView here would add scroll
  // handling and a stray dot for no reason.
  if (visible.length === 1) {
    return (
      <View>
        {fixedHeader}
        <View style={{ marginHorizontal: horizontalMargin }}>{visible[0]}</View>
        {fixedFooter}
      </View>
    );
  }

  return (
    <View onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}>
      {fixedHeader}
      {/* Deliberately not `pagingEnabled`: that snaps to the ScrollView's own
          width (the full screen), but a page here is the screen minus both
          gutters, so the two fight and every swipe drifts. snapToInterval is
          the correct pairing when the content is inset. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={pageWidth}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {visible.map((page, pageIndex) => (
          <View key={pageIndex} style={{ width: pageWidth, paddingHorizontal: horizontalMargin }}>
            {page}
          </View>
        ))}
      </ScrollView>

      {fixedFooter}

      <View style={styles.dots}>
        {visible.map((_, dotIndex) => (
          <View
            key={dotIndex}
            style={[
              styles.dot,
              dotIndex === index
                ? { width: 18, backgroundColor: dotActiveColor }
                : { backgroundColor: dotColor },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

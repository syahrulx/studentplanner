import { View, StyleSheet } from 'react-native';

type Corner = 'bottom-right' | 'bottom-left' | 'top-left' | 'top-right';

type Props = {
  /** Stroke colour for rings and spokes (include alpha). */
  lineColor: string;
  /** Overall footprint; anchored to a corner of the parent. */
  size?: number;
  /** Number of radial spokes (ignored when `organic` spokes are used). */
  spokes?: number;
  /** Which corner the web sits in (center of web near that corner). */
  corner?: Corner;
  /**
   * Irregular ring spacing + uneven spoke angles — reads as cobweb, not radar.
   * @default false
   */
  organic?: boolean;
};

const ANCHOR_INSET = 4;

function cornerStyleFor(corner: Corner) {
  switch (corner) {
    case 'bottom-right':
      return { right: -ANCHOR_INSET, bottom: -ANCHOR_INSET };
    case 'bottom-left':
      return { left: -ANCHOR_INSET, bottom: -ANCHOR_INSET };
    case 'top-left':
      return { left: -ANCHOR_INSET, top: -ANCHOR_INSET };
    case 'top-right':
      return { right: -ANCHOR_INSET, top: -ANCHOR_INSET };
    default:
      return { right: -ANCHOR_INSET, bottom: -ANCHOR_INSET };
  }
}

/** Uneven angles so spokes are not perfectly radial like Mono/radar UI. */
const ORGANIC_SPOKE_DEG = [8, 34, 61, 88, 119, 156, 198, 241, 283, 322];

/**
 * Decorative cobweb for dark “Spider” theme cards — View-only (no SVG).
 * Corner-anchored so copy and week dots stay readable.
 */
export function SpiderWebPulseBackground({
  lineColor,
  size = 228,
  spokes = 10,
  corner = 'bottom-right',
  organic = false,
}: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 4;
  const ringFactors = organic
    ? [1, 0.78, 0.58, 0.42, 0.26, 0.13]
    : [1, 0.82, 0.64, 0.46, 0.3, 0.16];
  const spokeDegs = organic
    ? ORGANIC_SPOKE_DEG.slice(0, Math.min(spokes, ORGANIC_SPOKE_DEG.length))
    : Array.from({ length: spokes }, (_, i) => (360 / spokes) * i);

  const cornerStyle = cornerStyleFor(corner);

  return (
    <View
      style={[
        styles.anchor,
        { width: size, height: size },
        cornerStyle,
        organic && { transform: [{ rotate: '11deg' }] },
      ]}
      pointerEvents="none"
    >
      {ringFactors.map((factor, i) => {
        const diameter = size * factor;
        return (
          <View
            key={`ring-${i}`}
            style={{
              position: 'absolute',
              left: (size - diameter) / 2,
              top: (size - diameter) / 2,
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: lineColor,
              opacity: organic ? 0.38 + i * 0.1 : 0.4 + i * 0.09,
            }}
          />
        );
      })}
      {spokeDegs.map((deg, i) => (
        <View
          key={`spoke-${i}`}
          style={{
            position: 'absolute',
            left: cx - StyleSheet.hairlineWidth,
            top: cy - maxR,
            width: StyleSheet.hairlineWidth * 2,
            height: maxR * 2,
            backgroundColor: lineColor,
            opacity: organic ? 0.62 : 0.72,
            transform: [{ rotate: `${deg}deg` }],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
  },
});

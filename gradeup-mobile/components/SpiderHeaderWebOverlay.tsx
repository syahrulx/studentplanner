import { View, StyleSheet, Image } from 'react-native';

/**
 * Full-bleed cobweb behind the home header for Spider pack — replaces Mono glitch bands.
 */
export function SpiderHeaderWebOverlay() {
  return (
    <View style={styles.fill} pointerEvents="none">
      <Image
        source={require('../assets/spider-header-web.png')}
        style={styles.topLeftWeb}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  topLeftWeb: {
    position: 'absolute',
    top: -3,
    left: -16,
    width: 332,
    height: 236,
    opacity: 0.20,
    tintColor: '#f3f4f6',
  },
});

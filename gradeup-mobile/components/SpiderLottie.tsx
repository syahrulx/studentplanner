import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Spider animation from LottieFiles (free “Spider” by Priyanshu) —
 * same WebView + bodymovin pipeline as {@link CatLottie} for Expo compatibility.
 * @see https://lottiefiles.com/free-animation/spider-LiNoYXFrd9
 */
type SpiderLottieProps = {
  style?: StyleProp<ViewStyle>;
  variant?: 'badge' | 'loading' | 'net' | 'communityLine';
};

const SPIDER_JSON = require('../assets/spider.json');
const SPIDER_JSON_STRING = JSON.stringify(SPIDER_JSON).replace(/</g, '\\u003c');
const SPIDER_LOADER_JSON = require('../assets/spider-loader.json');
const SPIDER_LOADER_JSON_STRING = JSON.stringify(SPIDER_LOADER_JSON).replace(/</g, '\\u003c');
const SPIDER_NET_JSON = require('../assets/spider-net.json');
const SPIDER_NET_JSON_STRING = JSON.stringify(SPIDER_NET_JSON).replace(/</g, '\\u003c');
const SPIDER_COMMUNITY_LINE_JSON = require('../assets/spider-community-line.json');
const SPIDER_COMMUNITY_LINE_JSON_STRING = JSON.stringify(SPIDER_COMMUNITY_LINE_JSON).replace(/</g, '\\u003c');

function buildHtml(
  animationJson: string,
  speed: number,
  multiply = false,
  renderer: 'svg' | 'canvas' = 'svg',
) {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
      }
      #anim {
        width: 100%;
        height: 100%;
      }
      #anim svg {
        ${multiply ? 'mix-blend-mode: multiply;' : ''}
      }
    </style>
  </head>
  <body>
    <div id="anim"></div>
    <script>
      const animationData = ${animationJson};
      const anim = lottie.loadAnimation({
        container: document.getElementById('anim'),
        renderer: '${renderer}',
        loop: true,
        autoplay: true,
        animationData,
      });
      anim.setSpeed(${speed});
    </script>
  </body>
</html>`;
}

const SPIDER_HTML = buildHtml(SPIDER_JSON_STRING, 0.88);
// Loading: canvas renderer is lighter than SVG for this heavy JSON.
const SPIDER_LOADING_HTML = buildHtml(SPIDER_LOADER_JSON_STRING, 0.9, false, 'canvas');
const SPIDER_NET_HTML = buildHtml(SPIDER_NET_JSON_STRING, 0.4, false);
const SPIDER_COMMUNITY_LINE_HTML = buildHtml(SPIDER_COMMUNITY_LINE_JSON_STRING, 0.55, false);

export function SpiderLottie({ style, variant = 'badge' }: SpiderLottieProps) {
  const html =
    variant === 'loading'
      ? SPIDER_LOADING_HTML
      : variant === 'net'
      ? SPIDER_NET_HTML
      : variant === 'communityLine'
      ? SPIDER_COMMUNITY_LINE_HTML
      : SPIDER_HTML;
  return (
    <View style={[styles.wrap, variant === 'net' && styles.netWrap, style]} pointerEvents="none">
      <WebView
        source={{ html }}
        originWhitelist={['*']}
        style={styles.webview}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 88,
    height: 72,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  netWrap: {
    width: '100%',
    height: '100%',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

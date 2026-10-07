import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { LOTTIE_PLAYER_SOURCE } from '@/components/lottiePlayerSource';

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
    <script>${LOTTIE_PLAYER_SOURCE}</script>
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

/**
 * Built on first use, then kept.
 *
 * These four used to be built at import time. spider-loader.json alone is
 * 399 KB, and it was stringified and pasted into a document on every app
 * start whether or not a spider was ever drawn.
 */
const HTML_CACHE = new Map<string, string>();

function htmlFor(variant: NonNullable<SpiderLottieProps['variant']>): string {
  const cached = HTML_CACHE.get(variant);
  if (cached) return cached;
  const built =
    variant === 'loading'
      // Canvas renderer: lighter than SVG for this heavy JSON.
      ? buildHtml(SPIDER_LOADER_JSON_STRING, 0.9, false, 'canvas')
      : variant === 'net'
      ? buildHtml(SPIDER_NET_JSON_STRING, 0.4, false)
      : variant === 'communityLine'
      ? buildHtml(SPIDER_COMMUNITY_LINE_JSON_STRING, 0.55, false)
      : buildHtml(SPIDER_JSON_STRING, 0.88);
  HTML_CACHE.set(variant, built);
  return built;
}

export function SpiderLottie({ style, variant = 'badge' }: SpiderLottieProps) {
  const html = htmlFor(variant);
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

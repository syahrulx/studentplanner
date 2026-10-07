import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { LOTTIE_PLAYER_SOURCE } from '@/components/lottiePlayerSource';

type CatLottieProps = {
  style?: StyleProp<ViewStyle>;
  variant?: 'badge' | 'loading' | 'task' | 'monoLoading';
};

const BAD_CAT_JSON = require('../assets/bad-cat.json');
const BAD_CAT_JSON_STRING = JSON.stringify(BAD_CAT_JSON).replace(/</g, '\\u003c');
const LOADING_CAT_JSON = require('../assets/loading-cat.json');
const LOADING_CAT_JSON_STRING = JSON.stringify(LOADING_CAT_JSON).replace(/</g, '\\u003c');
const TASK_CAT_JSON = require('../assets/task-cat.json');
const TASK_CAT_JSON_STRING = JSON.stringify(TASK_CAT_JSON).replace(/</g, '\\u003c');
const MONO_LOADING_JSON = require('../assets/mono-loader.json');
const MONO_LOADING_JSON_STRING = JSON.stringify(MONO_LOADING_JSON).replace(/</g, '\\u003c');

function buildHtml(animationJson: string, speed: number) {
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
    </style>
  </head>
  <body>
    <div id="anim"></div>
    <script>
      const animationData = ${animationJson};
      const anim = lottie.loadAnimation({
        container: document.getElementById('anim'),
        renderer: 'svg',
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
 * These four documents used to be built at import time — stringifying every
 * animation and pasting the player beside each one, on every app start,
 * whether or not a cat was ever drawn. Now a variant costs nothing until
 * something asks for it, and nothing the second time.
 */
const HTML_CACHE = new Map<string, string>();

function htmlFor(variant: NonNullable<CatLottieProps['variant']>): string {
  const cached = HTML_CACHE.get(variant);
  if (cached) return cached;
  const built =
    variant === 'loading'
      ? buildHtml(LOADING_CAT_JSON_STRING, 1)
      : variant === 'task'
      ? buildHtml(TASK_CAT_JSON_STRING, 0.9)
      : variant === 'monoLoading'
      ? buildHtml(MONO_LOADING_JSON_STRING, 1)
      : buildHtml(BAD_CAT_JSON_STRING, 0.65);
  HTML_CACHE.set(variant, built);
  return built;
}

export function CatLottie({ style, variant = 'badge' }: CatLottieProps) {
  const html = htmlFor(variant);
  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
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
    width: 72,
    height: 52,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

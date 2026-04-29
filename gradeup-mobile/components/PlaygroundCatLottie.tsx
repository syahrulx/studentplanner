import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

type PlaygroundCatLottieProps = {
  style?: StyleProp<ViewStyle>;
};

const CAT_PLAYGROUND_JSON = require('../assets/cat-playground.json');
const CAT_PLAYGROUND_JSON_STRING = JSON.stringify(CAT_PLAYGROUND_JSON).replace(/</g, '\\u003c');

function buildHtml(animationJson: string, speed: number) {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
      #anim { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="anim"></div>
    <script>
      const animationData = ${animationJson};
      const anim = lottie.loadAnimation({
        container: document.getElementById('anim'),
        renderer: 'canvas',
        loop: true,
        autoplay: true,
        animationData,
      });
      anim.setSpeed(${speed});
    </script>
  </body>
</html>`;
}

const CAT_PLAYGROUND_HTML = buildHtml(CAT_PLAYGROUND_JSON_STRING, 0.95);

export function PlaygroundCatLottie({ style }: PlaygroundCatLottieProps) {
  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <WebView
        source={{ html: CAT_PLAYGROUND_HTML }}
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
    width: 30,
    height: 30,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

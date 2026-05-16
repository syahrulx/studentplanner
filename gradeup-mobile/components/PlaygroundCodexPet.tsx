import React, { useEffect, useMemo, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

/** Shared Codex / Petdex spritesheet layout (same as codex-pets-react `codexPetAtlas`). */
export const CODEX_PET_ATLAS = {
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208,
  animations: {
    idle: {
      row: 0,
      frames: 6,
      frameDurations: [280, 110, 110, 140, 140, 320],
    },
    'running-right': {
      row: 1,
      frames: 8,
      frameDurations: [120, 120, 120, 120, 120, 120, 120, 220],
    },
    'running-left': {
      row: 2,
      frames: 8,
      frameDurations: [120, 120, 120, 120, 120, 120, 120, 220],
    },
    waving: {
      row: 3,
      frames: 4,
      frameDurations: [140, 140, 140, 280],
    },
    jumping: {
      row: 4,
      frames: 5,
      frameDurations: [140, 140, 140, 140, 280],
    },
    failed: {
      row: 5,
      frames: 8,
      frameDurations: [140, 140, 140, 140, 140, 140, 140, 240],
    },
    waiting: {
      row: 6,
      frames: 6,
      frameDurations: [150, 150, 150, 150, 150, 260],
    },
    running: {
      row: 7,
      frames: 6,
      frameDurations: [120, 120, 120, 120, 120, 220],
    },
    review: {
      row: 8,
      frames: 6,
      frameDurations: [150, 150, 150, 150, 150, 280],
    },
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
  /** Remote spritesheet URL (webp). */
  spriteUri: string;
  /** Active clip animation (Codex atlas row). */
  animation: CodexPetAnimationName;
  /** Viewport size in px (spritesheet scales to fit). Default matches cat playground. */
  size?: number;
};

function buildHtml(spriteUrl: string, atlasJson: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
    #viewport {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
    }
    #frame {
      background-repeat: no-repeat;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
  </style>
</head>
<body>
  <div id="viewport"><div id="frame"></div></div>
  <script>
    var atlas = ${atlasJson};
    var spriteUrl = ${JSON.stringify(spriteUrl)};
    var timer = null;
    var frameIndex = 0;
    var mode = 'loop';
    var animName = 'idle';

    var vp = document.getElementById('viewport');
    var frame = document.getElementById('frame');

    function layout() {
      var cw = atlas.cellWidth;
      var ch = atlas.cellHeight;
      var bw = atlas.columns * cw;
      var bh = atlas.rows * ch;
      var vw = vp.clientWidth || 120;
      var vh = vp.clientHeight || 120;
      var scale = Math.min(vw / cw, vh / ch);
      var fw = cw * scale;
      var fh = ch * scale;
      frame.style.width = fw + 'px';
      frame.style.height = fh + 'px';
      frame.style.backgroundImage = 'url("' + spriteUrl + '")';
      frame.style.backgroundRepeat = 'no-repeat';
      frame.style.backgroundSize = (bw * scale) + 'px ' + (bh * scale) + 'px';
      applyFrame();
    }

    function applyFrame() {
      var a = atlas.animations[animName];
      if (!a) return;
      var cw = atlas.cellWidth;
      var ch = atlas.cellHeight;
      var bw = atlas.columns * cw;
      var bh = atlas.rows * ch;
      var vw = vp.clientWidth || 120;
      var vh = vp.clientHeight || 120;
      var scale = Math.min(vw / cw, vh / ch);
      var fw = cw * scale;
      var fh = ch * scale;
      var bx = -frameIndex * fw;
      var by = -a.row * fh;
      frame.style.backgroundPosition = bx + 'px ' + by + 'px';
    }

    function tick() {
      clearTimeout(timer);
      var a = atlas.animations[animName];
      if (!a) return;
      var dur = a.frameDurations[frameIndex] || a.frameDurations[a.frameDurations.length - 1] || 150;
      timer = setTimeout(function() {
        frameIndex++;
        if (frameIndex >= a.frames) {
          if (mode === 'once') {
            frameIndex = Math.max(0, a.frames - 1);
            applyFrame();
            return;
          }
          frameIndex = 0;
        }
        applyFrame();
        tick();
      }, dur);
    }

    function setAnim(name, loopMode) {
      animName = name in atlas.animations ? name : 'idle';
      mode = loopMode || 'loop';
      frameIndex = 0;
      layout();
      tick();
    }

    window.__RN_SET_ANIM = function(name, loopMode) {
      setAnim(name, loopMode || 'loop');
    };

    window.addEventListener('resize', layout);
    setAnim('idle', 'loop');
  </script>
</body>
</html>`;
}

const ATLAS_JSON = JSON.stringify(CODEX_PET_ATLAS);

/**
 * Renders a Codex/Petdex-style spritesheet pet (e.g. Acidling) for the timetable playground.
 */
export function PlaygroundCodexPet({ style, spriteUri, animation, size = 120 }: Props) {
  const webRef = useRef<WebView>(null);
  const html = useMemo(() => buildHtml(spriteUri, ATLAS_JSON), [spriteUri]);

  useEffect(() => {
    const js = `(function(){ if(window.__RN_SET_ANIM) window.__RN_SET_ANIM(${JSON.stringify(animation)}, 'loop'); })(); true;`;
    webRef.current?.injectJavaScript(js);
  }, [animation]);

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]} pointerEvents="none">
      <WebView
        ref={webRef}
        source={{ html }}
        originWhitelist={['*']}
        style={styles.webview}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        onLoadEnd={() => {
          const js = `(function(){ if(window.__RN_SET_ANIM) window.__RN_SET_ANIM(${JSON.stringify(animation)}, 'loop'); })(); true;`;
          webRef.current?.injectJavaScript(js);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

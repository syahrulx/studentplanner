import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { latexToUnicode } from '@/src/lib/mathText';

/**
 * A display-maths block rendered with KaTeX.
 *
 * Only `$$...$$` blocks come here. Inline maths is converted to Unicode in
 * `mathText`, because a paragraph containing five formulas would otherwise need
 * five WebViews and a list of those does not scroll.
 *
 * KaTeX loads from a CDN rather than the bundle: the library plus its fonts is
 * around 300KB, which every student would carry whether or not they study a
 * subject with maths in it. The WebView caches it after the first load. When it
 * cannot load at all, the block falls back to the same Unicode form used
 * inline, so a student offline still reads the formula rather than raw LaTeX.
 */

const KATEX_VERSION = '0.16.22';
const KATEX_ORIGIN = 'https://cdn.jsdelivr.net';
const KATEX_CSS = `${KATEX_ORIGIN}/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
const KATEX_JS = `${KATEX_ORIGIN}/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;

/** Give up and show the Unicode form rather than leaving a blank gap. */
const LOAD_TIMEOUT_MS = 6000;

/** Shrink a wide formula this far to fit, but no further: below it the text
 *  stops being readable and panning is the better trade. */
const MIN_SCALE = 0.5;

/**
 * The chat pads 20 each side, a bubble takes at most 85% of what is left, and
 * the bubble itself pads 16. The block needs a real number: a percentage width
 * collapses here, because the bubble sizes itself to its children and a child
 * asking for "100% of the parent" gives it nothing to measure.
 */
function blockWidth(screenWidth: number): number {
  return Math.max(160, Math.round((screenWidth - 40) * 0.85) - 32);
}

interface MathBlockProps {
  latex: string;
  color: string;
  backgroundColor: string;
  fontSize?: number;
  /**
   * Show the plain form without starting a WebView. Used while an answer is
   * still streaming: the expression is still growing, so a WebView started now
   * would be thrown away on the next token.
   */
  plain?: boolean;
}

function buildHtml(latex: string, color: string, fontSize: number): string {
  // The expression travels as JSON so a backslash or quote cannot break out of
  // the script and turn a formula into executable code.
  const payload = JSON.stringify(latex);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${KATEX_CSS}" onerror="fail()" />
<style>
  html, body {
    margin: 0; padding: 0; background: transparent;
    color: ${color}; font-size: ${fontSize}px;
    overflow-x: auto; overflow-y: hidden;
  }
  #root { padding: 2px 0; transform-origin: center top; }
  .katex { color: ${color}; }
  .katex-display { margin: 0; }
</style>
</head>
<body>
<div id="root"></div>
<script>
  var done = false;
  function post(msg) {
    if (done) return;
    done = true;
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  function fail() { post({ status: 'failed' }); }
  function render() {
    try {
      if (!window.katex) return fail();
      window.katex.render(${payload}, document.getElementById('root'), {
        displayMode: true,
        throwOnError: false,
        output: 'html',
      });
      // Measured after layout, so the block is sized to the formula rather
      // than to a guess.
      requestAnimationFrame(function () {
        var root = document.getElementById('root');
        var drawn = root.querySelector('.katex-html') || root.querySelector('.katex') || root;
        var formulaWidth = drawn.getBoundingClientRect().width;
        var available = root.clientWidth;

        // A long derivation step is wider than a phone. Shrink it to fit
        // rather than letting it bleed over the edge of the bubble. Past
        // MIN_SCALE the text would be too small to read, so it is left at
        // that size and the block scrolls sideways instead.
        var scale = 1;
        var scrollable = false;
        if (formulaWidth > available && available > 0) {
          scale = available / formulaWidth;
          if (scale < ${MIN_SCALE}) { scale = ${MIN_SCALE}; scrollable = true; }
          root.style.transform = 'scale(' + scale + ')';
        }

        var h = root.scrollHeight * scale;
        post({ status: 'ok', height: Math.ceil(h) + 4, scrollable: scrollable });
      });
    } catch (e) {
      fail();
    }
  }
  setTimeout(fail, ${LOAD_TIMEOUT_MS});
</script>
<script src="${KATEX_JS}" onload="render()" onerror="fail()"></script>
</body>
</html>`;
}

function MathBlockView({ latex, color, backgroundColor, fontSize = 16, plain }: MathBlockProps) {
  const [height, setHeight] = useState(44);
  const [failed, setFailed] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const settledRef = useRef(false);
  const { width: screenWidth } = useWindowDimensions();

  // A new object literal for `source` on every render would make the WebView
  // reload, so it is memoised alongside the HTML it wraps. `baseUrl` matters:
  // iOS gives a bare HTML string a null origin and then refuses to fetch the
  // script and stylesheet, so without it KaTeX never arrives.
  const source = useMemo(
    () => ({ html: buildHtml(latex, color, fontSize), baseUrl: KATEX_ORIGIN }),
    [latex, color, fontSize],
  );
  const fallback = useMemo(() => latexToUnicode(latex), [latex]);

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    if (settledRef.current) return;
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        status: string;
        height?: number;
        scrollable?: boolean;
      };
      settledRef.current = true;
      if (msg.status === 'ok' && msg.height) {
        setHeight(Math.min(Math.max(msg.height, 28), 400));
        if (msg.scrollable) setScrollable(true);
      } else setFailed(true);
    } catch {
      settledRef.current = true;
      setFailed(true);
    }
  }, []);

  if (failed || plain) {
    return (
      <View style={[styles.fallbackWrap, { backgroundColor, width: blockWidth(screenWidth) }]}>
        {/* `latex` is the last resort: an expression the converter cannot read
            is still better on screen than an empty box. */}
        <Text style={[styles.fallbackText, { color, fontSize }]}>{fallback || latex}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height, width: blockWidth(screenWidth) }]}>
      <WebView
        originWhitelist={['*']}
        source={source}
        onMessage={onMessage}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        // Only the rare formula too wide even at the smallest readable size
        // gets its own gesture, and it pans sideways while the chat still
        // scrolls up and down.
        scrollEnabled={scrollable}
        showsHorizontalScrollIndicator={false}
        // The block sits inside a scrolling chat, so it must never take over
        // the gesture or paint its own background over the bubble.
        style={styles.webview}
        containerStyle={styles.webviewContainer}
        androidLayerType="software"
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled={false}
      />
    </View>
  );
}

/**
 * Memoised because the chat re-renders on every streamed token: without this,
 * every block in the transcript would rebuild while an unrelated answer arrives.
 */
export const MathBlock = React.memo(MathBlockView);

const styles = StyleSheet.create({
  wrap: { marginVertical: 6, overflow: 'hidden' },
  webview: { backgroundColor: 'transparent', flex: 1 },
  webviewContainer: { backgroundColor: 'transparent' },
  fallbackWrap: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, marginVertical: 6 },
  fallbackText: { fontWeight: '600', textAlign: 'center' },
});

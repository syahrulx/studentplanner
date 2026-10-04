import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { captureError } from './monitoring';

/**
 * Draws one PDF page inside a WebView, for platforms whose WebView cannot.
 *
 * Android's WebView has no PDF viewer. Handing it a .pdf shows a blank white
 * page — which is what every Android student with a PDF note saw, while their
 * handwriting drew fine on the transparent layer above it. The file was never
 * the problem, so deleting and re-uploading never helped.
 *
 * iOS is left alone. WKWebView renders PDFs natively, that path works today and
 * is what paying users are already using; swapping it for this would risk a
 * working feature to tidy up a code path.
 *
 * PDF.js is copied out of the bundle once per install and read from the cache
 * directory, rather than inlined into the HTML. Inlining would put ~1.7MB of
 * library into a string for every page held in memory at once.
 */

/** Cache folder holding the library and the generated viewer page. */
const VIEWER_DIR = `${FileSystem.cacheDirectory}rencana-pdfjs/`;
const LIB_NAME = 'pdf.min.mjs';
const WORKER_NAME = 'pdf.worker.min.mjs';
const VIEWER_NAME = 'viewer.html';

/**
 * Bumped when the viewer HTML below changes, so an install that already has the
 * old one writes the new one instead of serving a stale page forever.
 */
const VIEWER_VERSION = 1;
const STAMP_NAME = `v${VIEWER_VERSION}.stamp`;

/** True on the platforms whose WebView cannot draw a PDF by itself. */
export function needsPdfJsViewer(): boolean {
  return Platform.OS === 'android';
}

/**
 * The page.
 *
 * Every failure draws a message rather than returning white. The whole reason
 * this bug survived from July to October is that a failure here looked exactly
 * like a PDF with nothing on it, so nobody could tell a broken viewer from an
 * empty file. A visible line also gives a student something to put in a report.
 */
function viewerHtml(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body { margin: 0; padding: 0; background: #fff; overflow: hidden; }
  /* The canvas fills the width it is given; the app sizes the box to the page's
     aspect ratio, so height follows and the handwriting above stays aligned. */
  canvas { display: block; width: 100%; height: auto; }
  #err {
    display: none; padding: 14px 16px; font: 13px -apple-system, Roboto, sans-serif;
    color: #b91c1c; background: #fef2f2; white-space: pre-wrap; word-break: break-word;
  }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="err"></div>
<script type="module">
  const err = document.getElementById('err');
  function fail(where, detail) {
    err.style.display = 'block';
    err.textContent = 'Could not show this page (' + where + ').\\n' + detail;
    // Surfaces in the app's console and in onMessage, so a support report can
    // say which step failed instead of "it is white".
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pdf-error', where, detail: String(detail) }));
    }
  }
  window.addEventListener('error', (e) => fail('script', e.message));
  window.addEventListener('unhandledrejection', (e) => fail('load', e.reason && e.reason.message || e.reason));

  try {
    const pdfjs = await import('./${LIB_NAME}');
    pdfjs.GlobalWorkerOptions.workerSrc = './${WORKER_NAME}';

    // The file name travels in the hash so one viewer page serves every page of
    // every document, and nothing has to be rewritten per page.
    const file = decodeURIComponent(location.hash.slice(1));
    if (!file) throw new Error('no file given');

    const doc = await pdfjs.getDocument({ url: file, isEvalSupported: false }).promise;
    const page = await doc.getPage(1);

    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    // Render at the real pixel density so text is sharp when the student zooms
    // in, but cap it: a large page at 3x on a cheap phone runs out of memory.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = document.documentElement.clientWidth;
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = cssWidth + 'px';

    await page.render({ canvasContext: ctx, viewport }).promise;

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pdf-ready' }));
    }
  } catch (e) {
    fail('render', (e && e.message) || e);
  }
</script>
</body>
</html>`;
}

let ready: Promise<string | null> | null = null;

/**
 * Copy the library and write the viewer page, once per install.
 *
 * Returns the viewer's file URI, or null if anything could not be written — the
 * caller then leaves the WebView alone rather than pointing it at a page that
 * is not there.
 */
export function ensurePdfJsViewer(): Promise<string | null> {
  if (ready) return ready;
  ready = (async () => {
    try {
      const stamp = `${VIEWER_DIR}${STAMP_NAME}`;
      const viewer = `${VIEWER_DIR}${VIEWER_NAME}`;
      const already = await FileSystem.getInfoAsync(stamp);
      if (already.exists) return viewer;

      await FileSystem.makeDirectoryAsync(VIEWER_DIR, { intermediates: true }).catch(() => {});

      const lib = Asset.fromModule(require('../../assets/pdfjs/pdf.lib.pdfjs'));
      const worker = Asset.fromModule(require('../../assets/pdfjs/pdf.worker.pdfjs'));
      await Promise.all([lib.downloadAsync(), worker.downloadAsync()]);
      if (!lib.localUri || !worker.localUri) return null;

      // Copied under their real names: the viewer imports them by module path,
      // and the bespoke .pdfjs extension only exists to keep Metro's resolver
      // away from node_modules' own ESM.
      await FileSystem.copyAsync({ from: lib.localUri, to: `${VIEWER_DIR}${LIB_NAME}` });
      await FileSystem.copyAsync({ from: worker.localUri, to: `${VIEWER_DIR}${WORKER_NAME}` });
      await FileSystem.writeAsStringAsync(viewer, viewerHtml());
      await FileSystem.writeAsStringAsync(stamp, String(VIEWER_VERSION));
      return viewer;
    } catch (e) {
      // Say why. This used to fail silently and fall back to handing the
      // WebView the PDF directly, which on Android is the blank page this
      // whole file exists to fix — so a broken viewer looked exactly like the
      // bug, with nothing anywhere to tell the two apart.
      console.warn('[pdfjs] viewer could not be prepared:', e);
      captureError(e, { where: 'pdfPageViewer.ensure' });
      ready = null;
      return null;
    }
  })();
  return ready;
}

/** The viewer URI pointed at one page file. */
export function pdfViewerUriFor(viewerUri: string, pdfFileUri: string): string {
  return `${viewerUri}#${encodeURIComponent(pdfFileUri)}`;
}

/** The folder the WebView must be allowed to read on iOS, if ever used there. */
export const PDFJS_VIEWER_DIR = VIEWER_DIR;

import katex from 'katex';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { KATEX_CSS } from './katexAssets';
import type { MathViewProps } from './types';

/**
 * The math of a question on the phone.
 *
 * The phone has no HTML, so the math is drawn by KaTeX inside a `WebView`.
 * Everything is **local**: the KaTeX stylesheet (with its fonts) is inlined
 * in the page, so the math shows up without a network.
 *
 * The `WebView` never eats a touch: it sits inside the answer buttons, and
 * the buttons have to stay tappable.
 *
 * The height of the box follows the math: the page measures itself and
 * sends its height back to the app (`postMessage`).
 */
export function MathView({ source, displayMode, color, fontSize }: MathViewProps) {
  const [height, setHeight] = useState(Math.round(fontSize * 1.8));

  const html = useMemo(
    () => buildHtml(source, displayMode, color, fontSize),
    [source, displayMode, color, fontSize],
  );

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={(event) => {
          const measured = measure(event.nativeEvent.data);
          if (measured !== null) {
            setHeight(measured);
          }
        }}
      />
    </View>
  );
}

/** Reads the height the page sent back. */
function measure(data: string): number | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const value = (parsed as { height?: unknown }).height;
    return typeof value === 'number' && value > 0 ? Math.ceil(value) : null;
  } catch {
    return null;
  }
}

/**
 * Builds the page of the math.
 *
 * The page holds the KaTeX stylesheet (with the fonts inlined), the math
 * itself and the little script that measures the height of the content.
 */
function buildHtml(
  source: string,
  displayMode: boolean,
  color: string,
  fontSize: number,
): string {
  const body = katex.renderToString(source, {
    displayMode,
    throwOnError: false,
    output: 'htmlAndMathml',
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
<style>${KATEX_CSS}</style>
<style>
  html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
  body { color: ${color}; font-size: ${fontSize}px; line-height: 1.25; }
  .katex-display { margin: 0; }
</style>
</head>
<body>
${body}
<script>
  (function () {
    function send() {
      try {
        var doc = document.documentElement;
        // Math wider than the tile is scaled down to fit instead of clipped.
        document.body.style.zoom = '1';
        var wide = document.body.scrollWidth;
        var room = window.innerWidth;
        if (wide > room && room > 0) {
          document.body.style.zoom = String(Math.max(0.45, room / wide));
        }
        var box = document.body.getBoundingClientRect();
        var height = Math.ceil(Math.max(doc.scrollHeight, box.height));
        window.ReactNativeWebView.postMessage(JSON.stringify({ height: height }));
      } catch (error) {
        // The page is not ready yet: the next try will do.
      }
    }
    window.addEventListener('load', send);
    setTimeout(send, 20);
    setTimeout(send, 120);
    window.addEventListener('resize', send);
  })();
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  web: {
    backgroundColor: 'transparent',
    flex: 1,
  },
});

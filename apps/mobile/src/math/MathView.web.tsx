import katex from 'katex';
import { useEffect, useMemo } from 'react';
import { createElement } from 'react';

import { KATEX_CSS } from './katexAssets';
import type { MathViewProps } from './types';

/**
 * The math of a question in the browser.
 *
 * The browser can show the HTML of KaTeX directly, so there is no `WebView`
 * here: the math is a piece of HTML in the page.
 *
 * The stylesheet of KaTeX (with its fonts inlined) is put in the `<head>` of
 * the page once, so the math looks the same as on the phone.
 */
export function MathView({ source, displayMode, color, fontSize }: MathViewProps) {
  useEffect(() => {
    injectStyles();
  }, []);

  const html = useMemo(
    () =>
      katex.renderToString(source, {
        displayMode,
        throwOnError: false,
        output: 'htmlAndMathml',
      }),
    [source, displayMode],
  );

  return createElement('span', {
    dangerouslySetInnerHTML: { __html: html },
    style: {
      color,
      fontSize: `${fontSize}px`,
      lineHeight: 1.25,
      // Long math scrolls sideways inside its tile instead of being clipped.
      display: 'inline-block',
      maxWidth: '100%',
      overflowX: 'auto',
      overflowY: 'hidden',
      verticalAlign: 'middle',
    },
  });
}

/** `true` when the stylesheet of KaTeX is already in the page. */
let injected = false;

/** Puts the stylesheet of KaTeX in the page (once). */
function injectStyles(): void {
  if (injected || typeof document === 'undefined') {
    return;
  }

  const style = document.createElement('style');
  style.setAttribute('data-katex', 'cramcritters');
  style.textContent = KATEX_CSS;
  document.head.appendChild(style);
  injected = true;
}

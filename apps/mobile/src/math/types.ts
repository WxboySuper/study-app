/**
 * The props of the math renderer.
 *
 * The renderer is the piece that draws one piece of LaTeX. It has two
 * implementations: a `WebView` on the phone and plain HTML in the browser.
 */

/** The props of the math renderer. */
export interface MathViewProps {
  /** The LaTeX of the piece of math. */
  source: string;
  /** `true` for a block of math (`$$...$$`), `false` for an inline one. */
  displayMode: boolean;
  /** The colour of the math (it follows the text of the question). */
  color: string;
  /** The size of the math, in points. */
  fontSize: number;
}

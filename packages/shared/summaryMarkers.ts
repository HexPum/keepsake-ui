/**
 * Inline source markers the video-summary prompt (constructVideoSummaryPrompt
 * in prompts.ts) asks the model to wrap its own sentences in, tagging each
 * one as drawn from the video's caption or from its transcript. Stored
 * verbatim in the `summary` column — there is no separate structured field
 * for this, see CLAUDE.md's design-system note on the single free-text
 * `summary` string — so every other reader of that column (search indexing,
 * chat context, the public API, exports, admin debug views) needs to strip
 * these before the text is used for anything but the one dashboard preview
 * component that renders them as coloured spans.
 *
 * Mathematical white square brackets (U+27E6/U+27E7) rather than plain `[]`
 * or `<>`: virtually never appears in real prose or transcript output, so a
 * naive strip can't accidentally eat a sentence that legitimately contains
 * brackets.
 */

export type SummaryAspect = "caption" | "transcript";

const ASPECTS: readonly SummaryAspect[] = ["caption", "transcript"];

const MARKER_RE = new RegExp(`⟦(/?)(${ASPECTS.join("|")})⟧`, "g");

/** Removes marker syntax, keeping the text between tags untouched. Every
 *  reader of `summary` other than the one exception component should call
 *  this before displaying, indexing, or embedding the text. Overloaded so
 *  the return type mirrors the input's nullability exactly — callers read
 *  `summary` from both raw DB rows (`string | null`) and the API schema
 *  (`string | null | undefined`), and each should get back the same shape
 *  it passed in. */
export function stripSummaryMarkers(text: string): string;
export function stripSummaryMarkers(text: string | null): string | null;
export function stripSummaryMarkers(
  text: string | null | undefined,
): string | null | undefined;
export function stripSummaryMarkers(
  text: string | null | undefined,
): string | null | undefined {
  if (!text) return text;
  return text.replace(MARKER_RE, "");
}

export interface SummarySpan {
  /** Marker-free text for this run. */
  text: string;
  /** Which source this run was tagged as, or null for untagged text (every
   *  non-video summary, and any part a video summary left unwrapped). */
  aspect: SummaryAspect | null;
}

/**
 * Splits summary text into runs by the source markers, dropping the marker
 * syntax itself. A summary with no markers at all comes back as a single
 * `{ text, aspect: null }` span — safe to call unconditionally on any
 * summary, not just video ones.
 *
 * An unmatched close tag, or a close tag for a different aspect than the
 * one currently open, both just end whatever run is open; the model isn't
 * expected to track nesting, only to bracket its own sentences.
 */
export function splitSummaryByMarkers(
  text: string | null | undefined,
): SummarySpan[] {
  if (!text) return [];

  const spans: SummarySpan[] = [];
  let current: SummaryAspect | null = null;
  let lastIndex = 0;

  MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER_RE.exec(text))) {
    const [full, closing, aspect] = match;
    const chunk = text.slice(lastIndex, match.index);
    if (chunk) spans.push({ text: chunk, aspect: current });
    current = closing ? null : (aspect as SummaryAspect);
    lastIndex = match.index + full.length;
  }

  const rest = text.slice(lastIndex);
  if (rest) spans.push({ text: rest, aspect: current });

  return spans;
}

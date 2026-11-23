/**
 * Client-side highlighting for search-result rows. Meilisearch
 * (packages/plugins/search-meilisearch) is only ever asked for matching IDs
 * (`attributesToRetrieve: ["id"]`) — the content shown is always re-fetched
 * from the DB via tRPC — so there is no server-side `_formatted`/highlight
 * response to thread through. This instead matches the search box's own
 * free-text query against whatever's already rendered.
 *
 * That also means it degrades gracefully in semantic/hybrid search mode: a
 * conceptual match with no literal text overlap just renders unhighlighted,
 * exactly as it did before this feature existed — never a wrong highlight.
 *
 * The same word rules drive the server-side "exact hits first" ordering in
 * `bookmarks.searchBookmarks`, so a row shown as an exact hit always has
 * something to highlight.
 */

import { searchQueryWords } from "@karakeep/shared/searchTextMatch";

export interface QueryMatchSpan {
  text: string;
  matched: boolean;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queryWordsRegExp(words: string[], flags: string): RegExp | null {
  if (words.length === 0) return null;
  return new RegExp(words.map(escapeRegExp).join("|"), flags);
}

/** Splits `text` into matched/unmatched runs against every word in `query`.
 *  An empty query, or one with no words, returns the whole text as a single
 *  unmatched span — safe to call unconditionally on any row. */
export function splitByQueryMatch(
  text: string,
  query: string,
): QueryMatchSpan[] {
  const re = queryWordsRegExp(searchQueryWords(query), "gi");
  if (!text || !re) return [{ text, matched: false }];

  const spans: QueryMatchSpan[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > lastIndex) {
      spans.push({ text: text.slice(lastIndex, match.index), matched: false });
    }
    spans.push({ text: match[0], matched: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    spans.push({ text: text.slice(lastIndex), matched: false });
  }
  return spans;
}

/** Whether any query word appears literally in `text` (case-insensitive). */
export function queryMatches(
  text: string | null | undefined,
  query: string,
): boolean {
  const re = queryWordsRegExp(searchQueryWords(query), "i");
  return !!text && !!re && re.test(text);
}

/**
 * A short snippet of `text` centred on the first query match, for surfacing
 * a field — the note — that a search row doesn't otherwise display at all.
 * Returns null when there's no match, so the caller can tell "nothing to
 * show" apart from "matched, but empty".
 */
export function matchSnippet(
  text: string,
  query: string,
  contextChars = 50,
): string | null {
  const re = queryWordsRegExp(searchQueryWords(query), "i");
  const match = re?.exec(text);
  if (!match) return null;

  const start = Math.max(0, match.index - contextChars);
  const end = Math.min(
    text.length,
    match.index + match[0].length + contextChars,
  );
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

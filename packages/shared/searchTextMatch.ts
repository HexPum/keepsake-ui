/**
 * Shared literal-match rules for the search UI and the hybrid result order.
 *
 * The search box is the source of truth for what counts as an "exact" hit:
 * a query word is only considered found when it literally appears in text
 * that the row renders (title, summary or note). Meilisearch's own matched
 * terms are *not* used — they include stemmed and typo-tolerant matches,
 * and highlighting a word that isn't actually on the page would be a lie.
 *
 * The meaning shortcut's `||` markers and filter qualifiers such as
 * `tag:design` are syntax, not words, so they never take part in matching.
 */

const QUERY_QUALIFIER = /^-?[a-z_-]+:/i;

/** Distinct words of a query, longest first so a longer word is matched
 *  before a prefix of it ("insta" before "in"). */
export function searchQueryWords(query: string): string[] {
  const words = query
    .replace(/\|\|/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^["'“”]+|["'“”]+$/g, ""))
    // Single characters match too much of a page to be useful as a
    // highlight, and qualifiers are filters rather than searchable text.
    .filter((word) => word.length >= 2 && !QUERY_QUALIFIER.test(word));
  // Dedupe case-insensitively so "Kaffee kaffee" is one word, and keep the
  // spelling the user typed first.
  const distinct = new Map<string, string>();
  for (const word of words) {
    const key = word.toLowerCase();
    if (!distinct.has(key)) distinct.set(key, word);
  }
  return [...distinct.values()].sort((a, b) => b.length - a.length);
}

/** Whether any of `words` appears literally in `text`, case-insensitively. */
export function textMatchesQueryWords(
  text: string | null | undefined,
  words: readonly string[],
): boolean {
  if (!text || words.length === 0) return false;
  const haystack = text.toLowerCase();
  return words.some((word) => haystack.includes(word.toLowerCase()));
}

import { ZBookmark } from "@karakeep/shared/types/bookmarks";

// The full-text search index (Meilisearch, via bookmarks.searchBookmarks) is
// configured with matchingStrategy "all": every query term must be present
// in a hit. That's fine for the search bar's short, keyword-style queries,
// but a natural-language chat question like "What have I saved about Claude
// Code?" is mostly stopwords, and requiring "what"/"have"/"i"/"saved"/"about"
// to all match a bookmark's title/summary/tags means it never does — the
// query matches zero documents even when "Claude Code" is a real tag on
// several bookmarks. Strip common English stopwords/question words before
// using the message as a search query, so retrieval sees the actual topic
// keywords instead of the whole sentence.
const CHAT_SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "am",
  "be",
  "been",
  "being",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "what",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "about",
  "above",
  "across",
  "after",
  "against",
  "along",
  "among",
  "around",
  "at",
  "before",
  "behind",
  "below",
  "beside",
  "between",
  "by",
  "down",
  "during",
  "for",
  "from",
  "in",
  "into",
  "near",
  "of",
  "off",
  "on",
  "onto",
  "out",
  "over",
  "through",
  "to",
  "toward",
  "under",
  "until",
  "up",
  "with",
  "within",
  "without",
  "and",
  "or",
  "but",
  "if",
  "because",
  "as",
  "while",
  "saved",
  "save",
  "saving",
  "bookmark",
  "bookmarked",
  "bookmarks",
  "find",
  "found",
  "tell",
  "show",
  "know",
  "recall",
  "remember",
]);

/**
 * Reduces a natural-language chat message to its content keywords, for use
 * as search-index queries (see CHAT_SEARCH_STOPWORDS above for why). Falls
 * back to the original message if stripping stopwords leaves nothing.
 *
 * Contractions (e.g. "I've", "what's") are collapsed *before* punctuation is
 * stripped to plain spaces, so "I've" reduces to the stopword "i" instead of
 * splitting into "i" + the stray, non-stopword fragment "ve" — a fragment
 * like that used to survive filtering and get joined back into the query,
 * where it could never match a real document.
 */
export function extractSearchKeywords(message: string): string[] {
  const words = message
    .replace(/'(ve|re|ll|d|m|s)\b/gi, "")
    .replace(/[?!.,;:'"()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const keywords = words.filter(
    (word) => !CHAT_SEARCH_STOPWORDS.has(word.toLowerCase()),
  );
  return keywords.length > 0 ? keywords : [message];
}

/** Whether `bookmark` is actually tagged with `keyword` (case-insensitive,
 *  exact tag-name match) — as opposed to only matching it loosely via
 *  title/summary text. */
export function isTagMatch(bookmark: ZBookmark, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  return bookmark.tags.some((tag) => tag.name.toLowerCase() === needle);
}

/**
 * Reorders a single keyword's search results so genuine tag matches sort
 * ahead of bookmarks that only matched the keyword loosely (title/summary
 * text). Otherwise-stable: within the "is a tag match" / "isn't" groups,
 * the search engine's own relevance order is preserved.
 *
 * Why this exists ("camping and outdoors" under-retrieval): retrieveBookmarks
 * in the chat route caps how many *new* bookmarks each individual keyword
 * query is allowed to contribute to the merged result set, so that one
 * keyword can't crowd out the others. But Meilisearch's relevance ranking is
 * text-based, so a handful of bookmarks that only loosely mention a keyword
 * in passing can rank ahead of the bookmark that's actually *tagged* with
 * it — and once those loose matches fill the keyword's small budget, the
 * real tag match never gets added at all, even though it was sitting right
 * there in the same result page. Sorting tag matches first within each
 * keyword's own results means the budget always gets spent on the
 * genuinely relevant hit first.
 */
export function prioritizeByTagMatch(
  bookmarks: ZBookmark[],
  keyword: string,
): ZBookmark[] {
  return [...bookmarks].sort((a, b) => {
    const aRank = isTagMatch(a, keyword) ? 0 : 1;
    const bRank = isTagMatch(b, keyword) ? 0 : 1;
    return aRank - bRank;
  });
}

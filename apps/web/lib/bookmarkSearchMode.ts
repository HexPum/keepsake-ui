import type { ZBookmarkSearchMode } from "@karakeep/shared/types/bookmarks";
import { getSemanticSearchTerms } from "@karakeep/shared/semanticSearchQuery";

export const KEYWORD_SEARCH_MODE: ZBookmarkSearchMode = "fts";
export const SEMANTIC_DEFAULT_SEARCH_MODE: ZBookmarkSearchMode = "hybrid";

export function resolveBookmarkSearchMode(
  value: string | null,
  semanticSearchEnabled: boolean,
  query = "",
): ZBookmarkSearchMode {
  if (semanticSearchEnabled && getSemanticSearchTerms(query) !== null) {
    return "semantic";
  }
  if (value === KEYWORD_SEARCH_MODE) {
    return value;
  }
  if (
    semanticSearchEnabled &&
    (value === "semantic" || value === SEMANTIC_DEFAULT_SEARCH_MODE)
  ) {
    return value;
  }
  return semanticSearchEnabled
    ? SEMANTIC_DEFAULT_SEARCH_MODE
    : KEYWORD_SEARCH_MODE;
}

export function buildBookmarkSearchHref(
  query: string,
  mode: ZBookmarkSearchMode,
) {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (mode !== SEMANTIC_DEFAULT_SEARCH_MODE) {
    params.set("mode", mode);
  }
  const queryString = params.toString();
  return `/dashboard/search${queryString ? `?${queryString}` : ""}`;
}

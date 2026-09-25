import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useClientConfig } from "@/lib/clientConfig";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import type { ZBookmarkSearchMode } from "@karakeep/shared/types/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";

import {
  buildBookmarkSearchHref,
  KEYWORD_SEARCH_MODE,
  resolveBookmarkSearchMode,
} from "../bookmarkSearchMode";
import { useInSearchPageStore } from "../store/useInSearchPageStore";

export function useBookmarkSearchState() {
  const { semanticSearchEnabled } = useClientConfig().search;
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const searchMode = resolveBookmarkSearchMode(
    searchParams.get("mode"),
    semanticSearchEnabled,
  );
  const pathname = usePathname();
  const lastSearch = useRef({ searchQuery, searchMode });

  // Only update the effective search state when on the search page.
  // This prevents the query or mode from resetting when intercepting routes
  // change the URL (e.g., opening a bookmark preview dialog).
  if (pathname.startsWith("/dashboard/search")) {
    lastSearch.current = { searchQuery, searchMode };
  }

  const effectiveSearch = lastSearch.current;
  const parsed = useMemo(
    () => parseSearchQuery(effectiveSearch.searchQuery),
    [effectiveSearch.searchQuery],
  );
  const selectedSearchMode = semanticSearchEnabled
    ? effectiveSearch.searchMode
    : KEYWORD_SEARCH_MODE;

  // A query with no text (e.g. one made up entirely of qualifiers like
  // `is:fav`) has nothing to embed, so it can only be served by full-text
  // search. Keep the selected mode around for the UI, but search with fts.
  const hasQueryText = parsed.text.trim().length > 0;

  return {
    searchQuery: effectiveSearch.searchQuery,
    searchMode: selectedSearchMode,
    effectiveSearchMode: hasQueryText
      ? selectedSearchMode
      : KEYWORD_SEARCH_MODE,
    parsedSearchQuery: parsed,
  };
}

export function useDoBookmarkSearch() {
  const router = useRouter();
  const { searchQuery, searchMode } = useBookmarkSearchState();
  const isInSearchPage = useInSearchPageStore((val) => val.inSearchPage);
  const timeoutId = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (!timeoutId.current) {
        return;
      }
      clearTimeout(timeoutId.current);
    };
  }, []);

  const navigateToSearch = useCallback(
    (query: string, mode: ZBookmarkSearchMode) => {
      router.replace(buildBookmarkSearchHref(query, mode));
    },
    [router],
  );

  const doSearch = useCallback(
    (val: string) => {
      timeoutId.current = null;
      navigateToSearch(val, searchMode);
    },
    [navigateToSearch, searchMode],
  );

  const debounceSearch = useCallback(
    (val: string) => {
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
      }
      timeoutId.current = setTimeout(() => {
        doSearch(val);
      }, 10);
    },
    [doSearch],
  );

  const setSearchMode = useCallback(
    (mode: ZBookmarkSearchMode, query = searchQuery) => {
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
        timeoutId.current = null;
      }
      navigateToSearch(query, mode);
    },
    [navigateToSearch, searchQuery],
  );

  return {
    doSearch,
    debounceSearch,
    setSearchMode,
    searchQuery,
    searchMode,
    isInSearchPage,
  };
}

/**
 * `enabled` lets a caller skip the request entirely for query states it
 * knows are meaningless. Needed because this hook is also used by a screen
 * where "no query" is the normal resting state rather than a transient one
 * (the mobile Search tab doubles as home), and searching for `""` there is
 * both wasted work and — on a server with no search backend configured —
 * a failing request on the app's default landing screen. Defaults to true
 * so existing callers are unaffected.
 */
export function useBookmarkSearch({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const api = useTRPC();
  const { searchQuery, effectiveSearchMode } = useBookmarkSearchState();
  const sortOrder = useSortOrderStore((state) => state.sortOrder);
  const effectiveSortOrder =
    effectiveSearchMode === "fts" ? sortOrder : ("relevance" as const);

  const {
    data,
    isPending,
    isPlaceholderData,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery(
    api.bookmarks.searchBookmarks.infiniteQueryOptions(
      {
        text: searchQuery,
        searchMode: effectiveSearchMode,
        sortOrder: effectiveSortOrder,
      },
      {
        enabled,
        placeholderData: keepPreviousData,
        gcTime: 0,
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        // The search backend being unreachable is a real, recoverable
        // failure mode (e.g. the search index restarting), not a bug to
        // retry-and-hope-away silently. Fail fast so the page can show an
        // error state instead of sitting on the loading skeleton through
        // several rounds of default retry backoff.
        retry: 1,
      },
    ),
  );

  return {
    error,
    data,
    isPending,
    isPlaceholderData,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  };
}

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import NoBookmarksBanner from "@/components/dashboard/bookmarks/NoBookmarksBanner";
import { DenseBookmarkRow } from "@/components/dashboard/dense/DenseBookmarkRow";
import { MobileSearchHome } from "@/components/dashboard/dense/mobile/MobileSearchHome";
import {
  useBookmarkSearch,
  useBookmarkSearchState,
  useDoBookmarkSearch,
} from "@/lib/hooks/bookmark-search";
import { useInSearchPageStore } from "@/lib/store/useInSearchPageStore";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useInView } from "react-intersection-observer";

function SearchComp() {
  const { searchQuery } = useBookmarkSearchState();
  const { debounceSearch } = useDoBookmarkSearch();
  const hasQuery = searchQuery.trim().length > 0;

  // Seeded from the URL so a shared /dashboard/search?q=… link shows its own
  // query in the field rather than an empty one.
  const [inputValue, setInputValue] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  // Gated on there being something to search for. Previously this fired a
  // `searchBookmarks` request for `""` whenever the page was opened without
  // a query, and any failure was thrown to the dashboard's error boundary.
  // On a server with no search backend configured that empty request always
  // fails, so simply landing on /dashboard/search crashed the route — and
  // because this page also hosts the mobile Search tab (the mobile shell's
  // default landing tab), it took that whole screen down with it, on a
  // query the user never typed.
  const {
    data,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useBookmarkSearch({ enabled: hasQuery });

  const { setInSearchPage } = useInSearchPageStore();

  const { setSortOrder } = useSortOrderStore();

  useEffect(() => {
    // also see related cleanup code in SortOrderToggle.tsx
    setSortOrder("relevance");
  }, [setSortOrder]);

  useEffect(() => {
    setInSearchPage(true);
    return () => setInSearchPage(false);
  }, [setInSearchPage]);

  // Landing here with nothing to type into was the whole problem, so put the
  // cursor in the field on arrival.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { ref: loadMoreRef, inView: loadMoreInView } = useInView();
  useEffect(() => {
    if (loadMoreInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [loadMoreInView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const results = data?.pages.flatMap((p) => p.bookmarks);

  return (
    <div className="hidden flex-col gap-3 sm:flex">
      {/* The header that carries the rest of the app's search field belongs to
          DenseFilesView, which this route does not render — so without a field
          of its own this page used to instruct the reader to "search from the
          field above" while showing no field at all. */}
      <div
        className={cn(
          "border-k-border bg-k-surface-1 focus-within:border-k-accent",
          "flex h-[34px] w-full max-w-[520px] items-center gap-[9px] rounded-[10px] border px-[12px]",
        )}
      >
        <Search
          size={15}
          strokeWidth={1.75}
          className="text-k-accent flex-none"
        />
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            debounceSearch(e.target.value);
          }}
          placeholder="Search your bookmarks…"
          aria-label="Search bookmarks"
          className="text-k-fg placeholder:text-k-fg-dim min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
      </div>

      {!hasQuery ? (
        // With the query gated off there is no request in flight, so the
        // skeleton would spin forever — say what the screen is waiting for
        // instead.
        <p className="text-k-fg-dim py-[40px] text-center text-sm">
          Type above to search your bookmarks.
        </p>
      ) : error ? (
        // A failed search (e.g. the search backend being unreachable) used
        // to `throw` here, which tore down the whole dashboard shell via the
        // route error boundary. A search failing is routine and recoverable
        // — show it in place, with a way to retry, instead of crashing the
        // page around it.
        <div className="flex flex-col items-center gap-[10px] py-[40px] text-center">
          <p className="text-k-fg-dim text-sm">
            Search failed. The search index may be unavailable.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="font-k-mono border-k-accent-border text-k-accent rounded-full border px-[10px] py-[4px] text-[10.5px] font-medium uppercase tracking-[0.06em]"
          >
            Try again
          </button>
        </div>
      ) : results ? (
        results.length === 0 ? (
          <NoBookmarksBanner />
        ) : (
          <>
            {/* Same text-first, no-thumbnail row the main bookmarks list uses
                (DenseFilesView's list view) — this page used to fall back to
                the pre-fork BookmarksGrid/BookmarkCard, which render a large
                thumbnail per card and no summary text, breaking the "no
                thumbnails" design mission for this route only. */}
            <div className="flex flex-col">
              {results.map((bookmark) => (
                <DenseBookmarkRow key={bookmark.id} bookmark={bookmark} />
              ))}
            </div>
            {hasNextPage && (
              <div ref={loadMoreRef} className="py-4 text-center">
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="font-k-mono text-k-fg-dim hover:text-k-fg-muted text-[11px]"
                >
                  {isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )
      ) : (
        <div className="flex flex-col">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="border-k-border-soft flex flex-col gap-[6px] border-t px-[18px] py-[14px] first:border-t-0"
            >
              <div className="bg-k-border h-3 w-3/4 rounded-[3px]" />
              <div className="bg-k-border h-2 w-full rounded-[3px]" />
              <div className="bg-k-border h-2 w-1/3 rounded-[3px]" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchComp />
      <MobileSearchHome />
    </Suspense>
  );
}

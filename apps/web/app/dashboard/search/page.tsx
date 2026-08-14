"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import BookmarksGrid from "@/components/dashboard/bookmarks/BookmarksGrid";
import BookmarksGridSkeleton from "@/components/dashboard/bookmarks/BookmarksGridSkeleton";
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
  // a query, and then `throw error` below turned any failure into the
  // dashboard's error boundary. On a server with no search backend
  // configured that empty request always fails, so simply landing on
  // /dashboard/search crashed the route — and because this page also hosts
  // the mobile Search tab (the mobile shell's default landing tab), it took
  // that whole screen down with it, on a query the user never typed.
  const { data, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useBookmarkSearch({ enabled: hasQuery });

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

  if (error) {
    throw error;
  }

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
      ) : data ? (
        <BookmarksGrid
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
          bookmarks={data.pages.flatMap((b) => b.bookmarks)}
        />
      ) : (
        <BookmarksGridSkeleton />
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

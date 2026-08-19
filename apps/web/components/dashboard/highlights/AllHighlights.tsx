"use client";

import { useEffect, useRef, useState } from "react";
import { DenseHighlightRow } from "@/components/dashboard/dense/DenseHighlightRow";
import { cn } from "@/lib/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";

import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZGetAllHighlightsResponse } from "@karakeep/shared/types/highlights";

/**
 * Shell mirrors DenseFilesView.tsx's header/container conventions (the
 * `-m-4` + `max-w-[1400px]` wrapper, the uppercase tracked section label,
 * the mono meta line) so this page reads as the same product as
 * Inbox/Archive/Favourites rather than a leftover default screen — which,
 * before this pass, it was: a generic icon+heading card with no dense
 * styling and no search/list visual language at all.
 */
export default function AllHighlights({
  highlights: initialHighlights,
}: {
  highlights: ZGetAllHighlightsResponse;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const useSearchQuery = debouncedSearch.trim().length > 0;

  const getAllQuery = useInfiniteQuery(
    api.highlights.getAll.infiniteQueryOptions(
      {},
      {
        enabled: !useSearchQuery,
        initialData: !useSearchQuery
          ? () => ({
              pages: [initialHighlights],
              pageParams: [null],
            })
          : undefined,
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  const searchQueryResult = useInfiniteQuery(
    api.highlights.search.infiniteQueryOptions(
      { text: debouncedSearch },
      {
        enabled: useSearchQuery,
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSearchQuery ? searchQueryResult : getAllQuery;

  const { ref: loadMoreRef, inView: loadMoreButtonInView } = useInView();
  useEffect(() => {
    if (loadMoreButtonInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [loadMoreButtonInView]);

  const allHighlights = data?.pages.flatMap((p) => p.highlights) ?? [];

  return (
    <div className="-m-4 flex flex-col">
      <div className="flex w-full max-w-[1400px] flex-col">
        <div className="flex items-center gap-[14px] px-[22px] pb-[12px] pt-[15px]">
          <div className="flex flex-col gap-[3px]">
            <h1 className="text-k-section-label text-[15px] font-semibold uppercase tracking-[0.06em]">
              {t("common.highlights")}
            </h1>
            <p className="font-k-mono text-k-fg-dim text-[11.5px]">
              {useSearchQuery ? (
                <>
                  {allHighlights.length} result
                  {allHighlights.length === 1 ? "" : "s"} for &ldquo;
                  {debouncedSearch}&rdquo;
                </>
              ) : (
                <>
                  {allHighlights.length} highlight
                  {allHighlights.length === 1 ? "" : "s"}
                </>
              )}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-[10px]">
            {searchOpen ? (
              <div className="border-k-border bg-k-surface-1 focus-within:border-k-accent flex h-[28px] flex-none items-center gap-2 rounded-[8px] border px-[10px]">
                <Search
                  size={15}
                  strokeWidth={1.75}
                  className="text-k-fg-dim flex-none"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  autoFocus
                  placeholder={t("common.search")}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onBlur={() => {
                    if (!searchInput) setSearchOpen(false);
                  }}
                  className="text-k-fg placeholder:text-k-fg-dim w-[180px] bg-transparent text-[12.5px] outline-none"
                />
                {searchInput && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchInput("");
                      searchInputRef.current?.focus();
                    }}
                    className="text-k-fg-dim hover:text-k-fg-muted flex-none"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="border-k-border bg-k-surface-1 text-k-fg-muted hover:border-k-accent-border flex h-[28px] flex-none items-center gap-[8px] rounded-[9px] border px-[12px] text-[12.5px]"
              >
                <Search
                  size={15}
                  strokeWidth={1.75}
                  className="text-k-fg-dim"
                />
                {t("common.search")}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          {allHighlights.length > 0 ? (
            allHighlights.map((h) => (
              <DenseHighlightRow key={h.id} highlight={h} />
            ))
          ) : (
            <p className="text-k-fg-muted px-[22px] py-[14px] text-[12.5px]">
              {t("highlights.no_highlights")}
            </p>
          )}
          {hasNextPage && (
            <button
              ref={loadMoreRef}
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className={cn(
                "font-k-mono text-k-fg-dim hover:text-k-fg-muted self-center px-[18px] py-[14px] text-[11px] uppercase tracking-[0.06em]",
                isFetchingNextPage && "opacity-50",
              )}
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DenseBookmarkRow } from "@/components/dashboard/dense/DenseBookmarkRow";
import {
  useBookmarkSearch,
  useBookmarkSearchState,
  useDoBookmarkSearch,
} from "@/lib/hooks/bookmark-search";
import { cn } from "@/lib/utils";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { gsap } from "gsap";
import Lenis from "lenis";
import { Search } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";

/**
 * Lazy: this pulls in `three` (~365KB minified) for its Vanta field, and
 * only the empty-queue state ever renders it. Statically importing it put
 * `three` in this route's shared bundle for *every* visitor — including
 * desktop, which never renders this component at all, and including the
 * overwhelmingly common case of a queue that isn't empty. `ssr: false`
 * because the effect it exists to run is canvas/WebGL-only anyway.
 */
const MobileEmptyQueueHero = dynamic(
  () =>
    import("@/components/dashboard/dense/mobile/MobileEmptyQueueHero").then(
      (m) => m.MobileEmptyQueueHero,
    ),
  { ssr: false },
);

/**
 * The mobile "search()" screen (design/Keepsake Mobile Designs.html,
 * screen 2b) — search doubles as home: an empty query shows the plain
 * queue (same `{ archived: false }` query the desktop Files page uses),
 * typing turns the same screen into retrieval via the existing search
 * infrastructure (`useBookmarkSearch`, `useDoBookmarkSearch` — the same
 * hooks the desktop search page already uses, so this is one more
 * consumer of them, not a parallel search implementation).
 *
 * Rendered alongside the desktop `SearchComp` on the same
 * `/dashboard/search` route, `sm:hidden` — see the page component.
 *
 * Deliberately not built, and not silently faked either:
 * - The design's everything/summaries/tags/archive filter pills don't
 *   correspond to a real filter on `searchBookmarks` today (it takes a
 *   text query and a search mode, not a result-type facet), so building
 *   them would mean either wiring pills that quietly do nothing or
 *   inventing a filter the API can't serve. Left out rather than faked.
 * - Matched-term highlighting: `DenseBookmarkRow` (reused here for both
 *   the queue and search results, inheriting its existing click/selection
 *   fixes) has no notion of match spans, and the search endpoint doesn't
 *   return them. A real feature, not a styling tweak.
 * - `ask_summaries()` — the design's natural-language "ask your summaries
 *   a question" row — is a new AI feature with no existing endpoint
 *   behind it, not a UI decision.
 *
 * The empty-queue state (bookmarks.length === 0 with no active query)
 * renders `MobileEmptyQueueHero` — screen 2e's Vanta field, not a plain
 * message — see that component's own doc comment.
 */
type StatusFilter = "all" | "archived" | "favourites";

export function MobileSearchHome() {
  const api = useTRPC();
  const { searchQuery } = useBookmarkSearchState();
  const { debounceSearch } = useDoBookmarkSearch();
  const [inputValue, setInputValue] = useState(searchQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const hasQuery = searchQuery.trim().length > 0;

  // Determine archived filter based on status filter
  const archivedFilter =
    statusFilter === "archived" ? true : statusFilter === "all" ? false : undefined;
  const favouritedFilter = statusFilter === "favourites" ? true : undefined;

  const queueResult = useInfiniteQuery(
    api.bookmarks.getBookmarks.infiniteQueryOptions(
      {
        archived: archivedFilter,
        // favourited filter not yet supported by API, will filter client-side
        sortOrder: "desc",
        includeContent: false,
        useCursorV2: true,
      },
      {
        enabled: !hasQuery,
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        placeholderData: keepPreviousData,
      },
    ),
  );
  // Gated: with no query this screen shows the plain queue, so searching
  // for "" would be pure waste — and on a server with no search backend
  // configured, a failing request on the app's default landing screen.
  const searchResult = useBookmarkSearch({ enabled: hasQuery });

  const {
    data,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isPending,
    error,
  } = hasQuery
    ? searchResult
    : {
        ...queueResult,
        isPending: queueResult.isPending,
        error: queueResult.error,
      };

  let bookmarks = data?.pages.flatMap((p) => p.bookmarks) ?? [];

  // Extract all unique tags from bookmarks
  const allTags = Array.from(
    new Set(bookmarks.flatMap((b) => b.tags.map((t) => t.name))),
  );
  const MAX_VISIBLE_TAGS = 2;
  const visibleTags = allTags.slice(0, MAX_VISIBLE_TAGS);
  const overflowCount = Math.max(0, allTags.length - MAX_VISIBLE_TAGS);

  // Apply tag filter client-side
  if (activeTags.length > 0) {
    bookmarks = bookmarks.filter((b) =>
      activeTags.some((tag) => b.tags.some((t) => t.name === tag)),
    );
  }

  // Apply favourites filter client-side
  if (favouritedFilter) {
    bookmarks = bookmarks.filter((b) => b.favourited);
  }

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag],
    );
  };

  const listRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const lenis = new Lenis({
      wrapper: el,
      content: el,
      duration: 1.1,
      smoothWheel: true,
      syncTouch: true,
    });
    const raf = (time: number) => {
      lenis.raf(time);
      rafRef.current = requestAnimationFrame(raf);
    };
    rafRef.current = requestAnimationFrame(raf);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lenis.destroy();
    };
  }, []);

  // Stagger rows in once per distinct query — not on every background
  // refetch of the same query (e.g. window refocus), which would replay
  // the animation over rows already on screen.
  const lastStaggeredQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (isPending || !bookmarks.length || !listRef.current) return;
    if (lastStaggeredQueryRef.current === searchQuery) return;
    lastStaggeredQueryRef.current = searchQuery;
    const rows = listRef.current.querySelectorAll("[data-mobile-row]");
    if (!rows.length) return;
    gsap.from(rows, {
      y: 18,
      opacity: 0,
      duration: 0.55,
      stagger: 0.07,
      ease: "power3.out",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, bookmarks.length, searchQuery]);

  if (error) throw error;

  const isEmptyQueue = !hasQuery && bookmarks.length === 0;

  let listBody: React.ReactNode;
  if (isPending) {
    listBody = (
      <div className="flex flex-col gap-[6px] px-[18px] pt-[13px]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-[6px] pb-[13px]">
            <div className="bg-k-border h-3 w-3/4 rounded-[3px]" />
            <div className="bg-k-border h-2 w-full rounded-[3px]" />
          </div>
        ))}
      </div>
    );
  } else if (bookmarks.length === 0) {
    // Design screen 2e's Vanta hero is specifically for the empty
    // *queue* — a plain "no matches" line covers the other empty case
    // (a search that found nothing), which isn't what that screen means.
    listBody = isEmptyQueue ? (
      <MobileEmptyQueueHero />
    ) : (
      <div className="text-k-fg-dim px-[18px] pt-[40px] text-center text-[13px]">
        No matches.
      </div>
    );
  } else {
    listBody = (
      <>
        {bookmarks.map((bookmark) => (
          <div key={bookmark.id} data-mobile-row>
            <DenseBookmarkRow bookmark={bookmark} />
          </div>
        ))}
        {hasNextPage ? (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="font-k-mono text-k-fg-dim w-full py-[16px] text-center text-[10.5px] disabled:opacity-50"
          >
            {isFetchingNextPage ? "// loading…" : "// load more"}
          </button>
        ) : (
          <div className="font-k-mono text-k-fg-dim px-[16px] py-[16px] text-center text-[10.5px]">
            {"// end_of_results"}
          </div>
        )}
      </>
    );
  }

  const statusFilters: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "archived", label: "Archived" },
    { id: "favourites", label: "Favourites" },
  ];

  return (
    <div className="flex h-full flex-col sm:hidden">
      {/* Search bar */}
      <div className="flex-none px-[14px] pb-[10px] pt-[10px]">
        <div
          className={cn(
            "border-k-border bg-k-surface-1 flex h-[40px] items-center gap-[9px] rounded-[11px] border px-[13px]",
            inputValue && "border-k-accent",
          )}
        >
          <Search
            size={16}
            className="text-k-accent flex-none"
            strokeWidth={1.9}
          />
          <input
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              debounceSearch(e.target.value);
            }}
            placeholder="Search titles, summaries, tags"
            className="text-k-fg placeholder:text-k-fg-dim min-w-0 flex-1 bg-transparent text-[14px] outline-none"
          />
          {/* Sort/filter icon — three lines decreasing */}
          <button
            type="button"
            aria-label="Filter"
            className="text-k-fg-dim flex-none flex flex-col gap-[3px] pr-[2px]"
          >
            <span className="block h-[1.5px] w-4 rounded-[1px] bg-current" />
            <span className="block h-[1.5px] w-3 rounded-[1px] bg-current" />
            <span className="block h-[1.5px] w-2 rounded-[1px] bg-current" />
          </button>
        </div>
      </div>

      {/* Filter chip bar */}
      <div className="flex-none overflow-x-auto px-[14px] pb-[12px] scrollbar-none">
        <div className="flex gap-[6px]">
          {/* Status filters */}
          {statusFilters.map(({ id, label }) => {
            const active = statusFilter === id;
            return (
              <button
                key={id}
                onClick={() => setStatusFilter(id)}
                className={cn(
                  "font-k-sans flex-none whitespace-nowrap rounded-full px-[13px] py-[5px] text-[13px] font-600 transition-all",
                  active
                    ? "bg-k-accent text-k-bg"
                    : "border border-k-border-soft text-k-fg-dim hover:border-k-border",
                )}
              >
                {label}
              </button>
            );
          })}

          <span className="font-k-mono text-k-fg-dim flex-none text-[12px]">
            {"//"}
          </span>

          {/* Tag group label */}
          <button
            onClick={() => setActiveTags([])}
            className="font-k-mono flex-none whitespace-nowrap rounded-full bg-k-accent px-[11px] py-[5px] text-[12px] font-500 text-k-bg"
          >
            tags
          </button>

          <span className="font-k-mono text-k-fg-dim flex-none text-[12px]">
            :
          </span>

          {/* Visible tag chips */}
          {visibleTags.map((tag) => {
            const active = activeTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "font-k-mono flex-none whitespace-nowrap rounded-full px-[11px] py-[5px] text-[12px] transition-all",
                  active
                    ? "bg-k-accent font-600 text-k-bg"
                    : "border border-k-border-soft text-k-accent hover:bg-k-accent/10",
                )}
              >
                {tag}
              </button>
            );
          })}

          {/* Overflow chip */}
          {overflowCount > 0 && (
            <button
              className="font-k-mono flex-none whitespace-nowrap rounded-full bg-k-accent/10 px-[11px] py-[5px] text-[12px] text-k-accent"
            >
              +{overflowCount}
            </button>
          )}
        </div>
      </div>

      {!isPending && !isEmptyQueue && (
        <div className="font-k-mono text-k-fg-dim flex-none px-[16px] pb-[6px] text-[10.5px]">
          {hasQuery
            ? `// ${bookmarks.length} match${bookmarks.length === 1 ? "" : "es"}`
            : `// ${bookmarks.length} ${statusFilter === "all" ? "in queue" : statusFilter === "archived" ? "archived" : "favourites"}`}
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {listBody}
      </div>
    </div>
  );
}

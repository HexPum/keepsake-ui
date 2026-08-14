"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useBookmarkSearch,
  useBookmarkSearchState,
  useDoBookmarkSearch,
} from "@/lib/hooks/bookmark-search";
import {
  getDenseRowSource,
  getDenseRowTitle,
} from "@/lib/dense/bookmarkDisplay";
import {
  estimateReadingTimeMinutes,
  formatCompactRelativeTime,
} from "@/lib/dense/format";
import { summaryPreview } from "@/lib/dense/summary";
import { cn } from "@/lib/utils";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { gsap } from "gsap";
import Lenis from "lenis";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";

const MobileEmptyQueueHero = dynamic(
  () =>
    import("@/components/dashboard/dense/mobile/MobileEmptyQueueHero").then(
      (m) => m.MobileEmptyQueueHero,
    ),
  { ssr: false },
);

type Density = "dense" | "roomy";
type Filter = "all" | "unread" | "favourites" | string;

/**
 * The mobile "search()" screen — exact copy of Figma design (QueueScreen),
 * wired to keepsake-ui's backend data. Search doubles as home: an empty
 * query shows the plain queue, typing retrieves bookmarks via search.
 *
 * Rendered on `/dashboard/search` route, `sm:hidden`.
 */
export function MobileSearchHome() {
  const api = useTRPC();
  const { searchQuery } = useBookmarkSearchState();
  const { debounceSearch } = useDoBookmarkSearch();
  const [inputValue, setInputValue] = useState(searchQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const [swiping, setSwiping] = useState<string | null>(null);
  const [archived, setArchived] = useState<string[]>([]);
  const [density, setDensity] = useState<Density>("dense");

  const hasQuery = searchQuery.trim().length > 0;

  // Queue data (when no search query)
  const queueResult = useInfiniteQuery(
    api.bookmarks.getBookmarks.infiniteQueryOptions(
      {
        archived: false,
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

  // Search data (when query exists)
  const searchResult = useBookmarkSearch({ enabled: hasQuery });

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, isPending } =
    hasQuery
      ? searchResult
      : {
          ...queueResult,
          isPending: queueResult.isPending,
        };

  let bookmarks = data?.pages.flatMap((p) => p.bookmarks) ?? [];

  // Extract tags for filters
  const allTags = Array.from(
    new Set(bookmarks.flatMap((b) => b.tags.map((t) => t.name))),
  );
  const filters: Filter[] = ["all", "unread", "favourites", ...allTags];

  // Filter bookmarks
  const visible = bookmarks.filter((b) => {
    if (archived.includes(b.id)) return false;
    if (filter === "all") return true;
    if (filter === "unread")
      return b.summarizationStatus === "pending" ||
        b.summarizationStatus === "failed"
        ? false
        : true;
    if (filter === "favourites") return b.favourited;
    return b.tags.some((t) => t.name === filter);
  });

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

  const isEmptyQueue = !hasQuery && bookmarks.length === 0;

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
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            className="text-k-accent flex-none"
            style={{ width: 16, height: 16 }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              debounceSearch(e.target.value);
            }}
            placeholder="Search…"
            className="text-k-fg placeholder:text-k-fg-dim min-w-0 flex-1 bg-transparent text-[14px] outline-none"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "0 20px 16px",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {filters.map((f) => (
          <FilterChip
            key={f}
            label={f}
            active={filter === f}
            onClick={() => setFilter(f)}
          />
        ))}
      </div>

      {/* Content area */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: density === "dense" ? 0 : 10,
          padding: density === "roomy" ? "0 14px" : 0,
        }}
      >
        {isPending ? (
          <div className="flex flex-col gap-[6px] px-[18px] pt-[13px]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-[6px] pb-[13px]">
                <div className="bg-k-border h-3 w-3/4 rounded-[3px]" />
                <div className="bg-k-border h-2 w-full rounded-[3px]" />
              </div>
            ))}
          </div>
        ) : isEmptyQueue ? (
          <MobileEmptyQueueHero />
        ) : visible.length === 0 ? (
          <div className="text-k-fg-dim px-[18px] pt-[40px] text-center text-[13px]">
            No matches.
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 20px 12px",
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: "var(--text)",
                  }}
                >
                  FILES
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    color: "var(--text-faint)",
                    marginLeft: 10,
                  }}
                >
                  {visible.length} items · {visible.filter((b) => b.summarizationStatus !== "success").length} unread
                </span>
              </div>
            </div>

            {/* Rows */}
            {visible.map((b) =>
              density === "dense" ? (
                <DenseRow
                  key={b.id}
                  bookmark={b}
                  swiping={swiping === b.id}
                  onSwipeStart={() => setSwiping(b.id)}
                  onSwipeEnd={() => setSwiping(null)}
                  onArchive={() => setArchived((prev) => [...prev, b.id])}
                />
              ) : (
                <RoomyCard
                  key={b.id}
                  bookmark={b}
                  swiping={swiping === b.id}
                  onSwipeStart={() => setSwiping(b.id)}
                  onSwipeEnd={() => setSwiping(null)}
                  onArchive={() => setArchived((prev) => [...prev, b.id])}
                />
              )
            )}

            {/* Load more */}
            {hasNextPage && (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="font-k-mono text-k-fg-dim w-full py-[16px] text-center text-[10.5px] disabled:opacity-50"
              >
                {isFetchingNextPage ? "// loading…" : "// load more"}
              </button>
            )}

            {!hasNextPage && (
              <div className="font-k-mono text-k-fg-dim px-[16px] py-[16px] text-center text-[10.5px]">
                {"// end_of_results"}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const display = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: 20,
        border: active ? "1px solid var(--accent)" : "1px solid var(--border2)",
        background: active ? "var(--accent-glow)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        fontFamily: "var(--sans)",
        fontSize: 12,
        fontWeight: active ? 500 : 400,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.15s",
        flexShrink: 0,
      }}
    >
      {display}
    </button>
  );
}

function DenseRow({
  bookmark: b,
  swiping,
  onSwipeStart,
  onSwipeEnd,
  onArchive,
}: {
  bookmark: ZBookmark;
  swiping: boolean;
  onSwipeStart: () => void;
  onSwipeEnd: () => void;
  onArchive: () => void;
}) {
  const { mutate: updateBookmark } = useUpdateBookmark({});
  const [touchStartX, setTouchStartX] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [fav, setFav] = useState(b.favourited);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    onSwipeStart();
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX;
    if (dx < 0) setOffsetX(Math.max(dx, -90));
  };
  const handleTouchEnd = () => {
    if (offsetX < -50) {
      setRevealed(true);
      setOffsetX(-90);
    } else {
      setRevealed(false);
      setOffsetX(0);
    }
    onSwipeEnd();
  };

  const title = getDenseRowTitle(b);
  const domain = getDenseRowSource(b);
  const readingMinutes = estimateReadingTimeMinutes(b.summary);
  const summary = summaryPreview(b.summary);

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 90,
          background: "#c05a1f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="1.8"
          style={{ width: 18, height: 18 }}
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 9,
            color: "white",
            letterSpacing: "0.06em",
          }}
        >
          ARCHIVE
        </span>
      </div>

      <Link
        href={`/dashboard/preview/${b.id}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 0.25s ease",
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
          padding: "14px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          textDecoration: "none",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        {revealed && (
          <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
            <button
              onClick={(e) => {
                e.preventDefault();
                onArchive();
              }}
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                background: "#c05a1f",
                border: "none",
                color: "white",
                fontFamily: "var(--mono)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              archive
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                setRevealed(false);
                setOffsetX(0);
              }}
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                background: "var(--surface)",
                border: "none",
                color: "var(--text-muted)",
                fontFamily: "var(--mono)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              cancel
            </button>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.35,
              color: "var(--text)",
              flex: 1,
            }}
          >
            {title}
          </span>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexShrink: 0,
              paddingTop: 2,
            }}
            onClick={(e) => e.preventDefault()}
          >
            <button
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: 2,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.6"
                style={{ width: 16, height: 16 }}
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                setFav(!fav);
                updateBookmark({
                  bookmarkId: b.id,
                  favourited: !fav,
                });
              }}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: 2,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill={fav ? "var(--accent)" : "none"}
                stroke={fav ? "var(--accent)" : "var(--text-faint)"}
                strokeWidth="1.6"
                style={{ width: 16, height: 16 }}
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          </div>
        </div>

        {b.summarizationStatus === "pending" ? (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  animation: "pulse-dot 1.4s ease infinite",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--accent)",
                  letterSpacing: "0.06em",
                }}
              >
                SUMMARISING
              </span>
            </div>
            <div
              style={{
                height: 3,
                borderRadius: 2,
                background: "var(--surface)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(b.progress || 0) * 100}%`,
                  background: "var(--accent)",
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        ) : summary ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              lineHeight: 1.45,
              margin: 0,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {summary}
          </p>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 2,
          }}
        >
          {domain && (
            <>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--text-faint)",
                }}
              >
                {domain}
              </span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--text-faint)",
                }}
              >
                ·
              </span>
            </>
          )}
          {readingMinutes && (
            <>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--text-faint)",
                }}
              >
                {readingMinutes} min
              </span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--text-faint)",
                }}
              >
                ·
              </span>
            </>
          )}
          {b.tags.map((t) => (
            <span
              key={t.id}
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--text-faint)",
                background: "var(--surface)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              {t.name}
            </span>
          ))}
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--text-faint)",
              marginLeft: "auto",
            }}
          >
            {formatCompactRelativeTime(b.createdAt)}
          </span>
        </div>
      </Link>
    </div>
  );
}

function RoomyCard({
  bookmark: b,
  swiping,
  onSwipeStart,
  onSwipeEnd,
  onArchive,
}: {
  bookmark: ZBookmark;
  swiping: boolean;
  onSwipeStart: () => void;
  onSwipeEnd: () => void;
  onArchive: () => void;
}) {
  const { mutate: updateBookmark } = useUpdateBookmark({});
  const [touchStartX, setTouchStartX] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [fav, setFav] = useState(b.favourited);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    onSwipeStart();
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX;
    if (dx < 0) setOffsetX(Math.max(dx, -100));
  };
  const handleTouchEnd = () => {
    if (offsetX < -60) {
      setRevealed(true);
      setOffsetX(-100);
    } else {
      setRevealed(false);
      setOffsetX(0);
    }
    onSwipeEnd();
  };

  const title = getDenseRowTitle(b);
  const domain = getDenseRowSource(b);
  const readingMinutes = estimateReadingTimeMinutes(b.summary);
  const summary = summaryPreview(b.summary);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--card)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 100,
          background: "var(--accent-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 3,
          borderRadius: "0 14px 14px 0",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="1.8"
          style={{ width: 20, height: 20 }}
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
        </svg>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "white",
            fontWeight: 600,
            letterSpacing: "0.06em",
          }}
        >
          ARCHIVE
        </span>
      </div>

      <Link
        href={`/dashboard/preview/${b.id}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 0.25s ease",
          background: "var(--card)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          textDecoration: "none",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {domain && (
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--text-faint)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {domain}
            </span>
          )}
          {readingMinutes && (
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--text-faint)",
              }}
            >
              {readingMinutes} min
            </span>
          )}
        </div>
        <h3
          style={{
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.3,
            margin: 0,
            color: "var(--text)",
          }}
        >
          {title}
        </h3>
        {b.summarizationStatus === "pending" ? (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent)",
                  animation: "pulse-dot 1.4s ease infinite",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--accent)",
                  letterSpacing: "0.06em",
                }}
              >
                SUMMARISING
              </span>
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: "var(--surface)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(b.progress || 0) * 100}%`,
                  background: "var(--accent)",
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        ) : (
          <p
            style={{
              fontSize: 13.5,
              color: "var(--text-muted)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {summary}
          </p>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
          onClick={(e) => e.preventDefault()}
        >
          {b.tags.map((t) => (
            <span
              key={t.id}
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--text-faint)",
                background: "var(--surface)",
                padding: "2px 8px",
                borderRadius: 5,
              }}
            >
              {t.name}
            </span>
          ))}
          <button
            onClick={(e) => {
              e.preventDefault();
              setFav(!fav);
              updateBookmark({
                bookmarkId: b.id,
                favourited: !fav,
              });
            }}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: 2,
              marginLeft: "auto",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill={fav ? "var(--accent)" : "none"}
              stroke={fav ? "var(--accent)" : "var(--text-faint)"}
              strokeWidth="1.6"
              style={{ width: 17, height: 17 }}
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
      </Link>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FavouritedActionIcon } from "@/components/dashboard/bookmarks/icons";
import { useDenseThemeContext } from "@/components/dashboard/dense/DenseThemeController";
import { SearchMatchText } from "@/components/dashboard/dense/SearchMatchText";
import {
  getDenseRowSource,
  getDenseRowTitle,
} from "@/lib/dense/bookmarkDisplay";
import {
  estimateReadingTimeMinutes,
  formatCompactRelativeTime,
} from "@/lib/dense/format";
import { matchSnippet, queryMatches } from "@/lib/dense/searchHighlight";
import { summaryPreview } from "@/lib/dense/summary";
import { useLiveBookmark } from "@/lib/dense/useLiveBookmark";
import { useRowNavigate } from "@/lib/dense/useRowNavigate";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Highlighter, Sparkles } from "lucide-react";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { DenseRowOverflowMenu } from "./DenseRowOverflowMenu";

/**
 * `formatCompactRelativeTime` is computed off `Date.now()`, so its output can
 * tick over to a different value between SSR and hydration, producing a
 * server/client text mismatch. Defer rendering it until after mount (SSR and
 * the first client render both render nothing here, then the client fills in
 * the real string) — same fix DenseFilesView's `useMounted` applies to
 * `formatRelativeSince` for the identical class of bug.
 */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

export function DenseBookmarkRow({
  bookmark: initialBookmark,
  selected,
  searchQuery = "",
}: {
  bookmark: ZBookmark;
  selected?: boolean;
  /** Free-text portion of an active search query (see
   *  parseSearchQuery/parsedSearchQuery — not the raw query string, which
   *  may also carry `is:`/`tag:` qualifiers that aren't text to highlight).
   *  Omitted outside of search results, where this is a no-op. */
  searchQuery?: string;
}) {
  const bookmark = useLiveBookmark(initialBookmark);
  const { mutate: updateBookmark, isPending } = useUpdateBookmark({});
  const { preference: theme } = useDenseThemeContext();
  const api = useTRPC();
  // One query per visible row, same pattern HighlightsBox uses for the
  // detail view — httpBatchLink (trpc-provider.tsx) coalesces the many rows
  // on screen into one HTTP round-trip, so this stays cheap without a
  // server-side numHighlights field.
  const { data: highlightsData } = useQuery(
    api.highlights.getForBookmark.queryOptions({ bookmarkId: bookmark.id }),
  );
  const highlightCount = highlightsData?.highlights.length ?? 0;

  const title = getDenseRowTitle(bookmark);
  const source = getDenseRowSource(bookmark);
  const isPendingSummary = bookmark.summarizationStatus === "pending";
  const isSummarised =
    bookmark.summarizationStatus === "success" && !!bookmark.summary;
  const readingMinutes = estimateReadingTimeMinutes(bookmark.summary);
  const summary = summaryPreview(bookmark.summary);
  const navigate = useRowNavigate(`/dashboard/preview/${bookmark.id}`);
  const mounted = useMounted();

  // A note snippet is only ever worth showing when it's *why* this row
  // matched — title/summary already surface their own matches in place, so
  // showing the note too whenever it merely also contains the word would
  // just repeat the highlight for no new information.
  const noteSnippet =
    searchQuery.trim() &&
    !queryMatches(title, searchQuery) &&
    !queryMatches(summary, searchQuery)
      ? matchSnippet(bookmark.note ?? "", searchQuery)
      : null;

  return (
    <div
      {...navigate}
      className={cn(
        "border-k-border-soft group relative flex cursor-pointer gap-[14px] border-t px-[18px] py-[14px] transition-colors",
        selected
          ? "bg-k-surface-1 shadow-[inset_2px_0_0_0_var(--k-accent)]"
          : "hover:bg-k-surface-1",
      )}
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-[6px]">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/preview/${bookmark.id}`}
            style={{ fontWeight: "var(--k-row-title-weight)" }}
            className={cn(
              "truncate text-[14px] tracking-[-0.01em]",
              isPendingSummary ? "text-k-fg-soft" : "text-k-fg",
            )}
          >
            <SearchMatchText text={title} query={searchQuery} />
          </Link>
          {isPendingSummary ? (
            <span className="border-k-border font-k-mono text-k-fg-dim inline-flex flex-none items-center gap-[5px] rounded-[4px] border px-[5px] py-px text-[9.5px] font-medium uppercase tracking-[0.06em]">
              <span className="bg-k-fg-dim size-1 rounded-full" />
              Summarising
            </span>
          ) : isSummarised && theme.showSummaryIcon ? (
            <Sparkles
              size={13}
              className="text-k-accent flex-none opacity-65"
              aria-label="AI summarised"
            />
          ) : null}
        </div>

        {isPendingSummary ? (
          <div className="flex max-w-[640px] flex-col gap-[6px] pt-[2px]">
            <div className="bg-k-border h-2 rounded-[3px]" />
            <div className="bg-k-border h-2 w-[72%] rounded-[3px]" />
          </div>
        ) : summary ? (
          <p
            style={{
              fontSize: "var(--k-row-summary-size)",
              lineHeight: "var(--k-summary-lh)",
            }}
            className="text-k-summary line-clamp-2 max-w-[640px] [text-wrap:pretty]"
          >
            <SearchMatchText text={summary} query={searchQuery} />
          </p>
        ) : null}

        {noteSnippet && (
          <p
            style={{
              fontSize: "var(--k-row-summary-size)",
              lineHeight: "var(--k-summary-lh)",
            }}
            className="text-k-fg-dim line-clamp-1 max-w-[640px] italic [text-wrap:pretty]"
          >
            <SearchMatchText text={noteSnippet} query={searchQuery} />
          </p>
        )}

        <div
          className={cn(
            "flex flex-wrap items-center gap-[10px]",
            isPendingSummary ? "pt-[4px]" : "pt-[2px]",
          )}
        >
          {source && (
            <span className="font-k-mono text-k-fg-dim text-[11px]">
              {source}
            </span>
          )}
          {!isPendingSummary && readingMinutes && (
            <>
              {source && <span className="text-k-divider">·</span>}
              <span className="font-k-mono text-k-fg-dim text-[11px]">
                {readingMinutes} min
              </span>
            </>
          )}
          {highlightCount > 0 && (
            <>
              {(source || (!isPendingSummary && readingMinutes)) && (
                <span className="text-k-divider">·</span>
              )}
              <span className="font-k-mono text-k-fg-dim inline-flex items-center gap-[3px] text-[11px]">
                <Highlighter size={11} strokeWidth={1.75} />
                {highlightCount}
              </span>
            </>
          )}
          {bookmark.tags.slice(0, 3).map((tag) => (
            <Link
              key={tag.id}
              href={`/dashboard/tags/${tag.id}`}
              className="border-k-border text-k-fg-muted hover:border-k-accent-border hover:text-k-fg relative z-20 rounded-full border px-[7px] py-px text-[10.5px]"
            >
              {tag.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex flex-none flex-col items-end gap-[10px]">
        <span className="font-k-mono text-k-timestamp text-[11px]">
          {mounted ? formatCompactRelativeTime(bookmark.createdAt) : null}
        </span>
        <div className="text-k-icon flex items-center gap-2">
          <button
            type="button"
            aria-label={bookmark.favourited ? "Unfavourite" : "Favourite"}
            aria-pressed={bookmark.favourited}
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              updateBookmark({
                bookmarkId: bookmark.id,
                favourited: !bookmark.favourited,
              });
            }}
            className="hover:text-k-fg-muted relative z-20 flex items-center justify-center"
          >
            <FavouritedActionIcon
              favourited={bookmark.favourited}
              size={15}
              strokeWidth={1.75}
            />
          </button>
          <div className="relative z-20">
            <DenseRowOverflowMenu bookmark={bookmark} />
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { CSSProperties, useState } from "react";
import { BookmarkTagsEditor } from "@/components/dashboard/bookmarks/BookmarkTagsEditor";
import {
  ArchivedActionIcon,
  FavouritedActionIcon,
} from "@/components/dashboard/bookmarks/icons";
import { DenseRowOverflowMenu } from "@/components/dashboard/dense/DenseRowOverflowMenu";
import { DenseManageListsDialog } from "@/components/dashboard/dense/lists/DenseManageListsDialog";
import { SummaryAspectText } from "@/components/dashboard/dense/SummaryAspectText";
import { AssetContentSection } from "@/components/dashboard/preview/AssetContentSection";
import AttachmentBox from "@/components/dashboard/preview/AttachmentBox";
import HighlightsBox from "@/components/dashboard/preview/HighlightsBox";
import LinkContentSection from "@/components/dashboard/preview/LinkContentSection";
import { NoteEditor } from "@/components/dashboard/preview/NoteEditor";
import { TextContentSection } from "@/components/dashboard/preview/TextContentSection";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { useSession } from "@/lib/auth/client";
import { useClientConfig } from "@/lib/clientConfig";
import {
  estimateDetailReadingTimeMinutes,
  getDenseRowTitle,
  shouldDefaultOpenContentDisclosure,
} from "@/lib/dense/bookmarkDisplay";
import { formatSavedAgo } from "@/lib/dense/format";
import { parseSummary } from "@/lib/dense/summary";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ListPlus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import {
  useSummarizeBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkRefreshInterval,
  getSourceUrl,
  isBookmarkStillCrawling,
} from "@karakeep/shared/utils/bookmarkUtils";

/** Mono section label — `SUMMARY`, `KEY POINTS`, ... */
const SECTION_LABEL =
  "font-k-mono text-k-fg-dim text-[10px] font-medium uppercase tracking-[0.08em]";

const ACTION_ICON =
  "text-k-fg-muted hover:text-k-fg flex items-center justify-center disabled:opacity-50";

/** Reading-emphasis-driven size/line-height, shared by the lead, the
 *  no-summary fallback, and the trailing-prose paragraph — all three are
 *  the same "detail summary" typographic role in the design doc's table. */
const DETAIL_SUMMARY_STYLE: CSSProperties = {
  fontSize: "var(--k-detail-summary-size)",
  lineHeight: "var(--k-summary-lh)",
};

/**
 * The design's source line is the URL rather than the bare domain
 * (`ui.shadcn.com/docs/theming`), so keep the path but drop the scheme and
 * any query string, which would blow past the line at 11px mono.
 */
function displayUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

/**
 * Detail read-out for the dense fork, built to the prototype's 1c pane: the
 * AI title and summary lead, and the original page is demoted to a reference
 * line and a disclosure below. Karakeep's own preview surfaces (note,
 * attachments, highlights, the archived page itself) are kept underneath so
 * the redesign doesn't cost the app any functionality.
 */
export default function DenseBookmarkDetail({
  bookmarkId,
  initialData,
  onClose,
}: {
  bookmarkId: string;
  initialData?: ZBookmark;
  onClose?: () => void;
}) {
  const api = useTRPC();
  const { data: session } = useSession();
  // `null` = no explicit user choice yet, so the default below (open for
  // note-type bookmarks, closed otherwise) applies. A real boolean once the
  // user actually clicks the disclosure overrides that default either way.
  const [contentOpenOverride, setContentOpenOverride] = useState<
    boolean | null
  >(null);
  // Same null-means-"apply the default" convention as contentOpenOverride
  // above — the default here (see noteOpen below) depends on whether the
  // bookmark actually has a note, so it can't be a plain useState(false).
  const [noteOpenOverride, setNoteOpenOverride] = useState<boolean | null>(
    null,
  );
  // No data-dependent default to compute for attachments (unlike note/
  // content) — always collapsed to start, per the design.
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);

  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      { bookmarkId },
      {
        initialData,
        refetchInterval: (query) => {
          const data = query.state.data;
          if (!data) return false;
          return getBookmarkRefreshInterval(data);
        },
      },
    ),
  );

  // Re-summarising needs an inference provider on the server. Without one the
  // mutation is rejected with BAD_REQUEST ("No inference client configured"),
  // so an ungated button is an offer the server cannot honour — it failed with
  // a generic "Something went wrong" that named neither the cause nor the fix.
  const inferenceConfigured = useClientConfig().inference.isConfigured;
  // Mirrors TagsEditor's own demoMode gate — the row overflow menu's "Add
  // to list" item already disables under demoMode, and this topbar button
  // must not be a second, ungated path to the same mutation.
  const demoMode = !!useClientConfig().demoMode;

  const onError = () => toast.error("Something went wrong");
  const { mutate: updateBookmark, isPending: isUpdating } = useUpdateBookmark({
    onError,
  });
  const { mutate: resummarise, isPending: isResummarising } =
    useSummarizeBookmark({
      onError,
      onSuccess: () => toast.success("Re-summarising…"),
    });

  if (!bookmark) {
    return <FullPageSpinner />;
  }

  const contentOpen =
    contentOpenOverride ??
    shouldDefaultOpenContentDisclosure(bookmark.content.type);
  // Collapsed unless there's an actual note to show — an empty note isn't
  // worth greeting the reader with an open, empty box.
  const noteOpen = noteOpenOverride ?? !!bookmark.note?.trim();

  const isOwner = session?.user?.id === bookmark.userId;
  const sourceUrl = getSourceUrl(bookmark);
  const title = getDenseRowTitle(bookmark);
  const originalTitle =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.title
      : null;
  // Only worth showing as a reference line when it's actually a second,
  // different title — otherwise it just repeats the heading above it.
  const showOriginalTitle = !!originalTitle && originalTitle !== title;
  const isPendingSummary = bookmark.summarizationStatus === "pending";
  const { lead, keyPoints, trail } = parseSummary(bookmark.summary);
  const readingMinutes = estimateDetailReadingTimeMinutes(bookmark);

  let content;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      content = <LinkContentSection bookmark={bookmark} />;
      break;
    case BookmarkTypes.TEXT:
      content = <TextContentSection bookmark={bookmark} />;
      break;
    case BookmarkTypes.ASSET:
      content = <AssetContentSection bookmark={bookmark} />;
      break;
  }

  return (
    <div className="bg-k-bg flex h-full flex-col">
      <DenseManageListsDialog
        bookmarkId={bookmark.id}
        open={listsOpen}
        onOpenChange={setListsOpen}
      />
      {/* Sticky rather than merely flex-none: in the dialog this sits above
          a scrolling body, but on the full-page route `<main>` is the
          scroller, and without this the actions would scroll away. */}
      <div className="border-k-border bg-k-bg sticky top-0 z-10 flex flex-none items-center gap-[10px] border-b px-[22px] py-[13px]">
        {isOwner && (
          // Open original and Edit tags used to live here as dedicated
          // icons — both redundant now: the title above is already a link
          // to sourceUrl (see the h1 below), and the tag chips/+tag button
          // further down already open the inline editor. This is a bare
          // "more" affordance for future actions, same icon as the row and
          // mobile detail overflow menus. Leftmost of the three, per design.
          <DenseRowOverflowMenu bookmark={bookmark} className={ACTION_ICON} />
        )}
        <button
          type="button"
          aria-label={bookmark.archived ? "Unarchive" : "Archive"}
          aria-pressed={bookmark.archived}
          disabled={!isOwner || isUpdating}
          onClick={() =>
            updateBookmark({
              bookmarkId: bookmark.id,
              archived: !bookmark.archived,
            })
          }
          className={ACTION_ICON}
        >
          <ArchivedActionIcon
            archived={bookmark.archived}
            size={16}
            strokeWidth={1.75}
          />
        </button>
        <button
          type="button"
          aria-label={bookmark.favourited ? "Unfavourite" : "Favourite"}
          aria-pressed={bookmark.favourited}
          disabled={!isOwner || isUpdating}
          onClick={() =>
            updateBookmark({
              bookmarkId: bookmark.id,
              favourited: !bookmark.favourited,
            })
          }
          className={ACTION_ICON}
        >
          <FavouritedActionIcon
            favourited={bookmark.favourited}
            size={16}
            strokeWidth={1.75}
          />
        </button>
        <button
          type="button"
          aria-label="Add to list"
          disabled={!isOwner || demoMode}
          onClick={() => setListsOpen(true)}
          className={ACTION_ICON}
        >
          <ListPlus size={16} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          disabled={
            !isOwner ||
            !inferenceConfigured ||
            isResummarising ||
            isPendingSummary
          }
          title={
            inferenceConfigured
              ? undefined
              : "Summarising needs an AI provider configured on the server (set OPENAI_API_KEY or OLLAMA_BASE_URL, and INFERENCE_ENABLE_AUTO_SUMMARIZATION)."
          }
          onClick={() => resummarise({ bookmarkId: bookmark.id })}
          className="font-k-mono border-k-accent-border text-k-accent ml-auto inline-flex items-center gap-[6px] rounded-full border px-[9px] py-[3px] text-[10.5px] font-medium uppercase tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={12}
            className={cn(isResummarising && "animate-spin")}
          />
          Re-summarise
        </button>
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn(ACTION_ICON, "ml-[10px]")}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* pb-[18px] rather than the old 30: with Note/Attachments now
            collapsed by default (a slim header row, not a filled box), the
            old bottom padding left a visibly larger gap before the "Saved
            page" divider below than the section's own internal rhythm
            (gap-[22px]/[10px]) implies. */}
        <div className="flex max-w-[600px] flex-col gap-[22px] px-[34px] pb-[18px] pt-[26px]">
          <div className="flex flex-col gap-[10px]">
            <p className="font-k-mono text-k-fg-dim text-[11px]">
              {sourceUrl && (
                <>
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    // The only row-navigation guard in this fork
                    // (shouldIgnoreRowClick, lib/dense/useRowNavigate.ts)
                    // works by walking up to the nearest `a`/`button`, so
                    // there's no live bug this is fixing today — but it's
                    // cheap insurance if the detail is ever embedded in a
                    // clickable container.
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-k-fg-soft hover:underline"
                  >
                    {displayUrl(sourceUrl)}
                  </a>{" "}
                  ·{" "}
                </>
              )}
              {formatSavedAgo(bookmark.createdAt)}
              {readingMinutes && <> · {readingMinutes} min read</>}
            </p>
            <h1 className="text-[25px] font-semibold leading-[1.22] tracking-[-0.025em] [text-wrap:pretty]">
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-k-fg hover:text-k-fg-soft hover:underline"
                >
                  {title}
                </a>
              ) : (
                <span className="text-k-fg">{title}</span>
              )}
            </h1>
            {showOriginalTitle && (
              <div className="flex flex-wrap items-center gap-[7px]">
                <span className="font-k-mono text-k-accent text-[10px] font-medium uppercase tracking-[0.08em]">
                  AI title
                </span>
                <span className="font-k-mono text-k-version text-[10.5px]">
                  original: “{originalTitle}”
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-[9px]">
            <p className={SECTION_LABEL}>Summary</p>
            {isPendingSummary ? (
              <div className="flex flex-col gap-[6px]">
                <div className="bg-k-border h-2 rounded-[3px]" />
                <div className="bg-k-border h-2 rounded-[3px]" />
                <div className="bg-k-border h-2 w-[72%] rounded-[3px]" />
              </div>
            ) : lead ? (
              <p
                style={DETAIL_SUMMARY_STYLE}
                className="text-k-summary-strong whitespace-pre-line [text-wrap:pretty]"
              >
                <SummaryAspectText text={lead} />
              </p>
            ) : (
              <p style={DETAIL_SUMMARY_STYLE} className="text-k-fg-dim">
                No summary yet.
              </p>
            )}
          </div>

          {keyPoints.length > 0 && (
            <div className="flex flex-col gap-[10px]">
              <p className={SECTION_LABEL}>Key points</p>
              <ul className="text-k-fg-muted flex flex-col gap-[8px] text-[13px] leading-[1.55]">
                {keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-[10px]">
                    <span className="text-k-accent flex-none" aria-hidden>
                      —
                    </span>
                    <span>
                      <SummaryAspectText text={point} />
                    </span>
                  </li>
                ))}
              </ul>
              {trail && (
                <p
                  style={DETAIL_SUMMARY_STYLE}
                  className="text-k-summary-strong whitespace-pre-line [text-wrap:pretty]"
                >
                  <SummaryAspectText text={trail} />
                </p>
              )}
            </div>
          )}

          <div className="border-k-border flex flex-col gap-[10px] border-t pt-[16px]">
            {tagEditorOpen ? (
              <div className="flex flex-col gap-[8px]">
                <div className="flex items-center justify-between">
                  <p className={SECTION_LABEL}>Tags</p>
                  <button
                    type="button"
                    aria-label="Done editing tags"
                    onClick={() => setTagEditorOpen(false)}
                    className={ACTION_ICON}
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </div>
                <BookmarkTagsEditor bookmark={bookmark} disabled={!isOwner} />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-[6px]">
                {bookmark.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="border-k-border text-k-fg-muted rounded-full border px-[9px] py-[2px] text-[11px]"
                  >
                    {tag.name}
                  </span>
                ))}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setTagEditorOpen(true)}
                    className="text-k-fg-dim hover:text-k-fg-muted border-k-border-dashed rounded-full border border-dashed px-[9px] py-[2px] text-[11px]"
                  >
                    + tag
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Note/Attachments/Highlights are utility disclosures, not
              primary content — grouped with their own tighter rhythm
              (gap-[10px]) instead of the 22px gap the sections above use,
              so two collapsed one-line headers don't read as far apart as
              full content blocks. */}
          <div className="flex flex-col gap-[10px]">
            <div className="flex flex-col gap-[9px]">
              <button
                type="button"
                aria-expanded={noteOpen}
                onClick={() => setNoteOpenOverride(!noteOpen)}
                className={cn(SECTION_LABEL, "flex items-center gap-[8px]")}
              >
                <ChevronRight
                  size={12}
                  className={cn(
                    "transition-transform",
                    noteOpen && "rotate-90",
                  )}
                />
                Note
              </button>
              {noteOpen && (
                <NoteEditor
                  bookmark={bookmark}
                  disabled={!isOwner}
                  className="border-k-border bg-k-surface-2 text-k-fg-muted placeholder:text-k-fg-dim min-h-[4.5rem] rounded-[8px] text-[13px] leading-[1.5]"
                />
              )}
            </div>

            <div className="flex flex-col gap-[9px]">
              <button
                type="button"
                aria-expanded={attachmentsOpen}
                onClick={() => setAttachmentsOpen((open) => !open)}
                className={cn(SECTION_LABEL, "flex items-center gap-[8px]")}
              >
                <ChevronRight
                  size={12}
                  className={cn(
                    "transition-transform",
                    attachmentsOpen && "rotate-90",
                  )}
                />
                Attachments
              </button>
              {attachmentsOpen && (
                <AttachmentBox
                  bookmark={bookmark}
                  readOnly={!isOwner}
                  headless
                />
              )}
            </div>

            <HighlightsBox bookmarkId={bookmark.id} readOnly={!isOwner} />
          </div>
        </div>

        {/* The archived page is the reference material behind the briefing,
            so it stays collapsed until asked for. Its renderers (reader view,
            screenshot, PDF, video) all size to their container, hence the
            explicit height rather than letting it collapse to nothing. */}
        <div className="border-k-border border-t">
          <button
            type="button"
            aria-expanded={contentOpen}
            onClick={() => setContentOpenOverride(!contentOpen)}
            className="font-k-mono text-k-fg-dim hover:text-k-fg-muted flex w-full items-center gap-[8px] px-[34px] py-[14px] text-[10px] font-medium uppercase tracking-[0.08em]"
          >
            <ChevronRight
              size={12}
              className={cn("transition-transform", contentOpen && "rotate-90")}
            />
            {isBookmarkStillCrawling(bookmark)
              ? "Saved page · still crawling"
              : "Saved page"}
          </button>
          {contentOpen && (
            // Divide by --k-zoom, not a bare 70vh: this renders inside the
            // dense UI's zoomed wrapper (or, in the modal, inside a dialog
            // portal that carries its own matching zoom rule — see
            // dense-theme.css) and `zoom` re-multiplies viewport units, the
            // same trap dashboard/layout.tsx and the full-page preview route
            // already document and avoid. Left as-is, this box rendered 30%
            // taller than intended at a 1.3x display scale.
            <div className="border-k-border-soft h-[calc(70vh/var(--k-zoom,1))] border-t">
              {content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

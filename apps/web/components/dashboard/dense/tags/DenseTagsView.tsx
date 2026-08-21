"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowDownAZ, ArrowDownUp, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useInView } from "react-intersection-observer";

import {
  useDeleteTag,
  useDeleteUnusedTags,
  usePaginatedSearchTags,
} from "@karakeep/shared-react/hooks/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { ZGetTagResponse } from "@karakeep/shared/types/tags";

import { DenseConfirmDialog } from "./DenseConfirmDialog";
import { DenseTagMergeDialog } from "./DenseTagMergeDialog";
import { DenseTagRow } from "./DenseTagRow";

const CONTROL_SHELL =
  "border-k-border bg-k-surface-1 text-k-fg-muted flex h-[28px] flex-none items-center justify-center rounded-[8px] border";

type SortBy = "name" | "usage";

/**
 * Rename / merge / delete for tags, dense-styled. Shell mirrors
 * DenseFilesView.tsx / AllHighlights.tsx (the `-m-4` + `max-w-[1400px]`
 * wrapper, uppercase tracked section label, mono meta line, inline
 * search) so this reads as the same product rather than a bolted-on admin
 * screen. Reachable at /dashboard/tags by URL only for now — no sidebar
 * entry yet (DenseSidebar.tsx has an in-flight collapse-behaviour change,
 * left untouched here).
 */
export function DenseTagsView() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText, 250);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [sortBy, setSortBy] = useState<SortBy>("usage");

  const [mergeState, setMergeState] = useState<{
    tag: ZGetTagResponse;
    initialQuery?: string;
  } | null>(null);
  const [deleteTag, setDeleteTag] = useState<ZGetTagResponse | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, isLoading } =
    usePaginatedSearchTags({
      nameContains: debouncedSearch || undefined,
      sortBy,
      limit: 100,
    });
  const tags = data?.tags ?? [];

  const { ref: loadMoreRef, inView } = useInView();
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { mutate: deleteTagMutate, isPending: isDeleting } = useDeleteTag({
    onError: () => toast.error("Something went wrong"),
  });
  const { mutate: deleteUnused, isPending: isCleaning } = useDeleteUnusedTags({
    onError: () => toast.error("Something went wrong"),
  });

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchText("");
  };

  return (
    <>
      <DenseTagMergeDialog
        sourceTag={mergeState?.tag ?? null}
        initialQuery={mergeState?.initialQuery}
        onOpenChange={(open) => {
          if (!open) setMergeState(null);
        }}
      />
      <DenseConfirmDialog
        open={!!deleteTag}
        title={`Delete "${deleteTag?.name}"?`}
        description="Removes this tag from every bookmark it's attached to. Bookmarks themselves aren't affected, and this can't be undone."
        pending={isDeleting}
        onOpenChange={(open) => {
          if (!open) setDeleteTag(null);
        }}
        onConfirm={() => {
          if (!deleteTag) return;
          deleteTagMutate(
            { tagId: deleteTag.id },
            {
              onSuccess: () => {
                toast.success(`Deleted "${deleteTag.name}"`);
                setDeleteTag(null);
              },
            },
          );
        }}
      />
      <DenseConfirmDialog
        open={cleanupOpen}
        title="Delete all unused tags?"
        description="Deletes every tag that isn't attached to any bookmark. This can't be undone."
        confirmLabel="Delete unused"
        pending={isCleaning}
        onOpenChange={setCleanupOpen}
        onConfirm={() => {
          deleteUnused(undefined, {
            onSuccess: (res) => {
              toast.success(
                res.deletedTags > 0
                  ? `Deleted ${res.deletedTags} unused tag${res.deletedTags === 1 ? "" : "s"}`
                  : "No unused tags to delete",
              );
              setCleanupOpen(false);
            },
          });
        }}
      />

      <div className="-m-4 flex flex-col">
        <div className="flex w-full max-w-[1400px] flex-col">
          <div className="flex items-center gap-[14px] px-[22px] pb-[12px] pt-[15px]">
            <div className="flex flex-col gap-[3px]">
              <h1 className="text-k-section-label text-[15px] font-semibold uppercase tracking-[0.06em]">
                Tags
              </h1>
              <p className="font-k-mono text-k-fg-dim text-[11.5px]">
                {isLoading
                  ? "Loading…"
                  : `${tags.length} tag${tags.length === 1 ? "" : "s"}${hasNextPage ? "+" : ""}`}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-[10px]">
              {searchOpen ? (
                <div
                  className={cn(
                    CONTROL_SHELL,
                    "focus-within:border-k-accent gap-2 px-[10px]",
                  )}
                >
                  <Search
                    size={15}
                    strokeWidth={1.75}
                    className="text-k-fg-dim flex-none"
                  />
                  <input
                    ref={searchInputRef}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") closeSearch();
                    }}
                    placeholder="Search tags…"
                    aria-label="Search tags"
                    className="text-k-fg placeholder:text-k-fg-dim w-[180px] bg-transparent text-[12.5px] outline-none"
                  />
                  <button
                    type="button"
                    onClick={closeSearch}
                    aria-label="Close search"
                    className="text-k-fg-dim hover:text-k-fg-muted flex-none"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(true);
                    requestAnimationFrame(() =>
                      searchInputRef.current?.focus(),
                    );
                  }}
                  className={cn(CONTROL_SHELL, "gap-2 px-[12px] text-[12.5px]")}
                >
                  <Search size={15} strokeWidth={1.75} />
                  Search
                </button>
              )}
              <button
                type="button"
                onClick={() => setSortBy(sortBy === "usage" ? "name" : "usage")}
                title={
                  sortBy === "usage" ? "Sorted by usage" : "Sorted by name"
                }
                className={cn(CONTROL_SHELL, "gap-2 px-[12px] text-[12.5px]")}
              >
                {sortBy === "usage" ? (
                  <ArrowDownUp size={14} strokeWidth={1.75} />
                ) : (
                  <ArrowDownAZ size={14} strokeWidth={1.75} />
                )}
                {sortBy === "usage" ? "Usage" : "Name"}
              </button>
              <button
                type="button"
                onClick={() => setCleanupOpen(true)}
                className={cn(CONTROL_SHELL, "gap-2 px-[12px] text-[12.5px]")}
              >
                <Sparkles size={14} strokeWidth={1.75} />
                Clean up unused
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            {tags.length > 0 ? (
              tags.map((tag) => (
                <DenseTagRow
                  key={tag.id}
                  tag={tag}
                  onMergeRequest={(t, initialQuery) =>
                    setMergeState({ tag: t, initialQuery })
                  }
                  onDeleteRequest={setDeleteTag}
                />
              ))
            ) : !isLoading ? (
              <p className="text-k-fg-muted px-[22px] py-[14px] text-[12.5px]">
                {debouncedSearch
                  ? `No tags match "${debouncedSearch}".`
                  : "No tags yet."}
              </p>
            ) : null}
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
    </>
  );
}

export default DenseTagsView;

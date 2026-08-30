"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListIcon } from "@/lib/lists/listIcon";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { toast } from "sonner";

import {
  useAddBookmarkToList,
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

const SECTION_LABEL =
  "font-k-mono text-k-fg-dim text-[10px] font-medium uppercase tracking-[0.08em]";

/** Renders a list's ancestor names (never icons — `listNameFromPath` also
 *  interpolates the raw `icon` string, which is a pixelarticons *name*
 *  like "folder" in this fork, not an emoji, since commit 4b718bb8; using
 *  it here would print literal text such as "folder Reading / folder
 *  Later"). Ancestors are names only, joined with " / "; the leaf gets a
 *  real `<ListIcon>`. */
function ListPathLabel({ path }: { path: ZBookmarkList[] }) {
  const leaf = path[path.length - 1];
  const ancestors = path.slice(0, -1);
  return (
    <span className="flex min-w-0 items-center gap-[6px]">
      {ancestors.length > 0 && (
        <span className="text-k-fg-dim shrink-0 truncate text-[12px]">
          {ancestors.map((a) => a.name).join(" / ")} /
        </span>
      )}
      <ListIcon name={leaf.icon} className="text-k-fg-muted shrink-0" />
      <span className="text-k-fg truncate">{leaf.name}</span>
    </span>
  );
}

/**
 * Fork-owned "Add to list" dialog, reusing upstream ManageListsModal's data
 * flow (useBookmarkLists / useAddBookmarkToList / useRemoveBookmarkFromList
 * / lists.getListsOfBookmark) with dense tokens, mirroring the pattern
 * DenseTagMergeDialog already established for tag merging. Upstream's own
 * modal is left byte-identical (it's still used by non-dense surfaces and
 * is conflict-prone per FORK_SYNC.md) — this is a parallel component, not a
 * restyle in place.
 */
export function DenseManageListsDialog({
  bookmarkId,
  open,
  onOpenChange,
}: {
  bookmarkId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useTRPC();
  const [query, setQuery] = useState("");

  const {
    data: allLists,
    isPending: isAllListsPending,
    isError: isAllListsError,
  } = useBookmarkLists(undefined, { enabled: open });

  const {
    data: alreadyInList,
    isPending: isAlreadyInPending,
    isError: isAlreadyInError,
  } = useQuery(
    api.lists.getListsOfBookmark.queryOptions(
      { bookmarkId },
      { enabled: open },
    ),
  );

  const isLoading = isAllListsPending || isAlreadyInPending;
  const isError = isAllListsError || isAlreadyInError;

  // Mirrors ManageListsModal: surface the server's own message for a
  // BAD_REQUEST (e.g. the bookmark's already the max size for the list, or
  // some other list-specific rule) rather than a generic failure toast.
  const { mutate: addToList, isPending: isAdding } = useAddBookmarkToList({
    onError: (e) => {
      if (e.data?.code === "BAD_REQUEST") {
        toast.error(e.message);
      } else {
        toast.error("Something went wrong");
      }
    },
  });
  const { mutate: removeFromList, isPending: isRemoving } =
    useRemoveBookmarkFromList({
      onError: (e) => {
        if (e.data?.code === "BAD_REQUEST") {
          toast.error(e.message);
        } else {
          toast.error("Something went wrong");
        }
      },
    });

  const alreadyInIds = new Set(alreadyInList?.lists.map((l) => l.id) ?? []);

  // Upstream's own filtering rules (BookmarkListSelector): only manual
  // lists are addable, viewer-role lists can't be modified by this user,
  // and a list the bookmark is already in doesn't belong in the "add"
  // picker.
  const addCandidates = (allLists?.allPaths ?? []).filter((path) => {
    const leaf = path[path.length - 1];
    if (leaf.type !== "manual") return false;
    if (leaf.userRole === "viewer") return false;
    if (alreadyInIds.has(leaf.id)) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return path.some((p) => p.name.toLowerCase().includes(q));
    }
    return true;
  });

  const hasAnyEligibleList = (allLists?.allPaths ?? []).some((path) => {
    const leaf = path[path.length - 1];
    return leaf.type === "manual" && leaf.userRole !== "viewer";
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-k-border bg-k-surface-1 text-k-fg sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-k-fg text-[15px] font-semibold">
            Add to list
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-k-fg-muted text-[12.5px]">
          Choose which lists this bookmark belongs to.
        </DialogDescription>

        {isError ? (
          <p className="text-k-fg-dim px-[4px] py-[10px] text-[12px]">
            Something went wrong loading lists. Close this dialog and try again.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-[6px]">
              <p className={SECTION_LABEL}>In lists</p>
              {isLoading ? (
                <p className="text-k-fg-dim px-[4px] py-[6px] text-[12px]">
                  Loading…
                </p>
              ) : alreadyInList && alreadyInList.lists.length > 0 ? (
                <div className="flex flex-col gap-[2px]">
                  {alreadyInList.lists.map((list) => {
                    const path = allLists?.getPathById(list.id) ?? [list];
                    return (
                      <div
                        key={list.id}
                        className="flex min-w-0 items-center justify-between gap-2 rounded-[6px] px-[8px] py-[7px] text-[13px]"
                      >
                        <ListPathLabel path={path} />
                        <button
                          type="button"
                          aria-label={`Remove from ${list.name}`}
                          disabled={isRemoving}
                          onClick={() =>
                            removeFromList({ bookmarkId, listId: list.id })
                          }
                          className="text-k-fg-dim hover:text-k-fg flex-none disabled:opacity-50"
                        >
                          <X size={13} strokeWidth={1.75} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-k-fg-dim px-[4px] py-[6px] text-[12px]">
                  Not in any list yet.
                </p>
              )}
            </div>

            {!isLoading && hasAnyEligibleList && (
              <div className="border-k-border bg-k-surface-2 focus-within:border-k-accent flex items-center gap-2 rounded-[8px] border px-[10px] py-[6px]">
                <Search
                  size={14}
                  strokeWidth={1.75}
                  className="text-k-fg-dim flex-none"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search lists…"
                  aria-label="Search lists to add"
                  className="text-k-fg placeholder:text-k-fg-dim w-full bg-transparent text-[12.5px] outline-none"
                />
              </div>
            )}

            <div className="flex max-h-[200px] flex-col gap-[2px] overflow-y-auto">
              {isLoading ? null : !hasAnyEligibleList ? (
                <p className="text-k-fg-dim px-[4px] py-[10px] text-[12px]">
                  You don&apos;t have any lists yet.
                </p>
              ) : addCandidates.length === 0 ? (
                <p className="text-k-fg-dim px-[4px] py-[10px] text-[12px]">
                  {query.trim()
                    ? "No lists match your search."
                    : "Already in every list."}
                </p>
              ) : (
                addCandidates.map((path) => {
                  const leaf = path[path.length - 1];
                  return (
                    <button
                      key={leaf.id}
                      type="button"
                      disabled={isAdding}
                      onClick={() => addToList({ bookmarkId, listId: leaf.id })}
                      className="hover:bg-k-surface-2 flex min-w-0 items-center gap-2 rounded-[6px] px-[8px] py-[7px] text-left text-[13px] disabled:opacity-50"
                    >
                      <ListPathLabel path={path} />
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

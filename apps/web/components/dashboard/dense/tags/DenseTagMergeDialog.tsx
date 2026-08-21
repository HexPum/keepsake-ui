"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { toast } from "sonner";

import {
  useMergeTag,
  useTagAutocomplete,
} from "@karakeep/shared-react/hooks/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { ZGetTagResponse } from "@karakeep/shared/types/tags";

/**
 * Merges `sourceTag` into an existing tag the user picks below.
 * `tags.merge` (Tag.merge) repoints `sourceTag`'s bookmark links onto the
 * chosen target and deletes `sourceTag` server-side — there's no separate
 * "now delete the old one" step for this dialog to drive.
 *
 * Mounted once by DenseTagsView and driven by `sourceTag` (null = closed)
 * rather than one instance per row, so opening it never leaves a second
 * autocomplete query running under a row that's since scrolled away.
 */
export function DenseTagMergeDialog({
  sourceTag,
  initialQuery = "",
  onOpenChange,
}: {
  sourceTag: ZGetTagResponse | null;
  /** Prefills the search box — used by the rename duplicate-name hint to
   *  jump straight to the colliding tag instead of an empty search. */
  initialQuery?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, 250);

  // Reseed the search box only when a *new* dialog actually opens (a
  // different source tag), not on every initialQuery identity change while
  // it's already open and the user may have typed something else.
  useEffect(() => {
    if (sourceTag) {
      setQuery(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTag?.id]);

  const { data: candidates, isLoading } = useTagAutocomplete({
    nameContains: debouncedQuery,
    select: (data) => data.tags.filter((t) => t.id !== sourceTag?.id),
    enabled: !!sourceTag,
  });

  const { mutate: mergeTag, isPending } = useMergeTag({
    onError: () => toast.error("Something went wrong"),
  });

  if (!sourceTag) {
    return null;
  }

  const confirmMerge = (target: { id: string; name: string }) => {
    mergeTag(
      { intoTagId: target.id, fromTagIds: [sourceTag.id] },
      {
        onSuccess: () => {
          toast.success(`Merged "${sourceTag.name}" into "${target.name}"`);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="border-k-border bg-k-surface-1 text-k-fg sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-k-fg text-[15px] font-semibold">
            Merge &ldquo;{sourceTag.name}&rdquo;
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-k-fg-muted text-[12.5px]">
          Every bookmark tagged &ldquo;{sourceTag.name}&rdquo; is retagged onto
          the tag you pick below, and &ldquo;{sourceTag.name}&rdquo; is deleted.
        </DialogDescription>
        <div className="border-k-border bg-k-surface-2 focus-within:border-k-accent flex items-center gap-2 rounded-[8px] border px-[10px] py-[6px]">
          <Search
            size={14}
            strokeWidth={1.75}
            className="text-k-fg-dim flex-none"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tags…"
            aria-label="Search tags to merge into"
            className="text-k-fg placeholder:text-k-fg-dim w-full bg-transparent text-[12.5px] outline-none"
          />
        </div>
        <div className="flex max-h-[240px] flex-col gap-[2px] overflow-y-auto">
          {isLoading ? (
            <p className="text-k-fg-dim px-[4px] py-[10px] text-[12px]">
              Loading…
            </p>
          ) : candidates && candidates.length > 0 ? (
            candidates.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={isPending}
                onClick={() => confirmMerge(t)}
                className="hover:bg-k-surface-2 flex items-center justify-between gap-2 rounded-[6px] px-[8px] py-[7px] text-left text-[13px] disabled:opacity-50"
              >
                <span className="text-k-fg truncate">{t.name}</span>
                <span className="font-k-mono text-k-fg-dim flex-none text-[11px]">
                  {t.numBookmarks}
                </span>
              </button>
            ))
          ) : (
            <p className="text-k-fg-dim px-[4px] py-[10px] text-[12px]">
              No other tags match.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

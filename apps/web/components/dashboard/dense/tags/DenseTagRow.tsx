"use client";

import { useState } from "react";
import { Check, Combine, Pencil, Trash2, X } from "lucide-react";

import { useUpdateTag } from "@karakeep/shared-react/hooks/tags";
import { ZGetTagResponse } from "@karakeep/shared/types/tags";

/**
 * One row in the dense tag-management list: name (pencil toggles inline
 * rename — Enter saves, Esc cancels), bookmark count, Merge / Delete
 * triggers. Rename errors render inline under the row instead of via toast
 * so tags.update's duplicate-name hint ("...consider a merge instead")
 * lands next to the input that caused it, with a button that opens the
 * merge dialog pre-searched for the colliding name.
 */
export function DenseTagRow({
  tag,
  onMergeRequest,
  onDeleteRequest,
}: {
  tag: ZGetTagResponse;
  onMergeRequest: (tag: ZGetTagResponse, initialQuery?: string) => void;
  onDeleteRequest: (tag: ZGetTagResponse) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tag.name);
  const [error, setError] = useState<{
    message: string;
    isDuplicate: boolean;
  } | null>(null);

  const { mutate: updateTag, isPending } = useUpdateTag({
    onSuccess: () => {
      setEditing(false);
      setError(null);
    },
    onError: (e) => {
      setError({
        message: e.message || "Something went wrong",
        isDuplicate: e.data?.code === "BAD_REQUEST",
      });
    },
  });

  const startEditing = () => {
    setValue(tag.name);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    setValue(tag.name);
  };

  const submit = () => {
    const name = value.trim();
    if (!name || name === tag.name) {
      cancel();
      return;
    }
    updateTag({ tagId: tag.id, name });
  };

  return (
    <div className="border-k-border-soft group flex flex-col gap-[4px] border-t px-[22px] py-[10px]">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-[6px]">
          {editing ? (
            <>
              <input
                autoFocus
                value={value}
                disabled={isPending}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") cancel();
                }}
                aria-label={`Rename ${tag.name}`}
                className="border-k-border bg-k-surface-2 text-k-fg focus:border-k-accent w-full max-w-[280px] rounded-[6px] border px-[8px] py-[3px] text-[13px] outline-none"
              />
              <button
                type="button"
                aria-label="Save name"
                disabled={isPending}
                onClick={submit}
                className="text-k-accent hover:text-k-fg flex-none disabled:opacity-50"
              >
                <Check size={15} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Cancel rename"
                disabled={isPending}
                onClick={cancel}
                className="text-k-fg-dim hover:text-k-fg-muted flex-none disabled:opacity-50"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </>
          ) : (
            <>
              <span className="text-k-fg truncate text-[13px]">{tag.name}</span>
              <button
                type="button"
                aria-label={`Rename ${tag.name}`}
                onClick={startEditing}
                className="text-k-fg-dim hover:text-k-fg-muted flex-none opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Pencil size={12} strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>
        <span className="font-k-mono text-k-fg-dim flex-none text-[11px]">
          {tag.numBookmarks} {tag.numBookmarks === 1 ? "bookmark" : "bookmarks"}
        </span>
        <div className="flex flex-none items-center gap-[12px]">
          <button
            type="button"
            aria-label={`Merge ${tag.name} into another tag`}
            onClick={() => onMergeRequest(tag)}
            className="text-k-fg-dim hover:text-k-fg-muted"
          >
            <Combine size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label={`Delete ${tag.name}`}
            onClick={() => onDeleteRequest(tag)}
            className="text-k-fg-dim hover:text-destructive"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-[8px] text-[11px] text-destructive">
          <span>{error.message}</span>
          {error.isDuplicate && (
            <button
              type="button"
              onClick={() => onMergeRequest(tag, value.trim())}
              className="text-k-accent underline-offset-2 hover:underline"
            >
              Merge instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}

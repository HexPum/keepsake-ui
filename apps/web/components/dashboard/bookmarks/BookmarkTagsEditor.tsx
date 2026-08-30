import { toast } from "@/components/ui/sonner";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmarkTags } from "@karakeep/shared-react/hooks/bookmarks";

import { TagsEditor } from "./TagsEditor";

/**
 * Bridges TagsEditor's pending-op model to the real `bookmarks.updateTags`
 * mutation. `onAttach`/`onDetach` return `mutateAsync`'s promise so
 * TagsEditor can tell when an attach/detach actually settles — success or
 * error — instead of assuming success the instant it's called (see
 * TagsEditor.tsx's `isThenable` comment). This is what lets a failed
 * mutation roll the optimistic chip back automatically.
 */
export function BookmarkTagsEditor({
  bookmark,
  disabled,
}: {
  bookmark: ZBookmark;
  disabled?: boolean;
}) {
  const { mutateAsync } = useUpdateBookmarkTags({
    onSuccess: (res) => {
      const { attached, detached } = res;
      if (attached.length > 0 && detached.length === 0) {
        toast({ description: "Tag added!" });
      } else if (detached.length > 0 && attached.length === 0) {
        toast({ description: "Tag removed!" });
      } else if (attached.length > 0 && detached.length > 0) {
        toast({ description: "Tags have been updated!" });
      }
      // Both empty: the request round-tripped fine, but nothing actually
      // changed server-side (e.g. a detach whose tagId no longer resolves
      // to anything). Claiming success here is exactly the false-positive
      // toast this fix removes, so this case is deliberately silent.
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: "There was a problem with your request.",
      });
    },
  });

  return (
    <TagsEditor
      tags={bookmark.tags}
      disabled={disabled}
      onAttach={({ tagName, tagId }) =>
        mutateAsync({
          bookmarkId: bookmark.id,
          attach: [{ tagName, tagId }],
          detach: [],
        })
      }
      onDetach={({ tagId, tagName }) =>
        // Forwarding tagName (not just tagId) is the D1 fix: the router's
        // fetchTagIdsWithNames already resolves a detach entry by name
        // case-insensitively, but a client-minted `temp-…` id it can't
        // resolve at all — without the name, a detach fired before the
        // create-mutation's real id has landed silently no-ops.
        mutateAsync({
          bookmarkId: bookmark.id,
          attach: [],
          detach: [{ tagId, tagName }],
        })
      }
    />
  );
}

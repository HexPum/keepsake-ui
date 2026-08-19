import { toast } from "@/components/ui/sonner";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmarkTags } from "@karakeep/shared-react/hooks/bookmarks";

import { TagsEditor } from "./TagsEditor";

export function BookmarkTagsEditor({
  bookmark,
  disabled,
}: {
  bookmark: ZBookmark;
  disabled?: boolean;
}) {
  const { mutate } = useUpdateBookmarkTags({
    onSuccess: (_res, req) => {
      const description =
        req.attach.length > 0 && req.detach.length === 0
          ? "Tag added!"
          : req.detach.length > 0 && req.attach.length === 0
            ? "Tag removed!"
            : "Tags have been updated!";
      toast({
        description,
      });
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
      onAttach={({ tagName, tagId }) => {
        mutate({
          bookmarkId: bookmark.id,
          attach: [
            {
              tagName,
              tagId,
            },
          ],
          detach: [],
        });
      }}
      onDetach={({ tagId }) => {
        mutate({
          bookmarkId: bookmark.id,
          attach: [],
          detach: [{ tagId }],
        });
      }}
    />
  );
}

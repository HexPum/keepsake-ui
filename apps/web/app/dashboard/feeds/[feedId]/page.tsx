import { notFound } from "next/navigation";
import DenseFiles from "@/components/dashboard/dense/DenseFiles";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

// Was the only remaining caller of the pre-fork Bookmarks.tsx +
// UpdatableBookmarksGrid.tsx pair — every other filtered view (Archive,
// Favourites, Lists, Tags) already runs on DenseFiles, so this swaps to the
// same component instead of reskinning a component nothing else uses.
export default async function FeedPage(props: {
  params: Promise<{ feedId: string }>;
}) {
  const params = await props.params;
  let feed;
  try {
    feed = await api.feeds.get({ feedId: params.feedId });
  } catch (e) {
    if (e instanceof TRPCError) {
      if (e.code == "NOT_FOUND") {
        notFound();
      }
    }
    throw e;
  }

  return (
    <DenseFiles
      label={feed.name}
      query={{ rssFeedId: feed.id }}
      // Matches the old showEditorCard={false}: a feed's contents come from
      // the RSS source, not manual add.
      disableAdd={true}
    />
  );
}

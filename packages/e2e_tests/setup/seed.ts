import type { GlobalSetupContext } from "vitest/node";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { createTestPdfFile } from "../utils/assets";
import { uploadTestAsset } from "../utils/api";
import { waitUntil } from "../utils/general";
import { getTrpcClient } from "../utils/trpc";

export const ADMIN_EMAIL = "admin@example.com";
export const ADMIN_PASSWORD = "test1234";

type TrpcClient = ReturnType<typeof getTrpcClient>;

/** Deterministic title of the RSS entry every fresh `feed.xml` fetch
 *  produces, before it's renamed to `QA Feed Entry` (see
 *  `findOrCreateFeedEntry`). Sourced from `setup/html/feed.xml`'s first
 *  `<item><title>` — never assumed, always validated against the actual
 *  import before the rename happens. */
const ORIGINAL_FIRST_FEED_TITLE = "First Test Article";
/** The fixture's second entry, left untouched by the seed — its presence
 *  is still validated so a broken/edited `feed.xml` fails loudly here
 *  rather than as a confusing UI mismatch later. */
const ORIGINAL_SECOND_FEED_TITLE = "Second Test Article";

export interface PersonaSeed {
  articleBookmarkId: string;
  pdfBookmarkId: string;
  videoBookmarkId: string;
  noteBookmarkId: string;
  feedEntryBookmarkId: string;
  researchTagId: string;
  readingTagId: string;
  seedListId: string;
  /** Total non-archived bookmark count right after seeding (the FILES
   *  header's starting `N items` value the personas assert against). */
  totalBookmarkCount: number;
  /** Bookmarks tagged `research` right after seeding. The tag exists (so
   *  it's selectable from the tag combobox) but is attached to nothing —
   *  seeding attaches it to the article only to prove the tag row isn't
   *  orphaned, then detaches it again so the researcher persona's own
   *  "assign existing tag" check (charter A.4) starts from a clean 0. */
  researchTagCount: number;
  /** Bookmarks tagged `reading` right after seeding — created bare, never
   *  attached to anything, so this is always 0. */
  readingTagCount: number;
  /** Bookmarks in `QA Seed List` right after seeding — see
   *  `SEED_LIST_STARTING_MEMBER` for which bookmark and why. */
  seedListCount: number;
}

/** Creates the shared admin user + full-access API key. Idempotent only in
 *  the sense that it is called once per stack lifetime (a fresh compose
 *  stack has no existing users) — matches the pre-existing contract used by
 *  both the normal e2e vitest suite and the QA persona runner. */
export async function seedAdmin(): Promise<{ apiKey: string }> {
  const trpc = getTrpcClient();
  await trpc.users.create.mutate({
    name: "Test User",
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    confirmPassword: ADMIN_PASSWORD,
  });

  const { key } = await trpc.apiKeys.exchange.mutate({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    keyName: "test-key",
  });
  return { apiKey: key };
}

async function findOrCreateTag(trpc: TrpcClient, name: string) {
  const { tags } = await trpc.tags.list.query({ nameContains: name });
  const existing = tags.find((tag) => tag.name === name);
  if (existing) return existing;
  return trpc.tags.create.mutate({ name });
}

async function findOrCreateList(trpc: TrpcClient, name: string) {
  const { lists } = await trpc.lists.list.query();
  const existing = lists.find((list) => list.name === name);
  if (existing) return existing;
  return trpc.lists.create.mutate({ name, icon: "folder", type: "manual" });
}

/** Reads back real post-crawl/import counts rather than assuming them, so
 *  `personaSeed` is always what's actually on the server before UI QA
 *  begins. Seeding is genuinely idempotent: every deterministic entity
 *  (tag, list, bookmark, feed) is looked up by its fixed name/title first
 *  and reused verbatim if found, so calling this twice against the same
 *  stack never creates a duplicate or repeats a side-effecting op (asset
 *  upload, crawl, feed fetch) whose result is already on disk. */
export async function seedPersonaData(
  apiKey: string,
  karakeepPort: number,
): Promise<PersonaSeed> {
  const trpc = getTrpcClient(apiKey);

  // Snapshot of whatever already exists (a re-run against an already-seeded
  // stack) — every "does this deterministic bookmark already exist" check
  // below reads from this instead of re-querying, since nothing this
  // function does removes a bookmark.
  const { bookmarks: existingBookmarks } =
    await trpc.bookmarks.getBookmarks.query({
      archived: false,
    });
  const existingByTitle = new Map(
    existingBookmarks.filter((b) => b.title).map((b) => [b.title as string, b]),
  );

  // Two starting tags, created bare (no attachments yet) so they show up
  // as existing/selectable options in the tag combobox without pre-biasing
  // any per-tag count the personas assert on.
  const researchTag = await findOrCreateTag(trpc, "research");
  const readingTag = await findOrCreateTag(trpc, "reading");

  // Starting manual list — given an explicit, validated starting
  // membership (see SEED_LIST_STARTING_MEMBER below) rather than left
  // empty, per the architecture spec (section 2, item 3).
  const seedList = await findOrCreateList(trpc, "QA Seed List");

  // 1. QA Article — a plain crawled link. Distinct query string from the
  // bare `hello.html` feed.xml's first RSS item links to — otherwise the
  // URL-dedup in findOrCreateFeedEntry's import would fold that item into
  // this bookmark instead of creating its own.
  const article =
    existingByTitle.get("QA Article") ??
    (await trpc.bookmarks.createBookmark.mutate({
      type: BookmarkTypes.LINK,
      url: "http://nginx:80/hello.html?article=qa-seed",
      title: "QA Article",
    }));

  // 2. QA PDF — an uploaded asset bookmark (no crawl involved). The upload
  // itself only runs when no such bookmark exists yet — re-uploading on
  // every idempotent re-seed would be pure waste.
  const pdf =
    existingByTitle.get("QA PDF") ??
    (await (async () => {
      const pdfUpload = await uploadTestAsset(
        apiKey,
        karakeepPort,
        createTestPdfFile(),
      );
      return trpc.bookmarks.createBookmark.mutate({
        type: BookmarkTypes.ASSET,
        assetType: "pdf",
        assetId: pdfUpload.assetId,
        title: "QA PDF",
      });
    })());

  // 3. QA Video — a crawled link whose page embeds a downloadable video.
  const video =
    existingByTitle.get("QA Video") ??
    (await trpc.bookmarks.createBookmark.mutate({
      type: BookmarkTypes.LINK,
      url: "http://nginx:80/video.html",
      title: "QA Video",
    }));

  // 4. QA Note — a plain text bookmark (no crawl, no thumbnail ever).
  const note =
    existingByTitle.get("QA Note") ??
    (await trpc.bookmarks.createBookmark.mutate({
      type: BookmarkTypes.TEXT,
      text: "Persona seed note — created directly, never crawled.",
      title: "QA Note",
    }));

  // 5. QA Feed Entry — imported via the existing feed.xml fixture (shared
  // with tests/workers/feed.test.ts). See findOrCreateFeedEntry for the
  // original-title validation and rename.
  const feedEntryBookmark = await findOrCreateFeedEntry(trpc, existingByTitle);

  // Documented starting membership for QA Seed List: the note bookmark,
  // chosen because it's never crawled and never touched by any persona
  // checklist item, so its list membership can't drift for reasons
  // unrelated to this seed. Added only if not already a member (idempotent
  // re-seed).
  const seedListMembers = await trpc.bookmarks.getBookmarks.query({
    archived: false,
    listId: seedList.id,
  });
  if (!seedListMembers.bookmarks.some((b) => b.id === note.id)) {
    await trpc.lists.addToList.mutate({
      listId: seedList.id,
      bookmarkId: note.id,
    });
  }

  // research: attached to the article now, so the researcher persona's
  // later "assign existing tag" step (charter A.4) has a real pre-existing
  // tag to pick from without it also pre-seeding the *new* row the persona
  // creates during the run.
  await trpc.bookmarks.updateTags.mutate({
    bookmarkId: article.id,
    attach: [{ tagName: researchTag.name }],
    detach: [],
  });
  // Immediately detach again — the persona itself performs this exact
  // attach through the UI (charter A.4); this round-trip only guarantees
  // the tag row is not orphaned/unlisted in the combobox before the run.
  await trpc.bookmarks.updateTags.mutate({
    bookmarkId: article.id,
    attach: [],
    detach: [{ tagId: researchTag.id, tagName: researchTag.name }],
  });

  // Wait (bounded) for the video attachment so downstream UI checks that
  // open the QA Video detail see a settled bookmark, not a pending crawl.
  // Runs regardless of whether the bookmark was just created or reused, in
  // case a prior run's crawl never finished.
  await waitUntil(
    async () => {
      const data = await trpc.bookmarks.getBookmark.query({
        bookmarkId: video.id,
      });
      return data.content.type === "link" && !!data.content.videoAssetId;
    },
    "Persona seed video attachment is downloaded",
    120000,
  );

  const [finalCount, researchCount, readingCount, seedListCount] =
    await Promise.all([
      trpc.bookmarks.getBookmarks.query({ archived: false }),
      trpc.bookmarks.getBookmarks.query({
        archived: false,
        tagId: researchTag.id,
      }),
      trpc.bookmarks.getBookmarks.query({
        archived: false,
        tagId: readingTag.id,
      }),
      trpc.bookmarks.getBookmarks.query({
        archived: false,
        listId: seedList.id,
      }),
    ]);

  return {
    articleBookmarkId: article.id,
    pdfBookmarkId: pdf.id,
    videoBookmarkId: video.id,
    noteBookmarkId: note.id,
    feedEntryBookmarkId: feedEntryBookmark.id,
    researchTagId: researchTag.id,
    readingTagId: readingTag.id,
    seedListId: seedList.id,
    totalBookmarkCount: finalCount.bookmarks.length,
    researchTagCount: researchCount.bookmarks.length,
    readingTagCount: readingCount.bookmarks.length,
    seedListCount: seedListCount.bookmarks.length,
  };
}

/** Finds the already-renamed `QA Feed Entry` bookmark if a prior seed run
 *  already produced it (idempotent re-seed); otherwise creates the feed,
 *  fetches it once, validates the import actually produced both of
 *  `feed.xml`'s original-titled entries (`First Test Article` /
 *  `Second Test Article` — a broken fixture should fail loudly here, not
 *  as a confusing UI mismatch later), and renames exactly the first one to
 *  `QA Feed Entry`. */
async function findOrCreateFeedEntry(
  trpc: TrpcClient,
  existingByTitle: Map<string, { id: string }>,
): Promise<{ id: string }> {
  const existing = existingByTitle.get("QA Feed Entry");
  if (existing) return existing;

  const feed = await trpc.feeds.create.mutate({
    name: "QA Seed Feed",
    url: "http://nginx:80/feed.xml",
    enabled: true,
  });
  await trpc.feeds.fetchNow.mutate({ feedId: feed.id });
  await waitUntil(
    async () => {
      const updated = await trpc.feeds.get.query({ feedId: feed.id });
      return updated.lastFetchedStatus === "success";
    },
    "Persona seed feed is fetched successfully",
    60000,
  );

  const { bookmarks: importedFeedEntries } =
    await trpc.bookmarks.getBookmarks.query({
      archived: false,
      rssFeedId: feed.id,
    });
  const importedTitles = new Set(importedFeedEntries.map((b) => b.title));
  for (const expectedTitle of [
    ORIGINAL_FIRST_FEED_TITLE,
    ORIGINAL_SECOND_FEED_TITLE,
  ]) {
    if (!importedTitles.has(expectedTitle)) {
      throw new Error(
        `seedPersonaData: expected the RSS import of setup/html/feed.xml to produce a bookmark titled "${expectedTitle}", found titles: ${JSON.stringify([...importedTitles])}.`,
      );
    }
  }

  const firstEntry = importedFeedEntries.find(
    (b) => b.title === ORIGINAL_FIRST_FEED_TITLE,
  );
  if (!firstEntry) {
    // Unreachable given the validation above, but keeps this function's
    // return type honest without a non-null assertion.
    throw new Error(
      `seedPersonaData: could not locate "${ORIGINAL_FIRST_FEED_TITLE}" to rename.`,
    );
  }
  await trpc.bookmarks.updateBookmark.mutate({
    bookmarkId: firstEntry.id,
    title: "QA Feed Entry",
  });
  return { id: firstEntry.id };
}

export async function setup({ provide }: GlobalSetupContext) {
  const { apiKey } = await seedAdmin();
  provide("adminApiKey", apiKey);
  return () => ({});
}

declare module "vitest" {
  export interface ProvidedContext {
    adminApiKey: string;
  }
}

/**
 * Backfills transcripts for video links saved before transcript extraction
 * existed, then re-runs summarisation for them.
 *
 * Bookmarks crawled before this feature have no transcript, and their summaries
 * were produced from the video page's HTML — which for a YouTube watch page is
 * an empty body plus a site-wide boilerplate description, so the summary tends
 * to describe YouTube rather than the video. A recrawl would also fix them, but
 * it re-fetches and re-archives every page; this touches only the video links
 * and only the two columns that were missing.
 *
 * Usage, from apps/workers:
 *   pnpm exec tsx scripts/backfillTranscripts.ts [--dry-run] [--force]
 *
 *   --dry-run  report what would change, write nothing
 *   --force    also re-fetch links that already have a transcript
 */
import { eq, isNull } from "drizzle-orm";

import { db } from "@karakeep/db";
import { bookmarkLinks } from "@karakeep/db/schema";
import { OpenAIQueue } from "@karakeep/shared-server";
import logger from "@karakeep/shared/logger";

import {
  extractTranscript,
  isLikelyVideoUrl,
} from "../workers/crawler/transcript";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

  const links = await db
    .select({
      id: bookmarkLinks.id,
      url: bookmarkLinks.url,
      transcript: bookmarkLinks.transcript,
    })
    .from(bookmarkLinks)
    .where(force ? undefined : isNull(bookmarkLinks.transcript));

  const candidates = links.filter((l) => isLikelyVideoUrl(l.url));

  logger.info(
    `[backfill] ${candidates.length} video link(s) to process${dryRun ? " (dry run)" : ""}.`,
  );

  let extracted = 0;
  let failed = 0;

  for (const link of candidates) {
    logger.info(`[backfill] ${link.url}`);
    const transcript = await extractTranscript({
      url: link.url,
      jobId: "backfill",
    });

    if (!transcript) {
      failed++;
      logger.warn(`[backfill]   no transcript available`);
      continue;
    }

    logger.info(
      `[backfill]   ${transcript.text.length} chars via ${transcript.source}`,
    );
    extracted++;

    if (dryRun) continue;

    await db
      .update(bookmarkLinks)
      .set({
        transcript: transcript.text,
        transcriptSource: transcript.source,
      })
      .where(eq(bookmarkLinks.id, link.id));

    // Re-summarise now that there is something worth summarising. Enqueued
    // rather than run inline so it goes through the same inference worker,
    // rate limiting and user-preference checks as any other summary.
    await OpenAIQueue.enqueue({ bookmarkId: link.id, type: "summarize" });
  }

  logger.info(
    `[backfill] Done. ${extracted} transcript(s) extracted, ${failed} without one.${
      dryRun ? " Nothing was written (dry run)." : ""
    }`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error(`[backfill] Failed: ${e}`);
    process.exit(1);
  });

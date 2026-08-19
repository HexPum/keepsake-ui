/**
 * Overnight batched Instagram crawl driver.
 *
 * 1. Waits for import staging (importStagingBookmarks) to fully drain.
 * 2. Then repeatedly: pulls up to BATCH_SIZE bookmarkLinks with
 *    crawlStatus='pending', enqueues them on the same LowPriorityCrawlerQueue
 *    the admin "Recrawl Pending Links Only" button uses, waits for that
 *    batch to fully resolve (success or failure), checks the failure rate,
 *    and stops if it looks like Instagram is pushing back rather than
 *    grinding through 3000+ failures unattended.
 *
 * Run detached inside the workers container (has the cookie file, yt-dlp,
 * and the correct better-sqlite3 build). Logs to /data/overnight-crawl.log
 * (bind-mounted to ~/karakeep-data/overnight-crawl.log on the host).
 */
import { eq, inArray } from "drizzle-orm";

import {
  bookmarkLinks,
  bookmarks,
  importStagingBookmarks,
} from "@karakeep/db/schema";
import { db } from "@karakeep/db";
import {
  buildCrawlIdempotencyKey,
  LowPriorityCrawlerQueue,
  QueuePriority,
} from "@karakeep/shared-server";

const BATCH_SIZE = 200;
const FAILURE_RATE_STOP_THRESHOLD = 0.4; // stop if >40% of a batch fails
const POLL_MS = 15_000;

function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForStagingDrain() {
  log("Waiting for import staging to drain...");
  for (;;) {
    const rows = await db
      .select({ status: importStagingBookmarks.status })
      .from(importStagingBookmarks);
    const pending = rows.filter((r) => r.status === "pending").length;
    const processing = rows.filter((r) => r.status === "processing").length;
    if (pending === 0 && processing === 0) {
      const completed = rows.filter((r) => r.status === "completed").length;
      const failed = rows.filter((r) => r.status === "failed").length;
      log(
        `Staging drained: ${completed} completed, ${failed} failed (of ${rows.length}).`,
      );
      return;
    }
    await sleep(POLL_MS);
  }
}

async function getPendingLinkIds(limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: bookmarkLinks.id })
    .from(bookmarkLinks)
    .innerJoin(bookmarks, eq(bookmarkLinks.id, bookmarks.id))
    .where(eq(bookmarkLinks.crawlStatus, "pending"))
    .limit(limit);
  return rows.map((r) => r.id);
}

async function enqueueBatch(ids: string[]) {
  await Promise.all(
    ids.map((id) => {
      const payload = { bookmarkId: id, runInference: true };
      return LowPriorityCrawlerQueue.enqueue(payload, {
        priority: QueuePriority.Low,
        idempotencyKey: buildCrawlIdempotencyKey(payload),
      });
    }),
  );
}

async function waitForBatchDrain(ids: string[]) {
  for (;;) {
    const rows = await db
      .select({ id: bookmarkLinks.id, crawlStatus: bookmarkLinks.crawlStatus })
      .from(bookmarkLinks)
      .where(inArray(bookmarkLinks.id, ids));
    const stillPending = rows.filter((r) => r.crawlStatus === "pending").length;
    if (stillPending === 0) {
      const failed = rows.filter((r) => r.crawlStatus === "failure").length;
      const success = rows.filter((r) => r.crawlStatus === "success").length;
      return { success, failed, total: rows.length };
    }
    await sleep(POLL_MS);
  }
}

async function main() {
  await waitForStagingDrain();

  let batchNum = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  for (;;) {
    const ids = await getPendingLinkIds(BATCH_SIZE);
    if (ids.length === 0) {
      log(
        `All done. Totals: ${totalSuccess} succeeded, ${totalFailed} failed.`,
      );
      return;
    }

    batchNum += 1;
    log(`Batch ${batchNum}: enqueueing ${ids.length} link(s)...`);
    await enqueueBatch(ids);

    const { success, failed, total } = await waitForBatchDrain(ids);
    totalSuccess += success;
    totalFailed += failed;
    const failureRate = total > 0 ? failed / total : 0;
    log(
      `Batch ${batchNum} done: ${success} succeeded, ${failed} failed ` +
        `(${(failureRate * 100).toFixed(0)}% failure rate). ` +
        `Running totals: ${totalSuccess} succeeded, ${totalFailed} failed.`,
    );

    if (failureRate > FAILURE_RATE_STOP_THRESHOLD) {
      log(
        `STOPPING: batch ${batchNum} failure rate ${(failureRate * 100).toFixed(0)}% ` +
          `exceeds ${FAILURE_RATE_STOP_THRESHOLD * 100}% threshold — looks like ` +
          `Instagram pushback (rate limit / block / cookie expiry) rather than ` +
          `isolated bad links. Remaining pending links were left untouched so ` +
          `this can be resumed after checking what's actually happening.`,
      );
      return;
    }
  }
}

main()
  .then(() => {
    log("Overnight crawl driver finished.");
    process.exit(0);
  })
  .catch((e) => {
    log(`FATAL: ${e?.stack ?? e}`);
    process.exit(1);
  });

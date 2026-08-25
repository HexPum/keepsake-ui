import { and, eq } from "drizzle-orm";
import { getBookmarkDomain } from "network";
import { z } from "zod";

import { db } from "@karakeep/db";
import { bookmarks, customPrompts, users } from "@karakeep/db/schema";
import {
  addLogFields,
  setSpanAttributes,
  triggerSearchReindex,
  ZOpenAIRequest,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { InferenceClient } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import {
  buildSummaryPrompt,
  buildVideoSummaryPrompt,
} from "@karakeep/shared/prompts.server";
import { DequeuedJob } from "@karakeep/shared/queueing";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

import type { InferenceOutcome } from "./inferenceWorker";
import { parseJsonFromLLMResponse } from "./llmJson";

/**
 * Title + summary for a video with a transcript — see
 * constructVideoSummaryPrompt for why this needs structured output instead
 * of the free-form text every other bookmark gets.
 */
const videoSummarySchema = z.object({
  title: z.string(),
  summary: z.string(),
});

async function fetchBookmarkDetailsForSummary(bookmarkId: string) {
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: { id: true, userId: true, type: true },
    with: {
      link: {
        columns: {
          title: true,
          description: true,
          htmlContent: true,
          contentAssetId: true,
          crawlStatusCode: true,
          publisher: true,
          author: true,
          url: true,
          transcript: true,
          transcriptSource: true,
        },
      },
      // If assets (like PDFs with extracted text) should be summarized, extend here
    },
  });

  if (!bookmark) {
    throw new Error(`Bookmark with id ${bookmarkId} not found`);
  }
  return bookmark;
}

export async function runSummarization(
  bookmarkId: string,
  job: DequeuedJob<ZOpenAIRequest>,
  inferenceClient: InferenceClient,
): Promise<InferenceOutcome> {
  if (!serverConfig.inference.enableAutoSummarization) {
    logger.debug(
      `[inference][${job.id}] Skipping summarization job for bookmark with id "${bookmarkId}" because it's disabled in the config.`,
    );
    return "skipped";
  }
  const jobId = job.id;

  logger.info(
    `[inference][${jobId}] Starting a summary job for bookmark with id "${bookmarkId}"`,
  );

  const bookmarkData = await fetchBookmarkDetailsForSummary(bookmarkId);

  // Check user-level preference
  const userSettings = await db.query.users.findFirst({
    where: eq(users.id, bookmarkData.userId),
    columns: {
      autoSummarizationEnabled: true,
      inferredTagLang: true,
    },
  });

  setSpanAttributes({
    "user.id": bookmarkData.userId,
    "bookmark.id": bookmarkData.id,
    "inference.type": "summarization",
  });
  addLogFields<"inferenceWorker.run">({
    "user.id": bookmarkData.userId,
    "bookmark.url": bookmarkData.link?.url,
    "bookmark.domain": getBookmarkDomain(bookmarkData.link?.url),
    "bookmark.content_type": bookmarkData.type,
    "crawler.status_code": bookmarkData.link?.crawlStatusCode ?? undefined,
    "inference.model": serverConfig.inference.textModel,
  });

  if (userSettings?.autoSummarizationEnabled === false) {
    logger.debug(
      `[inference][${jobId}] Skipping summarization job for bookmark with id "${bookmarkId}" because user has disabled auto-summarization.`,
    );
    return "skipped";
  }

  let textToSummarize = "";
  // Set inside the branch below when the bookmark is a video with a
  // transcript — read afterwards to pick the prompt/schema/DB write that
  // also produces a title, not just a summary.
  let isVideoWithTranscript = false;
  if (bookmarkData.type === BookmarkTypes.LINK && bookmarkData.link) {
    const link = bookmarkData.link;

    // Extract plain text content from HTML for summarization
    let content =
      (await Bookmark.getBookmarkPlainTextContent(link, bookmarkData.userId)) ??
      "";

    if (!link.description && !content && !link.transcript) {
      // No content to infer from; skip summarization
      logger.info(
        `[inference] No content found for link "${bookmarkId}". Skipping summary.`,
      );
      return "skipped";
    }

    // A transcript is the *only* signal a video link carries that the caption
    // doesn't already give it — the crawled page is empty HTML plus a
    // site-wide boilerplate description, so there's nothing else worth
    // adding. Caption/title/description stay in, though: on Instagram in
    // particular the page's own <title> *is* the caption, and it's often the
    // richer, more deliberate text — a summary built from the transcript
    // alone undersells what the caption already says clearly. Labelled with
    // its provenance because ASR output is noisier than a real subtitle
    // track and the model should weigh it as such.
    isVideoWithTranscript = !!link.transcript;
    if (isVideoWithTranscript) {
      const sourceLabel =
        link.transcriptSource === "asr"
          ? "auto-transcribed from the audio, may contain recognition errors"
          : "from the video's own subtitle track";
      textToSummarize = `
Title: ${link.title ?? ""}
Description: ${link.description ?? ""}
Publisher: ${link.publisher ?? ""}
Author: ${link.author ?? ""}
URL: ${link.url ?? ""}

The following is the transcript of the linked video (${sourceLabel}) — what is
actually said or shown in the video itself, as opposed to the caption/title
above.

Transcript: ${link.transcript}
`;
    } else {
      textToSummarize = `
Title: ${link.title ?? ""}
Description: ${link.description ?? ""}
Content: ${content}
Publisher: ${link.publisher ?? ""}
Author: ${link.author ?? ""}
URL: ${link.url ?? ""}
`;
    }
  } else {
    logger.warn(
      `[inference][${jobId}] Bookmark ${bookmarkId} (type: ${bookmarkData.type}) is not a LINK or TEXT type with content, or content is missing. Skipping summary.`,
    );
    return "skipped";
  }

  if (!textToSummarize.trim()) {
    logger.info(
      `[inference][${jobId}] No content to summarize for bookmark ${bookmarkId}.`,
    );
    return "skipped";
  }

  const prompts = await db.query.customPrompts.findMany({
    where: and(
      eq(customPrompts.userId, bookmarkData.userId),
      eq(customPrompts.appliesTo, "summary"),
    ),
    columns: {
      text: true,
    },
  });

  addLogFields<"inferenceWorker.run">({
    "inference.prompt.custom_count": prompts.length,
  });

  const lang =
    userSettings?.inferredTagLang ?? serverConfig.inference.inferredTagLang;
  const customPromptTexts = prompts.map((p) => p.text);

  const summaryPrompt = isVideoWithTranscript
    ? await buildVideoSummaryPrompt(
        lang,
        customPromptTexts,
        textToSummarize,
        serverConfig.inference.contextLength,
      )
    : await buildSummaryPrompt(
        lang,
        customPromptTexts,
        textToSummarize,
        serverConfig.inference.contextLength,
      );

  addLogFields<"inferenceWorker.run">({
    "inference.prompt.size": Buffer.byteLength(summaryPrompt, "utf8"),
  });

  const summaryResult = await inferenceClient.inferFromText(summaryPrompt, {
    // The video path asks for {title, summary} JSON; every other bookmark
    // gets free-form summary text, which is typically the better fit for
    // whatever a summary model produces unprompted.
    schema: isVideoWithTranscript ? videoSummarySchema : null,
    abortSignal: job.abortSignal,
  });

  if (!summaryResult.response) {
    throw new Error(
      `[inference][${jobId}] Failed to summarize bookmark ${bookmarkId}, empty response from inference client.`,
    );
  }

  addLogFields<"inferenceWorker.run">({
    "inference.summary.size": Buffer.byteLength(summaryResult.response, "utf8"),
    "inference.total_tokens": summaryResult.totalTokens,
  });

  // The video path's title is a genuine enhancement — falling back to a
  // free-form summary (dropping the title entirely) on a JSON hiccup beats
  // failing the whole job over a title the rest of the app already has a
  // fallback for (getDenseRowTitle falls back to the crawled page title).
  let title: string | undefined;
  let summary = summaryResult.response;
  if (isVideoWithTranscript) {
    const parsed = videoSummarySchema.safeParse(
      parseJsonFromLLMResponse(summaryResult.response),
    );
    if (parsed.success) {
      title = parsed.data.title.trim() || undefined;
      summary = parsed.data.summary;
    } else {
      logger.warn(
        `[inference][${jobId}] Video summary response for bookmark ${bookmarkId} wasn't the expected {title, summary} JSON (${parsed.error.message}). Storing it as a plain summary instead.`,
      );
    }
  }

  logger.info(
    `[inference][${jobId}] Generated ${title ? "title + " : ""}summary for bookmark "${bookmarkId}" using ${summaryResult.totalTokens} tokens.`,
  );

  await db
    .update(bookmarks)
    .set({
      summary,
      ...(title ? { title } : {}),
      modifiedAt: new Date(),
    })
    .where(eq(bookmarks.id, bookmarkId));

  await triggerSearchReindex(bookmarkId, {
    priority: job.priority,
    groupId: bookmarkData.userId,
  });

  return "done";
}

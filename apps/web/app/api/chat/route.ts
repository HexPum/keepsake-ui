import { NextRequest } from "next/server";
import { getDenseRowTitle } from "@/lib/dense/bookmarkDisplay";
import {
  createContextFromRequest,
  createTrcpClientFromCtx,
} from "@/server/api/client";
import { z } from "zod";

import { streamChatCompletion } from "@karakeep/shared/chatInference";
import serverConfig from "@karakeep/shared/config";
import { constructChatPrompt } from "@karakeep/shared/prompts";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";

// Deliberately minimal and one-shot: no chatSessions/chatMessages writes, no
// conversation persistence. See the plan this was built from for why —
// Karakeep already has unused schema/config reserved for its own future
// chat feature, and this keeps the fork's footprint additive-only so it's
// easy to swap out once that ships.
export const dynamic = "force-dynamic";

const zChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
});

// The full-text search index (Meilisearch, via bookmarks.searchBookmarks) is
// configured with matchingStrategy "all": every query term must be present
// in a hit. That's fine for the search bar's short, keyword-style queries,
// but a natural-language chat question like "What have I saved about Claude
// Code?" is mostly stopwords, and requiring "what"/"have"/"i"/"saved"/"about"
// to all match a bookmark's title/summary/tags means it never does — the
// query matches zero documents even when "Claude Code" is a real tag on
// several bookmarks. Strip common English stopwords/question words before
// using the message as a search query, so retrieval sees the actual topic
// keywords instead of the whole sentence.
const CHAT_SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "am",
  "be",
  "been",
  "being",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "what",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "about",
  "above",
  "across",
  "after",
  "against",
  "along",
  "among",
  "around",
  "at",
  "before",
  "behind",
  "below",
  "beside",
  "between",
  "by",
  "down",
  "during",
  "for",
  "from",
  "in",
  "into",
  "near",
  "of",
  "off",
  "on",
  "onto",
  "out",
  "over",
  "through",
  "to",
  "toward",
  "under",
  "until",
  "up",
  "with",
  "within",
  "without",
  "and",
  "or",
  "but",
  "if",
  "because",
  "as",
  "while",
  "saved",
  "save",
  "saving",
  "bookmark",
  "bookmarked",
  "bookmarks",
  "find",
  "found",
  "tell",
  "show",
  "know",
  "recall",
  "remember",
]);

/**
 * Reduces a natural-language chat message to its content keywords, for use
 * as search-index queries (see CHAT_SEARCH_STOPWORDS above for why). Falls
 * back to the original message if stripping stopwords leaves nothing.
 *
 * Contractions (e.g. "I've", "what's") are collapsed *before* punctuation is
 * stripped to plain spaces, so "I've" reduces to the stopword "i" instead of
 * splitting into "i" + the stray, non-stopword fragment "ve" — a fragment
 * like that used to survive filtering and get joined back into the query,
 * where it could never match a real document.
 */
function extractSearchKeywords(message: string): string[] {
  const words = message
    .replace(/'(ve|re|ll|d|m|s)\b/gi, "")
    .replace(/[?!.,;:'"()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const keywords = words.filter(
    (word) => !CHAT_SEARCH_STOPWORDS.has(word.toLowerCase()),
  );
  return keywords.length > 0 ? keywords : [message];
}

/**
 * Retrieves bookmarks relevant to the chat message.
 *
 * The underlying full-text index (Meilisearch) is configured with
 * `matchingStrategy: "all"` — every term in the query string must be present
 * in a hit. That's the right choice for the search bar's short keyword
 * queries, but even after stopword-stripping, a topic like "cybersecurity"
 * is mostly a *tag*, not title/summary text, and joining multiple extracted
 * keywords into one query still demands all of them match a single
 * document. Rather than keep tuning keyword extraction to chase that
 * (fragile against phrasing and emoji-heavy titles), query each keyword
 * separately — giving "any keyword matches" behavior — and merge/dedupe the
 * results. The full joined phrase is tried first since a precise multi-word
 * match, when it happens, ranks better.
 *
 * Two-round-trip lesson from "camping and outdoors": the phrase-then-
 * keyword-fallback approach above still failed even though every extracted
 * keyword, queried in isolation, returned the right bookmarks. The cause
 * wasn't keyword extraction dropping "camping"/"outdoors" - it was that a
 * single broad, non-stopword filler keyword (e.g. "related") loosely
 * matched many unrelated bookmarks via title/summary text, filled the
 * *entire* shared result budget by itself via the old `results.size >=
 * limit` early exit, and starved out the later, more specific keyword
 * queries before they ever ran. Fix: every extracted keyword always gets
 * its turn (no early exit on cumulative size), and each individual keyword
 * query's contribution to the merged set is capped to a fraction of the
 * overall limit, so no single keyword - however generic - can crowd out
 * the others. The exact joined phrase is exempt from the cap:
 * `matchingStrategy: "all"` requires every term to match one document, so
 * a phrase hit is inherently precise, not a source of noise.
 */
async function retrieveBookmarks(
  caller: ReturnType<typeof createTrcpClientFromCtx>,
  message: string,
  searchMode: "fts" | "hybrid",
  limit: number,
): Promise<ZBookmark[]> {
  const keywords = extractSearchKeywords(message);
  const phrase = keywords.join(" ");
  const perKeywordCap = Math.max(2, Math.ceil(limit / keywords.length));
  const queries = [phrase, ...keywords].filter(
    (q, i, arr) => q.length > 0 && arr.indexOf(q) === i,
  );

  const results = new Map<string, ZBookmark>();
  for (const query of queries) {
    const cap = query === phrase ? limit : perKeywordCap;
    try {
      const { bookmarks } = await caller.bookmarks.searchBookmarks({
        text: query,
        searchMode,
        limit,
      });
      let added = 0;
      for (const bookmark of bookmarks) {
        if (added >= cap) {
          break;
        }
        if (!results.has(bookmark.id)) {
          results.set(bookmark.id, bookmark);
          added++;
        }
      }
    } catch {
      // Retrieval is best-effort per query: one bad/empty query shouldn't
      // stop the others from contributing results.
    }
  }
  return Array.from(results.values()).slice(0, limit);
}

/** Assembles retrieved bookmarks into plain-text context for the prompt. */
function buildRetrievedContext(bookmarks: ZBookmark[]): string {
  return bookmarks
    .map((bookmark) => {
      const parts = [`Title: ${getDenseRowTitle(bookmark)}`];
      if (bookmark.summary) {
        parts.push(`Summary: ${bookmark.summary}`);
      }
      if (bookmark.note) {
        parts.push(`Note: ${bookmark.note}`);
      }
      if (bookmark.tags.length > 0) {
        parts.push(`Tags: ${bookmark.tags.map((tag) => tag.name).join(", ")}`);
      }
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

export async function POST(request: NextRequest) {
  const ctx = await createContextFromRequest(request);
  if (!ctx.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!serverConfig.chat.enabled) {
    return Response.json({ error: "Chat is not enabled" }, { status: 404 });
  }
  if (!serverConfig.inference.isConfigured) {
    return Response.json(
      { error: "No AI provider is configured on the server" },
      { status: 503 },
    );
  }

  const parsed = zChatRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { message } = parsed.data;

  // Reuse the same search procedure the search bar already calls, instead
  // of hand-rolling embedding + vector search + bookmark loading — it's
  // already per-user scoped and already falls back sensibly.
  const caller = createTrcpClientFromCtx(() => ctx);
  const searchMode =
    serverConfig.experimentalFeatures.semanticSearch &&
    serverConfig.embedding.enableAutoIndexing
      ? "hybrid"
      : "fts";

  let retrievedContext = "";
  try {
    const bookmarks = await retrieveBookmarks(caller, message, searchMode, 8);
    retrievedContext = buildRetrievedContext(bookmarks);
  } catch {
    // Retrieval is best-effort: fall back to answering with no bookmark
    // context rather than failing the whole request over a search error.
  }

  const prompt = constructChatPrompt(message, retrievedContext);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of streamChatCompletion(prompt)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
          );
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: e instanceof Error ? e.message : "Something went wrong",
            })}\n\n`,
          ),
        );
      } finally {
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

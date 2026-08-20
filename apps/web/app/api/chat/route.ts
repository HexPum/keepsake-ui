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
    const { bookmarks } = await caller.bookmarks.searchBookmarks({
      text: message,
      searchMode,
      limit: 8,
    });
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

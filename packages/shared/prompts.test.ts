import { describe, expect, test } from "vitest";

import { constructChatPrompt } from "./prompts";

describe("constructChatPrompt", () => {
  test("includes the user's question verbatim", () => {
    const prompt = constructChatPrompt(
      "What did I save about rust async?",
      "- Title: Tokio guide",
    );
    expect(prompt).toContain("Question: What did I save about rust async?");
  });

  test("embeds the provided retrieved context", () => {
    const context = "- Title: Tokio guide | Summary: async runtime for Rust";
    const prompt = constructChatPrompt("anything", context);
    expect(prompt).toContain(context);
    // The fallback must NOT appear when real context is supplied.
    expect(prompt).not.toContain("(no matching bookmarks were found)");
  });

  test("falls back to a no-results marker when context is empty", () => {
    const prompt = constructChatPrompt("anything", "");
    expect(prompt).toContain("(no matching bookmarks were found)");
  });

  test("keeps the grounding instruction that forbids guessing", () => {
    const prompt = constructChatPrompt("q", "ctx");
    // The whole point of the RAG prompt is to keep the model from
    // answering outside the retrieved bookmarks.
    expect(prompt.toLowerCase()).toContain("base your answer only on");
    expect(prompt.toLowerCase()).toContain("instead of guessing");
  });

  test("places the retrieved context before the question", () => {
    const prompt = constructChatPrompt("my question", "MY_CONTEXT_MARKER");
    const contextIdx = prompt.indexOf("MY_CONTEXT_MARKER");
    const questionIdx = prompt.indexOf("Question: my question");
    expect(contextIdx).toBeGreaterThanOrEqual(0);
    expect(questionIdx).toBeGreaterThan(contextIdx);
  });

  test("inserts the question literally without interpreting template syntax", () => {
    const tricky = "What about ${process.env.SECRET} and `backticks`?";
    const prompt = constructChatPrompt(tricky, "ctx");
    expect(prompt).toContain(`Question: ${tricky}`);
  });

  test("treats a whitespace-only context as present (only empty string triggers the fallback)", () => {
    // Documents the `|| fallback` behaviour: a non-empty string, even one
    // that is only whitespace, is used as-is and does not trigger the
    // no-results marker.
    const prompt = constructChatPrompt("q", "   ");
    expect(prompt).not.toContain("(no matching bookmarks were found)");
  });
});

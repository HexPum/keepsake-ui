import { describe, expect, it } from "vitest";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import {
  extractSearchKeywords,
  isTagMatch,
  prioritizeByTagMatch,
} from "./retrieval";

function bookmark(id: string, tagNames: string[] = []): ZBookmark {
  return {
    id,
    tags: tagNames.map((name) => ({
      id: `tag-${name}`,
      name,
      attachedBy: "ai",
    })),
  } as unknown as ZBookmark;
}

describe("extractSearchKeywords", () => {
  it("strips stopwords/question words from a natural-language message", () => {
    expect(
      extractSearchKeywords("What have I saved about Claude Code?"),
    ).toEqual(["Claude", "Code"]);
  });

  it("collapses contractions before stopword filtering so no stray fragment survives", () => {
    // "I've" must reduce to nothing (the stopword "i"), not leak a bogus
    // "ve" token that could never match a real document.
    expect(
      extractSearchKeywords("I've saved stuff about cybersecurity"),
    ).toEqual(["stuff", "cybersecurity"]);
  });

  it("falls back to the original message if nothing survives stopword stripping", () => {
    expect(extractSearchKeywords("what is this")).toEqual(["what is this"]);
  });
});

describe("isTagMatch", () => {
  it("matches case-insensitively against a bookmark's real tags", () => {
    const b = bookmark("1", ["Camping", "Outdoors"]);
    expect(isTagMatch(b, "camping")).toBe(true);
    expect(isTagMatch(b, "CAMPING")).toBe(true);
    expect(isTagMatch(b, "fishing")).toBe(false);
  });
});

describe("prioritizeByTagMatch", () => {
  it("sorts genuine tag matches ahead of loose text-only matches", () => {
    // Regression for the "camping and outdoors" under-retrieval bug: a
    // keyword's own search results can rank loosely-matching bookmarks
    // ahead of the bookmark that's actually tagged with it. The caller
    // applies a small per-keyword budget to these results, so if the real
    // tag match isn't moved to the front, it can get crowded out by the
    // loose matches before the budget runs out.
    const looseMatchA = bookmark("loose-a", ["unrelated"]);
    const looseMatchB = bookmark("loose-b", ["unrelated"]);
    const realTagMatch = bookmark("tree-climbing", ["outdoors"]);

    const result = prioritizeByTagMatch(
      [looseMatchA, looseMatchB, realTagMatch],
      "outdoors",
    );

    expect(result[0].id).toBe("tree-climbing");
  });

  it("is stable within each group, preserving the search engine's own relevance order", () => {
    const tagMatchFirst = bookmark("a", ["outdoors"]);
    const tagMatchSecond = bookmark("b", ["outdoors"]);
    const looseMatch = bookmark("c", ["unrelated"]);

    const result = prioritizeByTagMatch(
      [tagMatchFirst, looseMatch, tagMatchSecond],
      "outdoors",
    );

    expect(result.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves an already-tag-first result set unchanged", () => {
    const realTagMatch = bookmark("haven-spectre", ["camping", "outdoors"]);
    const looseMatch = bookmark("loose", ["unrelated"]);

    const result = prioritizeByTagMatch([realTagMatch, looseMatch], "camping");

    expect(result.map((b) => b.id)).toEqual(["haven-spectre", "loose"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  matchSnippet,
  queryMatches,
  splitByQueryMatch,
} from "./searchHighlight";

describe("splitByQueryMatch", () => {
  it("splits a single match out of the surrounding text", () => {
    expect(splitByQueryMatch("A dog on a beach", "dog")).toEqual([
      { text: "A ", matched: false },
      { text: "dog", matched: true },
      { text: " on a beach", matched: false },
    ]);
  });

  it("matches case-insensitively", () => {
    expect(splitByQueryMatch("A DOG on a beach", "dog")).toEqual([
      { text: "A ", matched: false },
      { text: "DOG", matched: true },
      { text: " on a beach", matched: false },
    ]);
  });

  it("matches every word of a multi-word query independently", () => {
    expect(splitByQueryMatch("A dog runs on a beach", "dog beach")).toEqual([
      { text: "A ", matched: false },
      { text: "dog", matched: true },
      { text: " runs on a ", matched: false },
      { text: "beach", matched: true },
    ]);
  });

  it("doesn't let a shorter word pre-empt a longer one that contains it", () => {
    expect(splitByQueryMatch("instagram post", "insta in")).toEqual([
      { text: "insta", matched: true },
      { text: "gram post", matched: false },
    ]);
  });

  it("returns the whole text unmatched for an empty query", () => {
    expect(splitByQueryMatch("A dog on a beach", "")).toEqual([
      { text: "A dog on a beach", matched: false },
    ]);
  });

  it("returns the whole text unmatched when nothing matches", () => {
    expect(splitByQueryMatch("A dog on a beach", "cat")).toEqual([
      { text: "A dog on a beach", matched: false },
    ]);
  });
});

describe("queryMatches", () => {
  it("is true when a query word appears in the text", () => {
    expect(queryMatches("A dog on a beach", "dog")).toBe(true);
  });

  it("is false when no query word appears", () => {
    expect(queryMatches("A dog on a beach", "cat")).toBe(false);
  });

  it("is false for empty/null text or an empty query", () => {
    expect(queryMatches(null, "dog")).toBe(false);
    expect(queryMatches("A dog on a beach", "")).toBe(false);
  });
});

describe("matchSnippet", () => {
  it("returns a window of text centred on the first match", () => {
    const text = "a".repeat(20) + "MATCH" + "b".repeat(20);
    expect(matchSnippet(text, "match", 5)).toBe(
      "…" + "a".repeat(5) + "MATCH" + "b".repeat(5) + "…",
    );
  });

  it("omits the ellipsis at an edge the window doesn't truncate", () => {
    expect(matchSnippet("the dog barks", "dog", 50)).toBe("the dog barks");
  });

  it("returns null when there's no match", () => {
    expect(matchSnippet("the dog barks", "cat", 50)).toBeNull();
  });

  it("returns null for an empty query", () => {
    expect(matchSnippet("the dog barks", "", 50)).toBeNull();
  });
});

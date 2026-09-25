import { describe, expect, test } from "vitest";

import {
  buildBookmarkSearchHref,
  resolveBookmarkSearchMode,
} from "./bookmarkSearchMode";

describe("resolveBookmarkSearchMode", () => {
  test("defaults to hybrid when semantic search is available", () => {
    expect(resolveBookmarkSearchMode(null, true)).toBe("hybrid");
    expect(resolveBookmarkSearchMode("unknown", true)).toBe("hybrid");
  });

  test("defaults to keyword search when semantic search is unavailable", () => {
    expect(resolveBookmarkSearchMode(null, false)).toBe("fts");
    expect(resolveBookmarkSearchMode("semantic", false)).toBe("fts");
    expect(resolveBookmarkSearchMode("hybrid", false)).toBe("fts");
  });

  test("preserves every explicitly available search mode", () => {
    expect(resolveBookmarkSearchMode("fts", true)).toBe("fts");
    expect(resolveBookmarkSearchMode("semantic", true)).toBe("semantic");
    expect(resolveBookmarkSearchMode("hybrid", true)).toBe("hybrid");
  });
});

describe("buildBookmarkSearchHref", () => {
  test("uses a compact link for the hybrid default", () => {
    expect(buildBookmarkSearchHref("warm evening light", "hybrid")).toBe(
      "/dashboard/search?q=warm+evening+light",
    );
  });

  test("keeps the semantic-only mode deep-linkable", () => {
    expect(buildBookmarkSearchHref("warm evening light", "semantic")).toBe(
      "/dashboard/search?q=warm+evening+light&mode=semantic",
    );
  });

  test("keeps an explicit keyword choice when hybrid is the default", () => {
    expect(buildBookmarkSearchHref("tag:reading", "fts")).toBe(
      "/dashboard/search?q=tag%3Areading&mode=fts",
    );
  });
});

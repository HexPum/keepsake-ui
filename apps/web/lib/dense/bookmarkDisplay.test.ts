import { describe, expect, it } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { shouldDefaultOpenContentDisclosure } from "./bookmarkDisplay";

describe("shouldDefaultOpenContentDisclosure", () => {
  it("defaults open for text (note) bookmarks — their own typed body is the disclosure's content, not reference material", () => {
    expect(shouldDefaultOpenContentDisclosure(BookmarkTypes.TEXT)).toBe(true);
  });

  it("defaults closed for links — the crawled original is reference material behind the AI summary", () => {
    expect(shouldDefaultOpenContentDisclosure(BookmarkTypes.LINK)).toBe(false);
  });

  it("defaults closed for assets — same reference-material rationale as links", () => {
    expect(shouldDefaultOpenContentDisclosure(BookmarkTypes.ASSET)).toBe(false);
  });
});

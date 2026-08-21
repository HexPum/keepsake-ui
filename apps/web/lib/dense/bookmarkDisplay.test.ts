import { describe, expect, it } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import {
  estimateDetailReadingTimeMinutes,
  shouldDefaultOpenContentDisclosure,
} from "./bookmarkDisplay";

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

describe("estimateDetailReadingTimeMinutes", () => {
  it("counts words in a note's typed body", () => {
    expect(
      estimateDetailReadingTimeMinutes({
        content: {
          type: BookmarkTypes.TEXT,
          text: "one two three four five six seven eight nine ten",
        },
      }),
    ).toBe(1);
  });

  it("strips HTML tags from a link's crawled markup before counting", () => {
    const words = Array(400).fill("word").join(" ");
    expect(
      estimateDetailReadingTimeMinutes({
        content: {
          type: BookmarkTypes.LINK,
          url: "https://example.com",
          htmlContent: `<article><p>${words}</p></article>`,
        },
      }),
    ).toBe(2);
  });

  it("counts an asset's extracted text", () => {
    const words = Array(200).fill("word").join(" ");
    expect(
      estimateDetailReadingTimeMinutes({
        content: {
          type: BookmarkTypes.ASSET,
          assetType: "pdf",
          assetId: "asset-1",
          content: words,
        },
      }),
    ).toBe(1);
  });

  it("returns null when there is no content to estimate from yet", () => {
    expect(
      estimateDetailReadingTimeMinutes({
        content: { type: BookmarkTypes.LINK, url: "https://example.com" },
      }),
    ).toBeNull();
    expect(
      estimateDetailReadingTimeMinutes({
        content: { type: BookmarkTypes.UNKNOWN },
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { resolveHeaderCounts } from "./headerCounts";

describe("resolveHeaderCounts", () => {
  it("uses the server counts when they are larger than the loaded rows", () => {
    expect(
      resolveHeaderCounts({
        firstPage: { totalCount: 240, unsummarisedCount: 12 },
        loadedCount: 20,
        loadedUnsummarisedCount: 3,
      }),
    ).toEqual({ total: 240, unsummarised: 12 });
  });

  it("uses the server counts even when they are 0", () => {
    expect(
      resolveHeaderCounts({
        firstPage: { totalCount: 0, unsummarisedCount: 0 },
        loadedCount: 5,
        loadedUnsummarisedCount: 2,
      }),
    ).toEqual({ total: 0, unsummarised: 0 });
  });

  it("falls back to loaded counts when firstPage is undefined", () => {
    expect(
      resolveHeaderCounts({
        firstPage: undefined,
        loadedCount: 7,
        loadedUnsummarisedCount: 1,
      }),
    ).toEqual({ total: 7, unsummarised: 1 });
  });

  it("falls back to loaded counts when firstPage fields are absent", () => {
    expect(
      resolveHeaderCounts({
        firstPage: {},
        loadedCount: 9,
        loadedUnsummarisedCount: 4,
      }),
    ).toEqual({ total: 9, unsummarised: 4 });
  });

  it("falls back independently when only one field is present", () => {
    expect(
      resolveHeaderCounts({
        firstPage: { totalCount: 50 },
        loadedCount: 20,
        loadedUnsummarisedCount: 6,
      }),
    ).toEqual({ total: 50, unsummarised: 6 });

    expect(
      resolveHeaderCounts({
        firstPage: { unsummarisedCount: 2 },
        loadedCount: 20,
        loadedUnsummarisedCount: 6,
      }),
    ).toEqual({ total: 20, unsummarised: 2 });
  });

  it("returns zeros when both counts are absent and nothing is loaded", () => {
    expect(
      resolveHeaderCounts({
        firstPage: undefined,
        loadedCount: 0,
        loadedUnsummarisedCount: 0,
      }),
    ).toEqual({ total: 0, unsummarised: 0 });
  });

  it("never returns NaN, undefined, null or a negative number", () => {
    const result = resolveHeaderCounts({
      firstPage: undefined,
      loadedCount: 0,
      loadedUnsummarisedCount: 0,
    });
    expect(Number.isNaN(result.total)).toBe(false);
    expect(Number.isNaN(result.unsummarised)).toBe(false);
    expect(result.total).not.toBeUndefined();
    expect(result.unsummarised).not.toBeUndefined();
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.unsummarised).toBeGreaterThanOrEqual(0);
  });

  // --- Adversarial cases beyond the spec's minimum list ---

  it("clamps a negative firstPage count to 0 rather than passing it through", () => {
    // Should never happen server-side, but a malformed/tampered payload or a
    // future backend bug should not surface a negative number in the header.
    expect(
      resolveHeaderCounts({
        firstPage: { totalCount: -5, unsummarisedCount: -1 },
        loadedCount: 10,
        loadedUnsummarisedCount: 2,
      }),
    ).toEqual({ total: 0, unsummarised: 0 });
  });

  it("falls back when a firstPage field is NaN", () => {
    expect(
      resolveHeaderCounts({
        firstPage: { totalCount: NaN, unsummarisedCount: 4 },
        loadedCount: 12,
        loadedUnsummarisedCount: 4,
      }),
    ).toEqual({ total: 0, unsummarised: 4 });
  });

  it("clamps a non-finite (Infinity) firstPage field to 0", () => {
    expect(
      resolveHeaderCounts({
        firstPage: { totalCount: Infinity },
        loadedCount: 3,
        loadedUnsummarisedCount: 0,
      }),
    ).toEqual({ total: 0, unsummarised: 0 });
  });

  it("falls back to 0 when loadedCount itself is negative and firstPage is absent", () => {
    expect(
      resolveHeaderCounts({
        firstPage: undefined,
        loadedCount: -3,
        loadedUnsummarisedCount: -1,
      }),
    ).toEqual({ total: 0, unsummarised: 0 });
  });

  it("treats a null-ish firstPage value the same as an absent one (defensive against loose callers)", () => {
    expect(
      resolveHeaderCounts({
        // @ts-expect-error deliberately passing a non-conforming value to
        // simulate an unvalidated network payload reaching this function.
        firstPage: { totalCount: null, unsummarisedCount: undefined },
        loadedCount: 6,
        loadedUnsummarisedCount: 2,
      }),
    ).toEqual({ total: 6, unsummarised: 2 });
  });

  it("does not use unsummarisedCount as a fallback source for total or vice versa", () => {
    // Regression guard against a copy-paste bug that reads the wrong field
    // when only one of the two is present.
    const result = resolveHeaderCounts({
      firstPage: { totalCount: 100 },
      loadedCount: 5,
      loadedUnsummarisedCount: 5,
    });
    expect(result.unsummarised).toBe(5);
    expect(result.unsummarised).not.toBe(100);
  });
});

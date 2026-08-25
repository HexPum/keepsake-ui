import { describe, expect, it } from "vitest";

import { splitSummaryByMarkers, stripSummaryMarkers } from "./summaryMarkers";

describe("stripSummaryMarkers", () => {
  it("removes marker syntax, keeping the wrapped text", () => {
    expect(
      stripSummaryMarkers(
        "⟦caption⟧A dog on a beach.⟦/caption⟧ ⟦transcript⟧It barks twice.⟦/transcript⟧",
      ),
    ).toBe("A dog on a beach. It barks twice.");
  });

  it("leaves plain text (no markers) unchanged", () => {
    expect(stripSummaryMarkers("Just a normal summary.")).toBe(
      "Just a normal summary.",
    );
  });

  it.each([null, undefined, ""])("passes %p through unchanged", (input) => {
    expect(stripSummaryMarkers(input)).toBe(input);
  });
});

describe("splitSummaryByMarkers", () => {
  it("tags each run with its source", () => {
    expect(
      splitSummaryByMarkers(
        "⟦caption⟧A dog on a beach.⟦/caption⟧ ⟦transcript⟧It barks twice.⟦/transcript⟧",
      ),
    ).toEqual([
      { text: "A dog on a beach.", aspect: "caption" },
      { text: " ", aspect: null },
      { text: "It barks twice.", aspect: "transcript" },
    ]);
  });

  it("returns a single untagged span for plain text", () => {
    expect(splitSummaryByMarkers("Just a normal summary.")).toEqual([
      { text: "Just a normal summary.", aspect: null },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(splitSummaryByMarkers(null)).toEqual([]);
    expect(splitSummaryByMarkers("")).toEqual([]);
  });

  it("treats text before the first marker as untagged", () => {
    expect(
      splitSummaryByMarkers("Lead in. ⟦caption⟧Tagged.⟦/caption⟧"),
    ).toEqual([
      { text: "Lead in. ", aspect: null },
      { text: "Tagged.", aspect: "caption" },
    ]);
  });

  it("keeps a run open through to the end if the model forgot to close it", () => {
    expect(splitSummaryByMarkers("⟦transcript⟧Never closed.")).toEqual([
      { text: "Never closed.", aspect: "transcript" },
    ]);
  });

  it("ends the open run on any close tag, matching aspect or not", () => {
    expect(splitSummaryByMarkers("⟦caption⟧One.⟦/transcript⟧After.")).toEqual([
      { text: "One.", aspect: "caption" },
      { text: "After.", aspect: null },
    ]);
  });
});

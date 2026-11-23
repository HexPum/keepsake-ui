import { describe, expect, it } from "vitest";

import { searchQueryWords, textMatchesQueryWords } from "./searchTextMatch";

describe("searchQueryWords", () => {
  it("treats the meaning shortcut markers as syntax, not as words", () => {
    expect(searchQueryWords("|| urlaub || reisen")).toEqual([
      "urlaub",
      "reisen",
    ]);
  });

  it("ignores filter qualifiers and single characters", () => {
    expect(searchQueryWords("urlaub tag:reise is:fav -tag:alt a")).toEqual([
      "urlaub",
    ]);
  });

  it("keeps compounds, dedupes and sorts longest first", () => {
    expect(searchQueryWords("Kaffee kaffee Kaffeetasse")).toEqual([
      "Kaffeetasse",
      "Kaffee",
    ]);
  });

  it("returns no words for empty and marker-only queries", () => {
    expect(searchQueryWords("")).toEqual([]);
    expect(searchQueryWords("|| ||")).toEqual([]);
  });
});

describe("textMatchesQueryWords", () => {
  it("matches case-insensitively, including inside a compound", () => {
    expect(textMatchesQueryWords("#schwedenurlaub", ["urlaub"])).toBe(true);
    expect(textMatchesQueryWords("Sommerurlaub am See", ["URLAUB"])).toBe(true);
  });

  it("is false without text or without words", () => {
    expect(textMatchesQueryWords(null, ["urlaub"])).toBe(false);
    expect(textMatchesQueryWords("urlaub", [])).toBe(false);
  });
});

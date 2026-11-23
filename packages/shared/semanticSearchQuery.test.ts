import { describe, expect, test } from "vitest";

import { getSemanticSearchTerms } from "./semanticSearchQuery";

describe("meaning-search shortcut", () => {
  test.each([
    ["|| warm evening light", ["warm evening light"]],
    [
      "  || building || photograph || urban",
      ["building", "photograph", "urban"],
    ],
    ['|| "red || blue" || green is:fav', ['"red || blue"', "green is:fav"]],
    ["|| café || 雨の日", ["café", "雨の日"]],
    ["|| ||", []],
    ["|| design ||", ["design"]],
    ["tag:design", null],
    ['"|| design"', null],
    ["JavaScript a || b", null],
    ["https://example.com/a||b", null],
  ])("parses %s", (input, expected) => {
    expect(getSemanticSearchTerms(input as string)).toEqual(expected);
  });
});

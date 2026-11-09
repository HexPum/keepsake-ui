import { describe, expect, it } from "vitest";

import { findTaskListItems, toggleTaskListItem } from "./taskListItems";

describe("findTaskListItems", () => {
  it("finds a single unchecked item", () => {
    const items = findTaskListItems("- [ ] Buy milk");
    expect(items).toHaveLength(1);
    expect(items[0].checked).toBe(false);
  });

  it("finds checked items in both cases", () => {
    const items = findTaskListItems("- [x] one\n- [X] two");
    expect(items.map((i) => i.checked)).toEqual([true, true]);
  });

  it("keeps source order across bullets and nesting", () => {
    const items = findTaskListItems(
      ["- [ ] first", "  - [x] nested", "* [ ] second"].join("\n"),
    );
    expect(items.map((i) => i.checked)).toEqual([false, true, false]);
    expect(items.map((i) => i.index)).toEqual([0, 1, 2]);
  });

  it("skips task-list syntax inside a fenced code block", () => {
    // The regression this module exists for: the old regex counted the fenced
    // example, so the real task ended up one index off and clicking it edited
    // the code block instead.
    const markdown = [
      "```md",
      "- [ ] example inside a fence",
      "```",
      "- [ ] real task",
    ].join("\n");

    const items = findTaskListItems(markdown);
    expect(items).toHaveLength(1);
    expect(toggleTaskListItem(markdown, 0)).toBe(
      ["```md", "- [ ] example inside a fence", "```", "- [x] real task"].join(
        "\n",
      ),
    );
  });

  it("handles tilde fences and longer closing fences", () => {
    const markdown = ["~~~", "- [ ] fenced", "~~~~", "- [ ] real task"].join(
      "\n",
    );
    const items = findTaskListItems(markdown);
    expect(items).toHaveLength(1);
    expect(markdown.slice(items[0].stateStart, items[0].stateEnd)).toBe(" ");
  });

  it("counts task items inside block quotes", () => {
    // remark-gfm renders these as checkboxes, but `^(\s*[-*+]\s*\[)` cannot
    // match them because the line starts with ">".
    const markdown = ["> - [ ] quoted", "- [ ] plain"].join("\n");
    const items = findTaskListItems(markdown);
    expect(items).toHaveLength(2);
    expect(toggleTaskListItem(markdown, 0)).toBe(
      ["> - [x] quoted", "- [ ] plain"].join("\n"),
    );
    expect(toggleTaskListItem(markdown, 1)).toBe(
      ["> - [ ] quoted", "- [x] plain"].join("\n"),
    );
  });

  it("handles nested block-quote markers", () => {
    const markdown = "> > - [ ] deeply quoted";
    expect(toggleTaskListItem(markdown, 0)).toBe("> > - [x] deeply quoted");
  });

  it("does not treat a plain list item as a task", () => {
    expect(findTaskListItems("- not a task")).toHaveLength(0);
    expect(findTaskListItems("- [] missing space")).toHaveLength(0);
  });

  it("works with CRLF line endings", () => {
    const markdown = "- [ ] one\r\n- [ ] two\r\n";
    const items = findTaskListItems(markdown);
    expect(items).toHaveLength(2);
    expect(toggleTaskListItem(markdown, 1)).toBe("- [ ] one\r\n- [x] two\r\n");
  });

  it("only rewrites the state character", () => {
    const markdown = "intro\n  - [ ] Keep  spacing and [brackets]\n";
    expect(toggleTaskListItem(markdown, 0)).toBe(
      "intro\n  - [x] Keep  spacing and [brackets]\n",
    );
  });

  it("returns null for an unknown index", () => {
    expect(toggleTaskListItem("- [ ] only", 1)).toBeNull();
    expect(toggleTaskListItem("no tasks", 0)).toBeNull();
  });
});

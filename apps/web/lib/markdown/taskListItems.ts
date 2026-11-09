/**
 * Maps rendered task-list checkboxes back to their offsets in the markdown
 * source.
 *
 * `MarkdownReadonly` used to pair the Nth rendered checkbox with the Nth
 * `/^(\s*[-*+]\s*\[)( |x|X)(\])/` match in the raw markdown. Those two
 * orderings disagree whenever the renderer emits a checkbox the regex cannot
 * see, or vice versa:
 *
 * - **Fenced code blocks** — the regex happily matches `- [ ] …` inside a
 *   fence, but the renderer shows plain code and no checkbox at all.
 * - **Block quotes** — `> - [ ] …` renders a real checkbox, but `^` is
 *   followed by `>` so the regex never matches it.
 *
 * Either divergence shifts every following index by one, so clicking a
 * checkbox silently rewrites a *different* task in the user's note. This
 * scanner walks the source line by line, skips fenced code, allows any number
 * of block-quote prefixes, and returns the items in the same order the
 * renderer produces them.
 *
 * Known limitation: an indented code block (4+ spaces at the top level) that
 * contains `- [ ]` is still counted. Telling that apart from a genuinely
 * nested list item needs real block parsing, which is out of proportion here.
 */
export interface TaskListItem {
  /** Position among the checkboxes the renderer emits, in document order. */
  index: number;
  /** Whether the item is currently ticked. */
  checked: boolean;
  /** Offset of the state character inside `[ ]`. */
  stateStart: number;
  /** Offset just past the state character. */
  stateEnd: number;
}

const TASK_ITEM_PATTERN = /^([ \t]*(?:>[ \t]?)*)([-*+])([ \t]+)\[([ xX])\]/;
const FENCE_PATTERN = /^[ \t]*(?:>[ \t]?)*(```+|~~~+)/;

export function findTaskListItems(markdown: string): TaskListItem[] {
  const items: TaskListItem[] = [];
  let fence: string | null = null;
  let offset = 0;

  for (const line of markdown.split("\n")) {
    const fenceMatch = FENCE_PATTERN.exec(line);

    if (fence !== null) {
      // A closing fence uses the same character and is at least as long as
      // the opening one.
      if (
        fenceMatch !== null &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      ) {
        fence = null;
      }
      offset += line.length + 1;
      continue;
    }

    if (fenceMatch !== null) {
      fence = fenceMatch[1];
      offset += line.length + 1;
      continue;
    }

    const match = TASK_ITEM_PATTERN.exec(line);
    if (match !== null) {
      // match[1] = indent + block-quote markers, match[2] = bullet,
      // match[3] = spacing, match[4] = state character.
      const stateStart =
        offset + match[1].length + match[2].length + match[3].length + 1;
      items.push({
        index: items.length,
        checked: match[4].toLowerCase() === "x",
        stateStart,
        stateEnd: stateStart + 1,
      });
    }

    offset += line.length + 1;
  }

  return items;
}

/**
 * Flips the checkbox at `index`, returning the new markdown, or `null` when
 * no such checkbox exists.
 */
export function toggleTaskListItem(
  markdown: string,
  index: number,
): string | null {
  const item = findTaskListItems(markdown)[index];
  if (item === undefined) {
    return null;
  }
  const nextState = item.checked ? " " : "x";
  return (
    markdown.slice(0, item.stateStart) +
    nextState +
    markdown.slice(item.stateEnd)
  );
}

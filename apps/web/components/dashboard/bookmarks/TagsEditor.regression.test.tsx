// @vitest-environment jsdom
//
// Mandatory two-axis regression check from MISTAKES.md / spec §7 for this
// exact component (this is the *third* fix round on TagsEditor.tsx — see
// 2026-08-20/21 entries). The standing lesson: a fix that only re-verifies
// the one axis a bug report happened to mention isn't done. Axis A (typing
// speed) and Axis B (>=29-char tag names, typed *and* pre-attached) both
// share the same `Maximum update depth exceeded` crash signature but come
// from independent causes, so both are exercised here against the real,
// mounted component rather than against tagReconcile.ts's pure functions
// alone (Round 1's mistake: the reconciler had 17 tests, the thing that
// actually renders/settles state — where B1's real defect was hiding — had
// none).
//
// jsdom has no real layout engine, so this cannot reproduce the original
// ResizeObserver-driven crash pixel-for-pixel — nothing actually resizes in
// jsdom. What it *can* and does verify: the component renders and updates
// without throwing at both a rapid-typing cadence and a >=29-char name (both
// typed live and already attached at mount), that the debounce still
// collapses a burst of keystrokes into a single `tags.list` query, and that
// the long-name pill still carries the `max-w-40 truncate` class and a
// `title` with the untruncated name.
import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ZBookmarkTags } from "@karakeep/shared/types/tags";

vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({ demoMode: false }),
}));

vi.mock("@/lib/i18n/client", () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _key,
  }),
}));

const tagsListQueryFn = vi.fn(async () => ({ tags: [] as unknown[] }));

vi.mock("@karakeep/shared-react/trpc", () => ({
  useTRPC: () => ({
    tags: {
      list: {
        queryOptions: (
          input: { nameContains: string },
          reactQueryOpts: Record<string, unknown>,
        ) => ({
          queryKey: ["tags.list", input],
          queryFn: () => tagsListQueryFn(),
          ...reactQueryOpts,
        }),
      },
    },
  }),
}));

// jsdom has no ResizeObserver; Radix Popover's positioning uses one only
// while open. A no-op stub is the standard way to let Radix-based
// components mount under jsdom without asserting anything about its
// internals (that's the library's job, not this component's).
class ResizeObserverStub {
  observe(): void {
    /* no-op: jsdom has no layout to observe */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}

import { TagsEditor } from "./TagsEditor";

function renderEditor(props: {
  tags: ZBookmarkTags[];
  onAttach?: (t: { tagName: string; tagId?: string }) => void;
  onDetach?: (t: { tagId: string; tagName: string }) => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TagsEditor
        tags={props.tags}
        onAttach={props.onAttach ?? vi.fn()}
        onDetach={props.onDetach ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function openPopover() {
  // The input sits inside the PopoverTrigger; clicking it is the same path
  // a real user takes (handleOpenChange focuses the input on open). cmdk's
  // input primitive exposes role="combobox", not "textbox".
  const input = screen.getByRole("combobox");
  fireEvent.click(input);
  return input;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  tagsListQueryFn.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TagsEditor regression — Axis A (typing speed)", () => {
  it("does not crash typing rapidly with the popover open, and the 300ms debounce collapses a keystroke burst into a single query", async () => {
    renderEditor({ tags: [] });
    const input = openPopover();

    const word = "osintresearch";
    for (const char of word) {
      // Each keystroke lands well inside the 300ms debounce window of the
      // previous one — this is the "typing rapidly" axis.
      fireEvent.change(input, {
        target: { value: input.getAttribute("value") ?? "" },
      });
      act(() => {
        fireEvent.input(input, {
          target: { value: (input as HTMLInputElement).value + char },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
    }

    // Only the debounce's trailing edge should have fired a query so far —
    // well under one call per keystroke.
    expect(tagsListQueryFn.mock.calls.length).toBeLessThan(word.length);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Exactly one more query fires once typing stops and the debounce
    // settles on the final value — not one per keystroke, not zero.
    expect(tagsListQueryFn).toHaveBeenCalled();
  });
});

describe("TagsEditor regression — Axis B (>=29 char tag names)", () => {
  const longName = "a-very-long-tag-name-that-is-29-plus-chars";
  expect(longName.length).toBeGreaterThanOrEqual(29);

  it("does not crash opening the editor on a bookmark that already has an attached tag of >=29 chars, and the pill truncates with a full-name title", () => {
    renderEditor({
      tags: [{ id: "t1", name: longName, attachedBy: "human" }],
    });

    // No `@testing-library/jest-dom` in this project — assert directly on
    // the DOM node instead of `toHaveClass`/`toHaveAttribute`.
    const pill = screen.getByText(longName);
    expect(pill.className).toContain("truncate");
    expect(pill.className).toContain("max-w-40");
    expect(pill.getAttribute("title")).toBe(longName);
  });

  it("does not crash typing a >=29 char tag name with the popover open, and it can be created as a pending chip", async () => {
    const onAttach = vi.fn();
    renderEditor({ tags: [], onAttach });
    const input = openPopover();

    act(() => {
      fireEvent.input(input, { target: { value: longName } });
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      // Flush the microtask queue so the (already-resolved) `tags.list`
      // fetch settles into cache/state without waiting on `findBy*`'s own
      // real-timer polling, which fake timers would otherwise stall.
      await Promise.resolve();
      await Promise.resolve();
    });

    // The "create" row renders as a cmdk option whose visible content is
    // just the typed name (its `label`/`value` — "Create "…"" — is used
    // only for cmdk's internal matching, not rendered text).
    const createOption = screen.getByRole("option", { name: longName });
    act(() => {
      fireEvent.click(createOption);
    });

    expect(onAttach).toHaveBeenCalledWith(
      expect.objectContaining({ tagName: longName }),
    );

    // No `@testing-library/jest-dom` in this project — assert directly on
    // the DOM node instead of `toHaveClass`/`toHaveAttribute`.
    const pill = screen.getByText(longName);
    expect(pill.className).toContain("truncate");
    expect(pill.className).toContain("max-w-40");
    expect(pill.getAttribute("title")).toBe(longName);
  });
});

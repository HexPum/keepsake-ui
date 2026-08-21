// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseCollapsed,
  SIDEBAR_COLLAPSED_KEY,
  useSidebarCollapsed,
} from "./useSidebarCollapsed";

/**
 * The mount effect applies the stored value to `collapsed` synchronously
 * (in the same commit `renderHook` already flushed by the time it returns),
 * then schedules a `requestAnimationFrame` purely to flip `ready`. Waiting
 * on a real rAF of our own — scheduled after the hook's — lands after the
 * hook's callback in the same frame, so this reliably observes the
 * post-hydration, post-frame state.
 */
async function flushFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("SIDEBAR_COLLAPSED_KEY", () => {
  it("is the unchanged, exact storage key", () => {
    expect(SIDEBAR_COLLAPSED_KEY).toBe("k-dense-sidebar-collapsed");
  });
});

describe("parseCollapsed", () => {
  it('parses "1" as collapsed', () => {
    expect(parseCollapsed("1")).toBe(true);
  });

  it('parses "0" as expanded', () => {
    expect(parseCollapsed("0")).toBe(false);
  });

  it("parses null (nothing stored) as expanded", () => {
    expect(parseCollapsed(null)).toBe(false);
  });

  it("parses the empty string as expanded", () => {
    expect(parseCollapsed("")).toBe(false);
  });

  it('parses "true" as expanded — only the literal "1" means collapsed', () => {
    expect(parseCollapsed("true")).toBe(false);
  });

  it('parses "yes" as expanded', () => {
    expect(parseCollapsed("yes")).toBe(false);
  });

  // Adversarial boundary values beyond the spec's own table — a strict
  // equality check should reject anything that merely looks like "1".
  it("rejects whitespace-padded or numeric-looking variants of 1", () => {
    expect(parseCollapsed(" 1")).toBe(false);
    expect(parseCollapsed("1 ")).toBe(false);
    expect(parseCollapsed("01")).toBe(false);
    expect(parseCollapsed("1.0")).toBe(false);
    expect(parseCollapsed("11")).toBe(false);
  });

  it("is case-sensitive / rejects other truthy-looking strings", () => {
    expect(parseCollapsed("TRUE")).toBe(false);
    expect(parseCollapsed("collapsed")).toBe(false);
  });
});

describe("useSidebarCollapsed", () => {
  it("renders collapsed=false and ready=false on the very first render, even when storage already says collapsed", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");

    const renders: { collapsed: boolean; ready: boolean }[] = [];
    renderHook(() => {
      const state = useSidebarCollapsed();
      renders.push({ collapsed: state.collapsed, ready: state.ready });
      return state;
    });

    // The very first entry recorded is the pre-effect render. It must not
    // have read storage yet, regardless of what storage holds.
    expect(renders[0]).toEqual({ collapsed: false, ready: false });
  });

  it("applies the stored collapsed value in a commit strictly before ready flips to true (no same-commit flash)", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");

    const renders: { collapsed: boolean; ready: boolean }[] = [];
    const { result } = renderHook(() => {
      const state = useSidebarCollapsed();
      renders.push({ collapsed: state.collapsed, ready: state.ready });
      return state;
    });

    // Immediately after the mount effect (still within the same act as
    // renderHook, before any animation frame has had a chance to fire):
    // collapsed must already reflect storage, but ready must still be false.
    expect(result.current.collapsed).toBe(true);
    expect(result.current.ready).toBe(false);
    // There must be a recorded commit with exactly that combination — i.e.
    // collapsed and ready did not change together in one commit.
    expect(renders).toContainEqual({ collapsed: true, ready: false });
    expect(renders.some((r) => r.ready === true)).toBe(false);

    await flushFrame();

    expect(result.current.collapsed).toBe(true);
    expect(result.current.ready).toBe(true);
  });

  it('hydrates a stored "0" to expanded, with ready still lagging a frame', async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "0");

    const { result } = renderHook(() => useSidebarCollapsed());

    expect(result.current.collapsed).toBe(false);
    expect(result.current.ready).toBe(false);

    await flushFrame();

    expect(result.current.collapsed).toBe(false);
    expect(result.current.ready).toBe(true);
  });

  it("defaults to expanded after hydration when nothing is stored", async () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    await flushFrame();

    expect(result.current.collapsed).toBe(false);
    expect(result.current.ready).toBe(true);
  });

  it("defaults to expanded after hydration for an unrecognised stored value", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");

    const { result } = renderHook(() => useSidebarCollapsed());
    await flushFrame();

    expect(result.current.collapsed).toBe(false);
    expect(result.current.ready).toBe(true);
  });

  it("cancels the pending animation frame on unmount before it fires", () => {
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");

    const { unmount } = renderHook(() => useSidebarCollapsed());
    unmount();

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it("toggle() called before ready flips true still works and does not disturb the hydration frame", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");

    const { result } = renderHook(() => useSidebarCollapsed());
    // Hydration has already applied the stored value, but ready is still
    // false — the frame that flips it hasn't fired yet.
    expect(result.current.collapsed).toBe(true);
    expect(result.current.ready).toBe(false);

    // A user toggling immediately (out of order relative to hydration's own
    // rAF) must still work correctly.
    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("0");

    await flushFrame();

    // The hydration frame still lands and flips ready, without reverting
    // the user's toggle.
    expect(result.current.ready).toBe(true);
    expect(result.current.collapsed).toBe(false);
  });

  it('toggle() flips collapsed and writes alternating "1"/"0" under the exact key', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useSidebarCollapsed());
    await flushFrame();

    expect(result.current.collapsed).toBe(false);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(true);
    expect(setItemSpy).toHaveBeenLastCalledWith(SIDEBAR_COLLAPSED_KEY, "1");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");

    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(false);
    expect(setItemSpy).toHaveBeenLastCalledWith(SIDEBAR_COLLAPSED_KEY, "0");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("0");
  });

  it("settles correctly after an odd number of toggles (opposite of initial) and an even number (back to initial)", async () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    await flushFrame();
    expect(result.current.collapsed).toBe(false);

    act(() => {
      result.current.toggle();
      result.current.toggle();
      result.current.toggle();
    });
    // Rapid/batched triple toggle — odd count should land opposite of start.
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");

    act(() => {
      result.current.toggle();
    });
    // Even overall count — back to the initial state.
    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("0");
  });

  it("does not throw and falls back to in-memory default when localStorage.getItem throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });

    // If the guard were missing, this render (and the mount effect it
    // flushes) would throw and fail the test right here.
    const { result } = renderHook(() => useSidebarCollapsed());

    expect(getItemSpy).toHaveBeenCalled();
    expect(result.current.collapsed).toBe(false);
    expect(result.current.ready).toBe(false);

    await flushFrame();

    expect(result.current.collapsed).toBe(false);
    expect(result.current.ready).toBe(true);
    // No console noise per the spec's explicit "no console noise" contract.
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("does not throw and still flips collapsed in memory when localStorage.setItem throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const { result } = renderHook(() => useSidebarCollapsed());
    await flushFrame();
    expect(result.current.collapsed).toBe(false);

    expect(() => {
      act(() => {
        result.current.toggle();
      });
    }).not.toThrow();

    expect(result.current.collapsed).toBe(true);
    // Nothing was actually persisted, since the write throws every time —
    // but the in-memory session state still tracks correctly.
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe(null);

    expect(() => {
      act(() => {
        result.current.toggle();
      });
    }).not.toThrow();
    expect(result.current.collapsed).toBe(false);

    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("survives both getItem and setItem throwing across a full hydrate+toggle cycle", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("read blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("write blocked");
    });

    const { result } = renderHook(() => useSidebarCollapsed());
    await flushFrame();
    expect(result.current.collapsed).toBe(false);
    expect(result.current.ready).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.collapsed).toBe(true);
  });
});

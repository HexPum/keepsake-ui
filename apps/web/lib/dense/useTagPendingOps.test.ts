// @vitest-environment jsdom
//
// Covers the pending-op state machine (useTagPendingOps.ts) that Round 1's
// review flagged as untested — the pure reconciler (tagReconcile.ts) had
// full coverage, but the op-minting/settle logic that actually drives it
// (and where the real B1 flicker defect lived) did not. Follows the
// `renderHook` + hand-controlled deferred promise pattern already used by
// useSidebarCollapsed.test.ts / useRowNavigate.test.ts.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ZBookmarkTags } from "@karakeep/shared/types/tags";

import { useTagPendingOps } from "./useTagPendingOps";

afterEach(() => {
  cleanup();
});

function tag(
  id: string,
  name: string,
  attachedBy: "human" | "ai" = "human",
): ZBookmarkTags {
  return { id, name, attachedBy };
}

/** A promise plus its resolve/reject, so a test can control exactly when a
 *  mutation "settles" relative to a `serverTags` prop update — the timing
 *  gap B1 lived in. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useTagPendingOps", () => {
  it("renders a pending attach chip immediately, marked pending", () => {
    const onAttach = vi.fn(() => deferred<void>().promise);
    const onDetach = vi.fn();
    const { result } = renderHook(() =>
      useTagPendingOps({ serverTags: [], onAttach, onDetach }),
    );

    act(() => {
      result.current.runAttach("newtag");
    });

    expect(result.current.displayedTags).toHaveLength(1);
    expect(result.current.displayedTags[0]).toMatchObject({
      name: "newtag",
      pending: true,
    });
    expect(onAttach).toHaveBeenCalledWith({
      tagName: "newtag",
      tagId: undefined,
    });
  });

  it("success path: does NOT clear the pending op just because the mutation promise resolves — only serverTags catching up clears it (this is the B1 fix)", async () => {
    const d = deferred<unknown>();
    const onAttach = vi.fn(() => d.promise);
    const onDetach = vi.fn();

    const { result, rerender } = renderHook(
      ({ serverTags }: { serverTags: ZBookmarkTags[] }) =>
        useTagPendingOps({ serverTags, onAttach, onDetach }),
      { initialProps: { serverTags: [] as ZBookmarkTags[] } },
    );

    act(() => {
      result.current.runAttach("reading");
    });
    expect(result.current.displayedTags).toHaveLength(1);
    expect(result.current.displayedTags[0].pending).toBe(true);

    // The mutation "resolves" (as `useUpdateBookmarkTags`'s promise does,
    // per B1, before the `getBookmark` refetch that updates `serverTags`
    // has actually landed) — but `serverTags` has NOT been updated yet.
    await act(async () => {
      d.resolve(undefined);
      await d.promise;
    });

    // Round 1's bug: this would now be [] (op cleared on promise resolve,
    // server state not caught up yet) — the visible flicker. The fix: the
    // chip must still be showing, still pending, because `serverTags`
    // hasn't caught up.
    expect(result.current.displayedTags).toHaveLength(1);
    expect(result.current.displayedTags[0].pending).toBe(true);

    // Now the refetch lands and `serverTags` catches up.
    rerender({ serverTags: [tag("t1", "reading")] });

    expect(result.current.displayedTags).toHaveLength(1);
    expect(result.current.displayedTags[0]).toMatchObject({
      id: "t1",
      name: "reading",
      pending: false,
    });
  });

  it("settle-timing: the pending op is cleared in the same update that serverTags first reflects it, never later, never earlier", () => {
    const onAttach = vi.fn(() => deferred<void>().promise);
    const onDetach = vi.fn();

    const { result, rerender } = renderHook(
      ({ serverTags }: { serverTags: ZBookmarkTags[] }) =>
        useTagPendingOps({ serverTags, onAttach, onDetach }),
      { initialProps: { serverTags: [] as ZBookmarkTags[] } },
    );

    act(() => {
      result.current.runAttach("alpha");
    });
    expect(result.current.displayedTags).toHaveLength(1);

    // Unrelated serverTags update — must not clear the pending op early.
    rerender({ serverTags: [tag("other", "beta")] });
    expect(result.current.displayedTags.map((c) => c.name).sort()).toEqual([
      "alpha",
      "beta",
    ]);
    expect(
      result.current.displayedTags.find((c) => c.name === "alpha")?.pending,
    ).toBe(true);

    // The matching server tag lands (case-variant, as the server may
    // reuse/normalise casing) — must clear now.
    rerender({ serverTags: [tag("other", "beta"), tag("t1", "Alpha")] });
    expect(result.current.displayedTags.map((c) => c.name).sort()).toEqual([
      "Alpha",
      "beta",
    ]);
    expect(
      result.current.displayedTags.find((c) => c.name.toLowerCase() === "alpha")
        ?.pending,
    ).toBe(false);
  });

  it("error-rollback: a rejected attach promise clears the pending op immediately, reverting to server truth without waiting on serverTags (D3)", async () => {
    const d = deferred<unknown>();
    const onAttach = vi.fn(() => d.promise);
    const onDetach = vi.fn();

    const { result } = renderHook(() =>
      useTagPendingOps({ serverTags: [], onAttach, onDetach }),
    );

    act(() => {
      result.current.runAttach("willfail");
    });
    expect(result.current.displayedTags).toHaveLength(1);

    await act(async () => {
      d.reject(new Error("network error"));
      await d.promise.catch(() => undefined);
    });

    // serverTags never changed (still []), yet the phantom chip is gone —
    // this is the immediate error-path clear, not the server-state path.
    expect(result.current.displayedTags).toHaveLength(0);
  });

  it("error-rollback: a rejected detach clears the pending op and the server tag reappears, without a serverTags change", async () => {
    const d = deferred<unknown>();
    const onAttach = vi.fn();
    const onDetach = vi.fn(() => d.promise);
    const serverTags = [tag("t1", "reading")];

    const { result } = renderHook(() =>
      useTagPendingOps({ serverTags, onAttach, onDetach }),
    );

    act(() => {
      result.current.runDetach(result.current.displayedTags[0]);
    });
    expect(result.current.displayedTags).toHaveLength(0);

    await act(async () => {
      d.reject(new Error("network error"));
      await d.promise.catch(() => undefined);
    });

    expect(result.current.displayedTags).toHaveLength(1);
    expect(result.current.displayedTags[0]).toMatchObject({
      id: "t1",
      name: "reading",
      pending: false,
    });
  });

  it("detach success: settles once serverTags no longer contains the tag id, not on promise resolution alone", async () => {
    const d = deferred<unknown>();
    const onAttach = vi.fn();
    const onDetach = vi.fn(() => d.promise);

    const { result, rerender } = renderHook(
      ({ serverTags }: { serverTags: ZBookmarkTags[] }) =>
        useTagPendingOps({ serverTags, onAttach, onDetach }),
      { initialProps: { serverTags: [tag("t1", "reading")] } },
    );

    act(() => {
      result.current.runDetach(result.current.displayedTags[0]);
    });
    expect(result.current.displayedTags).toHaveLength(0);

    await act(async () => {
      d.resolve(undefined);
      await d.promise;
    });

    // Server tags haven't caught up yet — the detach must still read as
    // "hidden", i.e. no reappearance/flicker back in before the refetch.
    expect(result.current.displayedTags).toHaveLength(0);

    rerender({ serverTags: [] });
    expect(result.current.displayedTags).toHaveLength(0);
  });

  it("disables (no-ops) removal of a chip that is itself still a pending attach", () => {
    const onAttach = vi.fn(() => deferred<void>().promise);
    const onDetach = vi.fn();

    const { result } = renderHook(() =>
      useTagPendingOps({ serverTags: [], onAttach, onDetach }),
    );

    act(() => {
      result.current.runAttach("brandnew");
    });
    const pendingChip = result.current.displayedTags[0];
    expect(pendingChip.pending).toBe(true);

    act(() => {
      result.current.runDetach(pendingChip);
    });

    // Still there, still pending — runDetach on a pending chip is a no-op.
    expect(result.current.displayedTags).toHaveLength(1);
    expect(onDetach).not.toHaveBeenCalled();
  });

  it("E6: whitespace/#-only input mints no op and never calls onAttach", () => {
    const onAttach = vi.fn();
    const onDetach = vi.fn();
    const { result } = renderHook(() =>
      useTagPendingOps({ serverTags: [], onAttach, onDetach }),
    );

    act(() => {
      result.current.runAttach("   ");
      result.current.runAttach("###");
    });

    expect(result.current.displayedTags).toHaveLength(0);
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("E7: a name matching a currently displayed chip case-insensitively is a no-op", () => {
    const onAttach = vi.fn(() => deferred<void>().promise);
    const onDetach = vi.fn();
    const { result } = renderHook(() =>
      useTagPendingOps({
        serverTags: [tag("t1", "OSINT")],
        onAttach,
        onDetach,
      }),
    );

    act(() => {
      result.current.runAttach("osint");
    });

    expect(result.current.displayedTags).toHaveLength(1);
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("E9: two concurrent attaches for different names both settle independently without one clobbering the other's pending state", async () => {
    const d1 = deferred<unknown>();
    const d2 = deferred<unknown>();
    const onAttach = vi
      .fn()
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise);
    const onDetach = vi.fn();

    const { result, rerender } = renderHook(
      ({ serverTags }: { serverTags: ZBookmarkTags[] }) =>
        useTagPendingOps({ serverTags, onAttach, onDetach }),
      { initialProps: { serverTags: [] as ZBookmarkTags[] } },
    );

    act(() => {
      result.current.runAttach("first");
    });
    act(() => {
      result.current.runAttach("second");
    });
    expect(result.current.displayedTags.map((c) => c.name).sort()).toEqual([
      "first",
      "second",
    ]);

    // "first" lands server-side; "second" is still in flight.
    rerender({ serverTags: [tag("t1", "first")] });
    expect(result.current.displayedTags.map((c) => c.name).sort()).toEqual([
      "first",
      "second",
    ]);
    expect(
      result.current.displayedTags.find((c) => c.name === "first")?.pending,
    ).toBe(false);
    expect(
      result.current.displayedTags.find((c) => c.name === "second")?.pending,
    ).toBe(true);

    rerender({ serverTags: [tag("t1", "first"), tag("t2", "second")] });
    expect(result.current.displayedTags.every((c) => c.pending === false)).toBe(
      true,
    );
  });
});

// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  useBookmarkSearchState,
  useDoBookmarkSearch,
  useSearchQueryDraft,
} from "./bookmark-search";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
  pathname: "/dashboard/search",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.params,
  usePathname: () => navigation.pathname,
}));
vi.mock("@/lib/clientConfig", () => ({
  useClientConfig: () => ({ search: { semanticSearchEnabled: true } }),
}));
vi.mock("@karakeep/shared-react/trpc", () => ({ useTRPC: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  navigation.replace.mockReset();
  navigation.params = new URLSearchParams();
  navigation.pathname = "/dashboard/search";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("meaning-search navigation", () => {
  test("returning to the current query allows subsequent external navigation to sync", () => {
    const { result, rerender } = renderHook(
      ({ query }) => useSearchQueryDraft(query),
      { initialProps: { query: "quiet" } },
    );
    act(() => result.current.setValue("quiet places"));
    act(() => result.current.setValue("quiet"));
    rerender({ query: "another saved search" });
    expect(result.current.value).toBe("another saved search");
  });

  test("a delayed URL acknowledgement cannot overwrite newer typing", () => {
    const { result, rerender } = renderHook(
      ({ query }) => useSearchQueryDraft(query),
      { initialProps: { query: "" } },
    );
    act(() => result.current.setValue("quiet"));
    act(() => result.current.setValue("quiet places"));
    rerender({ query: "quiet" });
    expect(result.current.value).toBe("quiet places");
    rerender({ query: "quiet places" });
    expect(result.current.value).toBe("quiet places");
    rerender({ query: "another saved search" });
    expect(result.current.value).toBe("another saved search");
  });

  test("an explicit mode choice can replace an unfinished draft", () => {
    const { result, rerender } = renderHook(
      ({ query }) => useSearchQueryDraft(query),
      { initialProps: { query: "|| quiet" } },
    );
    act(() => result.current.setValue("|| quiet places"));
    act(() => result.current.resetValue("quiet places"));
    rerender({ query: "quiet places" });
    expect(result.current.value).toBe("quiet places");
  });

  test("sends one search after a burst of typing", () => {
    const { result } = renderHook(() => useDoBookmarkSearch());
    act(() => {
      result.current.debounceSearch("quiet");
      vi.advanceTimersByTime(150);
      result.current.debounceSearch("quiet places");
      vi.advanceTimersByTime(299);
    });
    expect(navigation.replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(
      "/dashboard/search?q=quiet+places",
    );
  });

  test("an immediate history choice cancels older pending typing", () => {
    const { result } = renderHook(() => useDoBookmarkSearch());
    act(() => {
      result.current.debounceSearch("old input");
      result.current.doSearch("saved query");
      vi.runAllTimers();
    });
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(
      "/dashboard/search?q=saved+query",
    );
  });

  test("keyword selection exits the shortcut and cancels pending meaning searches", () => {
    navigation.params = new URLSearchParams({
      q: "|| buildings || photographs",
    });
    const { result } = renderHook(() => useDoBookmarkSearch());
    act(() => {
      result.current.debounceSearch("|| old input");
      result.current.setSearchMode("fts");
      vi.runAllTimers();
    });
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(
      "/dashboard/search?q=buildings+photographs&mode=fts",
    );
  });

  test("preserves the full shortcut in shareable meaning-search links", () => {
    navigation.params = new URLSearchParams({
      q: "|| buildings || photographs",
    });
    const { result } = renderHook(() => useDoBookmarkSearch());
    act(() => result.current.setSearchMode("semantic"));
    expect(navigation.replace).toHaveBeenCalledWith(
      "/dashboard/search?q=%7C%7C+buildings+%7C%7C+photographs&mode=semantic",
    );
  });

  test("opening a preview retains the search mode and clean highlighting text", () => {
    navigation.params = new URLSearchParams({
      q: "|| quiet places is:fav",
      mode: "fts",
    });
    const { result, rerender } = renderHook(() => useBookmarkSearchState());
    expect(result.current.searchMode).toBe("semantic");
    expect(result.current.parsedSearchQuery.text).toBe("quiet places");
    navigation.pathname = "/dashboard/preview/bookmark";
    navigation.params = new URLSearchParams();
    rerender();
    expect(result.current.searchMode).toBe("semantic");
    expect(result.current.searchQuery).toBe("|| quiet places is:fav");
  });

  test("unmounting cancels delayed searches", () => {
    const { result, unmount } = renderHook(() => useDoBookmarkSearch());
    act(() => result.current.debounceSearch("quiet places"));
    unmount();
    act(() => vi.runAllTimers());
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

/**
 * Resolves the two numbers shown in the dense FILES header meta line
 * ("<N> items · <M> unsummarised") from whatever the caller currently has.
 *
 * Why the fallback exists: `getBookmarks` only returns `totalCount` /
 * `unsummarisedCount` when the caller opted in with `includeCounts: true`,
 * and even then the numbers are absent for a beat whenever there's no
 * server-seeded page to read them from yet — e.g. a non-default sort order
 * (see `DenseFilesView`'s `hasServerData`), a query that hasn't resolved,
 * or an error state. In every one of those cases the header must still show
 * *something* reasonable rather than crash or blank out, so each field
 * falls back independently to a value derived from whatever rows are
 * already loaded on screen.
 *
 * Why the total is read from page 0 specifically: page 0 is the page the
 * server prefetches and seeds as `initialData`, and it's the page that gets
 * refetched as a unit whenever the query is invalidated (add/delete/etc).
 * Reading the count off it means the header number is stable while the user
 * paginates (later pages don't carry — and shouldn't need to carry — their
 * own copy of the same collection-wide total) and still refreshes promptly
 * on mutations.
 */

export interface ResolveHeaderCountsInput {
  firstPage?: {
    totalCount?: number;
    unsummarisedCount?: number;
  };
  loadedCount: number;
  loadedUnsummarisedCount: number;
}

export interface ResolvedHeaderCounts {
  total: number;
  unsummarised: number;
}

function safeNonNegative(n: number): number {
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function resolveHeaderCounts(
  input: ResolveHeaderCountsInput,
): ResolvedHeaderCounts {
  const total =
    typeof input.firstPage?.totalCount === "number"
      ? input.firstPage.totalCount
      : input.loadedCount;
  const unsummarised =
    typeof input.firstPage?.unsummarisedCount === "number"
      ? input.firstPage.unsummarisedCount
      : input.loadedUnsummarisedCount;

  return {
    total: safeNonNegative(total),
    unsummarised: safeNonNegative(unsummarised),
  };
}

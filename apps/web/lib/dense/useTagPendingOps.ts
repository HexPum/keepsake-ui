/**
 * The pending-op state machine behind TagsEditor's optimistic attach/detach
 * flow (the `allowCreation === true` path only — the `allowCreation ===
 * false` branch in TagsEditor.tsx uses its own, deliberately untouched
 * `optimisticTags` mechanism, see that file's comments).
 *
 * Pulled out of TagsEditor.tsx into its own module for the same reason
 * `tagReconcile.ts` was: this project's convention for logic that would
 * otherwise need jsdom is "put it in a pure/hook module under
 * `apps/web/lib/`, test it with a co-located `*.test.ts`" (see
 * `useSidebarCollapsed.ts`/`useRowNavigate.ts` and their tests). This is the
 * *third* fix round on TagsEditor.tsx (MISTAKES.md, 2026-08-20/21), and this
 * round's own review caught a real defect (see below) that a first pass at
 * extraction missed by only pulling out the pure reconciler and leaving the
 * op-minting / settle-on-resolve logic inline and untested.
 *
 * Settlement is **server-state-driven, not mutation-promise-driven**:
 * - Success: a pending op is cleared once `serverTags` itself reflects it
 *   (an attach's normalised name appears under `serverTags`, or a detach's
 *   tag id no longer does). This runs off the `serverTags` prop the
 *   reconciler already uses to decide whether a pending chip should render
 *   as "settled" — so state clears at exactly the moment it becomes
 *   invisible to the user, never before.
 * - Error: the mutation's returned promise is used **only** to detect
 *   rejection, so a failed attach/detach rolls back immediately instead of
 *   waiting on a `serverTags` update that will never come (D3).
 *
 * Why not settle-on-resolve for success too (what round 1 did): `
 * useUpdateBookmarkTags` (`packages/shared-react/hooks/bookmarks.ts`) fires
 * its `getBookmark` cache invalidation without awaiting/returning it inside
 * `onSuccess`, so the promise `mutateAsync` gives back can resolve *before*
 * the refetch that updates `serverTags` has landed. Clearing the pending op
 * on that resolution left a gap — neither the (just-cleared) pending op nor
 * a matching server tag existed — where the chip visibly disappeared and
 * reappeared (attach) or reappeared and disappeared (detach) on every add/
 * remove. Settling off `serverTags` instead removes that gap: the chip
 * simply stays rendered (as the pending, then as the real, chip) for
 * however long the round trip actually takes.
 */
import * as React from "react";

import type { ZBookmarkTags } from "@karakeep/shared/types/tags";
import { tagCaseInsensitiveKey } from "@karakeep/shared/utils/tag";

import {
  createPendingAttach,
  createPendingDetach,
  PendingTagOp,
  reconcileTags,
  ReconciledChip,
} from "./tagReconcile";

/** True if `value` looks like a Promise. `onAttach`/`onDetach` are typed
 *  `=> void | Promise<unknown>` — most callers are synchronous local-state
 *  setters (no server round trip to wait on), while `BookmarkTagsEditor`
 *  returns the real mutation's promise so failures can be detected. */
function isThenable(value: unknown): value is Promise<unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export interface UseTagPendingOpsArgs {
  serverTags: ZBookmarkTags[];
  onAttach: (tag: {
    tagName: string;
    tagId?: string;
  }) => void | Promise<unknown>;
  onDetach: (tag: {
    tagName: string;
    tagId: string;
  }) => void | Promise<unknown>;
}

export interface UseTagPendingOpsResult {
  /** Server tags + pending overlay, ready to render. */
  displayedTags: ReconciledChip[];
  /** Mints and fires a pending attach. No-ops (E6) if `rawName` normalises
   *  to empty, and no-ops (E7) if it already matches a displayed chip
   *  case-insensitively. */
  runAttach: (rawName: string, existingTagId?: string) => void;
  /** Mints and fires a pending detach. No-ops if `target` is itself still a
   *  pending attach (no real server id to detach yet). */
  runDetach: (target: ReconciledChip) => void;
}

export function useTagPendingOps({
  serverTags,
  onAttach,
  onDetach,
}: UseTagPendingOpsArgs): UseTagPendingOpsResult {
  const [pendingOps, setPendingOps] = React.useState<PendingTagOp[]>([]);

  const displayedTags = reconcileTags(serverTags, pendingOps);

  // Success-path settlement — see header comment. Runs whenever the server
  // tags this component was handed change; drops any pending op that is now
  // reflected in them.
  React.useEffect(() => {
    setPendingOps((prev) => {
      const next = prev.filter((op) => {
        if (op.kind === "attach") {
          const key = tagCaseInsensitiveKey(op.name);
          return !serverTags.some(
            (tag) => tagCaseInsensitiveKey(tag.name) === key,
          );
        }
        return serverTags.some((tag) => tag.id === op.tagId);
      });
      // Preserve referential stability when nothing actually settled, so
      // this doesn't cause an extra render every time an unrelated prop
      // update passes the same `serverTags` array through.
      return next.length === prev.length ? prev : next;
    });
  }, [serverTags]);

  const settlePendingOp = React.useCallback((opId: string) => {
    setPendingOps((prev) => prev.filter((op) => op.opId !== opId));
  }, []);

  const runAttach = React.useCallback(
    (rawName: string, existingTagId?: string) => {
      const op = createPendingAttach(rawName);
      if (!op) return; // E6 — whitespace/#-only input normalises to "".

      const key = tagCaseInsensitiveKey(op.name);
      const alreadyDisplayed = displayedTags.some(
        (tag) => tagCaseInsensitiveKey(tag.name) === key,
      );
      if (alreadyDisplayed) return; // E7 — no duplicate chip/mutation.

      setPendingOps((prev) => [...prev, op]);
      const result = onAttach({ tagName: op.name, tagId: existingTagId });
      if (isThenable(result)) {
        // Error-only fallback (see header comment): a rejected mutation
        // never lands in `serverTags`, so the effect above would never
        // clear this op on its own — clear it here so the UI snaps back to
        // server truth (D3). A *resolved* promise is deliberately ignored.
        result.then(undefined, () => settlePendingOp(op.opId));
      }
    },
    [displayedTags, onAttach, settlePendingOp],
  );

  const runDetach = React.useCallback(
    (target: ReconciledChip) => {
      if (target.pending) {
        // Guarded in the UI too (remove control disabled), kept here as a
        // hard stop: a pending attach has no real server id yet.
        return;
      }

      const op = createPendingDetach(target.id);
      setPendingOps((prev) => [...prev, op]);
      const result = onDetach({ tagId: target.id, tagName: target.name });
      if (isThenable(result)) {
        result.then(undefined, () => settlePendingOp(op.opId));
      }
    },
    [onDetach, settlePendingOp],
  );

  return { displayedTags, runAttach, runDetach };
}

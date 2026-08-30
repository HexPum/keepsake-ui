/**
 * Pure reconciliation for TagsEditor's chip list.
 *
 * TagsEditor has already been through two "fix the symptom" rounds (see
 * MISTAKES.md, 2026-08-20/21) for a `ResizeObserver`/`flushSync` crash —
 * both unrelated to this file's actual, still-unfixed defect: the editor
 * used to keep a second, hand-merged copy of the tag list
 * (`optimisticTags`) that could only ever *converge* with the server's tags
 * by exact, case-sensitive name equality, and could never *diverge* back
 * (it only ever pushed/replaced, never removed). That produced permanent
 * phantom chips whenever the server normalised a name (`#foo` -> `foo`),
 * reused a case-variant tag (`Ökonomie` -> `ökonomie`), or a mutation
 * failed outright — and made a chip that still held a client-minted
 * `temp-…` id undetachable, since the server has nothing to resolve that
 * id to.
 *
 * This module replaces that merge with a pure function: the server's
 * current tags (`_tags`) are always the truth, and a small, explicitly
 * tracked set of in-flight operations (pending attach/detach) is laid over
 * them to render optimistic chips before the server confirms. Nothing here
 * holds React state — that lives in TagsEditor — so the reconciliation
 * rules can be unit tested directly (tagReconcile.test.ts) without a DOM,
 * per this project's convention for logic that would otherwise need jsdom.
 */
import type { ZBookmarkTags } from "@karakeep/shared/types/tags";
import {
  normalizeTagName,
  tagCaseInsensitiveKey,
} from "@karakeep/shared/utils/tag";

export interface PendingAttach {
  kind: "attach";
  /** Stable id for this operation, used as the React key/removal handle
   *  while the attach is in flight — independent of the eventual server
   *  tag id, which isn't known until the mutation resolves. */
  opId: string;
  /** Already run through `normalizeTagName`, so it matches what the server
   *  will store in the common case (no case/`#`-variant reuse). */
  name: string;
}

export interface PendingDetach {
  kind: "detach";
  opId: string;
  /** Real server tag id being detached. A chip that is itself still a
   *  pending attach is never the target of a pending detach — TagsEditor
   *  disables its remove button until the attach settles — so this is
   *  always a genuine server id. */
  tagId: string;
}

export type PendingTagOp = PendingAttach | PendingDetach;

export interface ReconciledChip {
  /** The server tag id once settled, or the operation's `opId` while still
   *  a pending attach (there is no server id yet). Stable enough for a
   *  React `key`. */
  id: string;
  name: string;
  attachedBy: "human" | "ai";
  /** True for a chip that only exists because of an in-flight attach — the
   *  UI disables its remove control until this flips to false. */
  pending: boolean;
  /** Present only when `pending` is true — lets the UI target the right
   *  operation if it ever needs to reference it directly. */
  opId?: string;
}

let opCounter = 0;

function generateOpId(): string {
  opCounter += 1;
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `op-${crypto.randomUUID()}`;
  }
  return `op-${Date.now()}-${opCounter}`;
}

/**
 * Builds a pending-attach op from raw typed input, or `null` if the name is
 * empty after normalisation (whitespace-only or `#`-only input, which
 * `normalizeTagName` reduces to ""). Callers must not mint an optimistic
 * chip or send a mutation for a null result — today the server's own
 * `.filter((n) => n.length > 0)` silently drops it, leaving a phantom chip
 * behind that nothing ever cleans up.
 */
export function createPendingAttach(rawName: string): PendingAttach | null {
  const name = normalizeTagName(rawName);
  if (!name) return null;
  return { kind: "attach", opId: generateOpId(), name };
}

export function createPendingDetach(tagId: string): PendingDetach {
  return { kind: "detach", opId: generateOpId(), tagId };
}

/**
 * Derives the chip list to render from server truth + in-flight ops. Pure:
 * the same inputs always produce the same output. Chip order tracks the
 * server tags' own order, with pending attaches appended at the end, so an
 * unrelated add/remove elsewhere never reorders an existing chip.
 */
export function reconcileTags(
  serverTags: ZBookmarkTags[],
  pendingOps: PendingTagOp[],
): ReconciledChip[] {
  const pendingDetachTagIds = new Set(
    pendingOps
      .filter((op): op is PendingDetach => op.kind === "detach")
      .map((op) => op.tagId),
  );

  const visibleServerTags = serverTags.filter(
    (tag) => !pendingDetachTagIds.has(tag.id),
  );

  const visibleServerKeys = new Set(
    visibleServerTags.map((tag) => tagCaseInsensitiveKey(tag.name)),
  );

  const chips: ReconciledChip[] = visibleServerTags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    attachedBy: tag.attachedBy,
    pending: false,
  }));

  const seenPendingAttachKeys = new Set<string>();
  for (const op of pendingOps) {
    if (op.kind !== "attach") continue;
    const key = tagCaseInsensitiveKey(op.name);
    // Settled: the server now has a tag with this name (under whatever
    // casing/variant it chose to reuse) — the real chip above already
    // represents it, so this pending one must not render as a duplicate.
    if (visibleServerKeys.has(key)) continue;
    // Two concurrent attaches for the exact same name must not render as
    // two separate pending chips either.
    if (seenPendingAttachKeys.has(key)) continue;
    seenPendingAttachKeys.add(key);
    chips.push({
      id: op.opId,
      name: op.name,
      attachedBy: "human",
      pending: true,
      opId: op.opId,
    });
  }

  return chips;
}

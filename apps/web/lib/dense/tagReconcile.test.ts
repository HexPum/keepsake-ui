// Pure module, no DOM needed — see the header comment in tagReconcile.ts for
// why this logic was pulled out of TagsEditor in the first place.
import { describe, expect, it } from "vitest";

import type { ZBookmarkTags } from "@karakeep/shared/types/tags";

import {
  createPendingAttach,
  createPendingDetach,
  PendingTagOp,
  reconcileTags,
} from "./tagReconcile";

function tag(
  id: string,
  name: string,
  attachedBy: "human" | "ai" = "human",
): ZBookmarkTags {
  return { id, name, attachedBy };
}

describe("reconcileTags", () => {
  it("collapses a pending attach to one chip when the server returns a different casing", () => {
    const pending = createPendingAttach("Ökonomie")!;
    const chips = reconcileTags([tag("t1", "ökonomie")], [pending]);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({
      id: "t1",
      name: "ökonomie",
      pending: false,
    });
  });

  it("collapses a pending #foo attach to one chip named foo once the server stores it stripped", () => {
    const pending = createPendingAttach("#foo")!;
    expect(pending.name).toBe("foo");
    const chips = reconcileTags([tag("t1", "foo")], [pending]);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ id: "t1", name: "foo", pending: false });
  });

  it("hides the server tag behind a pending detach, and restores it once the op clears (error path)", () => {
    const serverTags = [tag("t1", "reading")];
    const detach = createPendingDetach("t1");

    const withPending = reconcileTags(serverTags, [detach]);
    expect(withPending).toHaveLength(0);

    // Simulates the mutation failing: TagsEditor drops the pending op and
    // re-derives straight from the (unchanged) server tags.
    const afterErrorRollback = reconcileTags(serverTags, []);
    expect(afterErrorRollback).toHaveLength(1);
    expect(afterErrorRollback[0]).toMatchObject({ id: "t1", name: "reading" });
  });

  it("drops a server tag that was removed externally once _tags no longer contains it (D4)", () => {
    // Simulates an open inline editor (no pending ops of its own) whose
    // `_tags` prop is re-derived after another surface — the row overflow
    // menu, another tab, a rule engine run — detaches the tag server-side.
    // The same call with the tag missing from `serverTags` must drop the
    // chip; this is what makes D4 (stale state under concurrent edits) a
    // property of `reconcileTags` itself rather than something that only
    // holds by construction.
    const before = reconcileTags(
      [tag("t1", "reading"), tag("t2", "other")],
      [],
    );
    expect(before.map((c) => c.id)).toEqual(["t1", "t2"]);

    const afterExternalDetach = reconcileTags([tag("t2", "other")], []);
    expect(afterExternalDetach.map((c) => c.id)).toEqual(["t2"]);
    expect(afterExternalDetach.some((c) => c.id === "t1")).toBe(false);
  });

  it("keeps two concurrent pending attaches for different names", () => {
    const opA = createPendingAttach("alpha")!;
    const opB = createPendingAttach("beta")!;
    const chips = reconcileTags([], [opA, opB]);
    expect(chips.map((c) => c.name).sort()).toEqual(["alpha", "beta"]);
    expect(chips.every((c) => c.pending)).toBe(true);
  });

  it("collapses two concurrent pending attaches for the same name into one chip", () => {
    const opA = createPendingAttach("dup")!;
    const opB = createPendingAttach("DUP")!;
    const chips = reconcileTags([], [opA, opB]);
    expect(chips).toHaveLength(1);
  });

  it("yields no pending op for a whitespace-only or #-only name", () => {
    expect(createPendingAttach("   ")).toBeNull();
    expect(createPendingAttach("###")).toBeNull();
    expect(createPendingAttach("")).toBeNull();
  });

  it("keeps chip order stable across an unrelated add and an unrelated remove", () => {
    const initial = reconcileTags([tag("a", "a-tag"), tag("b", "b-tag")], []);
    expect(initial.map((c) => c.id)).toEqual(["a", "b"]);

    // An unrelated tag "c" gets added server-side.
    const afterAdd = reconcileTags(
      [tag("a", "a-tag"), tag("b", "b-tag"), tag("c", "c-tag")],
      [],
    );
    expect(afterAdd.map((c) => c.id)).toEqual(["a", "b", "c"]);

    // "b" gets removed server-side; "a" and "c" must not reorder.
    const afterRemove = reconcileTags(
      [tag("a", "a-tag"), tag("c", "c-tag")],
      [],
    );
    expect(afterRemove.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("supports an explicit PendingTagOp union member for typing pending-op arrays", () => {
    const ops: PendingTagOp[] = [
      createPendingAttach("x")!,
      createPendingDetach("y"),
    ];
    expect(ops).toHaveLength(2);
  });

  // --- Adversarial cases added by the Tester ---

  it("does not crash on a very long tag name (>=29 chars, the Axis B regression length)", () => {
    const longName = "a".repeat(40);
    const pending = createPendingAttach(longName)!;
    expect(pending.name.length).toBe(40);
    const chips = reconcileTags([], [pending]);
    expect(chips).toHaveLength(1);
    expect(chips[0].name).toBe(longName);

    // Also exercise a server-side tag of the same length, as if it were
    // already attached at mount (§7 Axis B, "pre-attached" sub-case).
    const preAttached = reconcileTags([tag("t1", longName)], []);
    expect(preAttached).toHaveLength(1);
    expect(preAttached[0].name.length).toBe(40);
  });

  it("does not resurrect a pending detach's tag as a duplicate chip if the same name is re-attached before the detach settles", () => {
    // User detaches "reading", then immediately re-types "reading" before
    // the detach mutation resolves. The detach hides the real server tag,
    // so the case-insensitive match in the attach branch no longer sees it
    // and mints a *new* pending chip under the same name. This is the
    // documented, deliberate behaviour (a fresh attach for a
    // concurrently-being-removed tag) — asserting it explicitly so a
    // future refactor that instead collapses/dedupes across a pending
    // detach doesn't silently change this contract.
    const serverTags = [tag("t1", "reading")];
    const detach = createPendingDetach("t1");
    const reattach = createPendingAttach("reading")!;

    const chips = reconcileTags(serverTags, [detach, reattach]);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ name: "reading", pending: true });
  });

  it("does not throw when a pending detach targets a tag id no longer present in serverTags (E11 — removed on another tab first)", () => {
    const detach = createPendingDetach("ghost-id");
    expect(() => reconcileTags([tag("t1", "reading")], [detach])).not.toThrow();
    const chips = reconcileTags([tag("t1", "reading")], [detach]);
    expect(chips).toHaveLength(1);
    expect(chips[0].id).toBe("t1");
  });

  it("collapses three concurrent same-name pending attaches (mixed case) into a single chip", () => {
    const ops = [
      createPendingAttach("OSINT")!,
      createPendingAttach("osint")!,
      createPendingAttach("OsInT")!,
    ];
    const chips = reconcileTags([], ops);
    expect(chips).toHaveLength(1);
    expect(chips[0].name).toBe("OSINT");
  });

  it("does not throw on whitespace-heavy, emoji-only, or extremely long (300 char) raw input", () => {
    expect(createPendingAttach(" \t\n ")).toBeNull();
    expect(() => createPendingAttach("🔥🔥🔥")).not.toThrow();
    expect(createPendingAttach("🔥🔥🔥")).not.toBeNull();
    const huge = "x".repeat(300);
    expect(() => createPendingAttach(huge)).not.toThrow();
    expect(createPendingAttach(huge)!.name.length).toBe(300);
  });

  it("normalises a mix of leading '#' and internal whitespace consistently with the server's normalizeTagName", () => {
    const pending = createPendingAttach("  ###foo bar  ")!;
    // normalizeTagName only trims and strips *leading* '#' runs; internal
    // text (including the space) is preserved as-is.
    expect(pending.name).toBe("foo bar");
  });

  it("treats an empty pendingOps array and empty serverTags as a stable no-op (E1 — zero tags, first render)", () => {
    const chips = reconcileTags([], []);
    expect(chips).toEqual([]);
    // Calling it again must not mutate any shared state (e.g. the opId
    // counter must not affect equality of the derived chip list).
    expect(reconcileTags([], [])).toEqual([]);
  });

  it("keeps a pending attach's opId stable as its own React key across repeated derivations of the same ops array", () => {
    const op = createPendingAttach("stable")!;
    const first = reconcileTags([], [op]);
    const second = reconcileTags([], [op]);
    expect(first[0].id).toBe(second[0].id);
    expect(first[0].id).toBe(op.opId);
  });
});

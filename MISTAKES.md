# Mistakes

A log of things that broke, or that the user had to correct, while working on
this repo. Newest first. Each entry: what happened, root cause, consequence,
and the rule that prevents a repeat.

When the same failure shows up 4-5 times, stop logging it here and promote it
to a hard rule in `AGENTS.md` instead — this file is where evidence
accumulates, `AGENTS.md` is where it gets enforced.

<!--
Entry template:

## YYYY-MM-DD — short title

**What happened:** ...
**Root cause:** ...
**Consequence:** ...
**Prevention:** ...
-->

## 2026-08-25 — Detail-view icon order guessed instead of stated back, spacing shipped unverified

**What happened:** Asked to add a "more" icon next to Favourite/Archive in the bookmark detail top bar (removing two now-redundant icons), it was appended in reading order (Favourite, Archive, More) — mirroring where the old icons used to sit — without restating the intended left-to-right order back to the user first. Separately, the new Note/Attachments collapse sections were shipped with a spacing value (gap-[22px], inherited from the surrounding content rhythm) chosen without visual feedback, since the Chrome extension was disconnected at the time. The user visually reviewed and corrected both: order should be more → archive → favourite, and the gap around the collapsed Note/Attachments rows (plus the trailing gap before the divider below them) was too generous for two one-line headers.
**Root cause:** New-element placement defaulted to "wherever fits in the existing code order" rather than being explicitly confirmed, since the request didn't spell out a position. Spacing was carried over from a value tuned for full-height content blocks (Summary, Key points) without reconsidering that a collapsed one-line disclosure row has very different visual weight — and it was presented as finished despite no visual check having been possible.
**Consequence:** A second small correction round: reorder the icons (both desktop and mobile, for consistency) and rework the spacing into a tighter grouped rhythm (gap-[10px]) plus a reduced trailing container padding.
**Prevention:** When adding a control near existing ones and the exact position isn't specified, state the intended left-to-right order back before or right after implementing rather than assuming appended-at-the-end is fine. When a spacing/layout value can't be visually verified (tool unavailable, etc.), say so explicitly and flag the chosen number as a first guess needing a look, rather than presenting it as done — don't let "preflight passed" stand in for "looks right on screen" (repeat of the stale-cache/hover-invisible failure mode below: code-correct isn't screen-correct).

## 2026-08-22 — RAG chat retrieval patched five times in one day for the same underlying flaw (repeat root cause)

**What happened:** The chat route's bookmark retrieval (`apps/web/app/api/chat/route.ts`) shipped as "fixed" and was then broken again by a new phrasing four more times the same day: `14fe46c9` stripped stopwords so "What have I saved about Claude Code?" would match; `60872f6a` found that any leftover non-stopword token (e.g. "Summarize", a stray "ve" from "I've") still broke the all-must-match query and switched to per-keyword fallback queries; `d17a1143` found that a single loose, generic keyword (e.g. "related") could crowd out the real per-keyword queries via an early-exit result-budget check, hiding real tag matches ("camping"/"outdoors"); `2a9a182b` found tag matches could still lose to loosely-relevant text matches within one keyword's own capped budget; `85240bf9` found the model only named one bookmark when several matched because the prompt never said to enumerate. Each fix was verified thoroughly (direct Meilisearch curls, re-checked prior cases) and each individually correct — but each also only covered the exact phrasing/case that had just failed.
**Root cause:** Retrieval query-construction and ranking were fixed reactively, one failing real-world phrasing at a time, rather than validated up front against a small matrix of query shapes (stopword-only, contraction, filler-verb, multi-tag, single-vs-multi-match) before being called done. A query-matching/retrieval subsystem is exactly the kind of logic where the next edge case is predictable in advance, not something to discover one user message at a time.
**Consequence:** Five separate fix cycles (and five commits) to reach a retrieval implementation that behaves correctly across common natural-language phrasings, each shipped and re-broken by the next untested case.
**Prevention:** When building or fixing any query-matching/retrieval logic (search, chat RAG, tag resolution), write and run a small test matrix of representative phrasings — including contractions, filler words, multi-topic queries, and both loose-text and exact-tag matches — before declaring it fixed, instead of validating only the one reported phrasing. **Promotion candidate:** this is the fourth+ time the same "fixed for the reported case, broke on the next untested one" pattern shows up in this log (see the hover-imperceptible, hover-scoped-too-narrow, and stale-cache entries below) — worth a hard rule in `AGENTS.md`: for any matching/ranking/threshold logic, state the test matrix used *before* claiming done, not just the one case that prompted the fix.

## 2026-08-21 — Hover states present in code but imperceptible (invisible on the near-black bg)

**What happened:** After the hover sweep (fix #3), the user still saw "no hover" on sidebar nav rows and bookmark list rows. The hover classes WERE there — but used a dark token at reduced opacity (`hover:bg-k-surface-1/60`, `hover:bg-k-border-soft/60`) whose per-channel delta from the base bg was only +4/+5/+6, effectively invisible.
**Root cause:** Chose a hover bg by picking a plausible token + `/60` opacity without checking the actual resulting contrast against the near-black base. "Has a hover class" was treated as "has a visible hover".
**Consequence:** A second contrast-only fix (#4) raising the hovers to full-opacity base tokens (delta ~+7/+9/+11) and adding a 2px accent bar so selected stays distinct.
**Prevention:** For any subtle surface/hover color, compute the actual per-channel delta vs the background it sits on — a dark token at <100% opacity over near-black is usually imperceptible. State the color math in the report when a browser isn't available to eyeball it. Repeat of the "looks done in code, isn't done on screen" failure mode — see the hover-scoping entry below and the stale-cache entry.

## 2026-08-21 — Hover sweep scoped too narrowly + "done" by eyeballing

**What happened:** Track B's "hover on everything" item was scoped to just the sidebar and marked done after a visual read; the user then found gaps (search field, FILES grid tiles, view-toggle) and inconsistent/weak hovers (icon-only controls had only a faint color shift vs. neighbours' bg-tint).
**Root cause:** A broad "everywhere" instruction was narrowed to one area, and coverage was judged by eyeballing rather than enumerating every interactive element. Weak-but-present hover wasn't recognized as a gap.
**Consequence:** A second full sweep (fix #3) across sidebar + search + list rows + grid tiles.
**Prevention:** For any "apply X everywhere" task, mechanically enumerate every interactive element (grep every `<Link>`/`<button>`) and check both presence AND consistency of the affordance strength — don't eyeball, and treat weak/inconsistent as a gap.

## 2026-08-21 — Nobody was writing to this file

**What happened:** Several correctable mistakes happened across Phase 2 (below), but MISTAKES.md stayed an empty template until the user asked why.
**Root cause:** Corrections were captured only in the hive's own state (god memory + task `result` fields); no step mirrored them into the repo's MISTAKES.md. The logging habit was never wired into the workflow.
**Consequence:** The repo's own evidence log was useless; lessons lived only in a place the user doesn't read.
**Prevention:** After every user correction or broken build, add an entry here in the same turn it's resolved — treat it as part of "done", not optional. God pfleg­t es bei der Integration mit.

## 2026-08-21 — Stale .next cache hid every UI change ("I see no changes")

**What happened:** After Tracks B + A + two review fixes, the user reported seeing no changes at all in localhost.
**Root cause:** The running `next dev` reused a persistent Turbopack `.next` cache (build stamped 15:41) and never recompiled the dashboard route, even though the source edits (17:54) and the server start (17:57) were both newer. Code was 100% correct on-disk on the right branch.
**Consequence:** A full diagnostic round (branch/worktree/served-CSS checks) to prove the code was present and locate the real cause.
**Prevention:** After a batch of UI changes, restart the dev server with a clean cache: `rm -rf apps/web/.next && pnpm --filter @karakeep/web run dev`, then hard-reload (Cmd+Shift+R). Don't trust HMR to pick up new `public/` assets or large CSS/layout changes.

## 2026-08-21 — HEX-OS chat hero over-built (CRT frame + animations) when a simple static version was wanted

**What happened:** The first HEX-OS empty-state used the CRT-monitor jpg + CSS scanlines + a flicker animation. The user wanted a simple, static, tokenized glyph + wordmark with no animation.
**Root cause:** Treated the CRT reference art as the literal build target instead of as mood/direction, and gold-plated the effects on a first pass.
**Consequence:** A full rebuild of the hero (fix #2), plus deleting the CRT asset and the scanline/flicker CSS.
**Prevention:** For aesthetic/hero elements, ship the simplest static version first and let the user ask for effects. Reference images are mood, not a spec — confirm fidelity level before adding motion.

## 2026-08-21 — Chat input bar: shrank its height instead of anchoring it to the bottom

**What happened:** The dispatch read the "bottom bar should take much less space" annotation as "make the bar shorter", so the input padding/heights were reduced. The actual intent was to move the input bar + divider down to the bottom edge (standard chatbot layout) so the hero fills the freed middle.
**Root cause:** Ambiguous layout annotation interpreted as size, not position. The real problem was dead space below the bar (the chat container sized to content, not viewport), not the bar's height.
**Consequence:** The shrink was reverted and redone as a bottom-anchored flex footer (fix #1) — one wasted build + one correction round.
**Prevention:** When an annotation is about space/room, distinguish size vs. position vs. container-fill before dispatching. For "fills the middle / bar at the bottom", suspect a flex height-chain gap, not element sizing.

## 2026-08-21 — First tags-ui commit rejected by the pre-commit hook (oxfmt not run)

**What happened:** `git commit` of the tags-ui slice failed; the husky pre-commit hook's full-tree `format` step flagged 2 new component files.
**Root cause:** Worker-authored new files weren't oxfmt-clean, and oxfmt wasn't run before committing.
**Consequence:** Failed commit, then re-run of `oxfmt` + re-stage + re-commit.
**Prevention:** Always run `cd apps/web && pnpm exec oxfmt --ignore-path=../../.gitignore .` before committing. This is now baked into every worker dispatch contract; keep it there.

## 2026-08-20 — Debounce fix for tag-input crash was incomplete: same crash, different trigger, still reproduced

**What happened:** `92c7babf` fixed the "Maximum update depth exceeded" crash in `TagsEditor.tsx` by debouncing the tag-search query, verified against fast-typing/short tag names. The Browser Scout retested and the same crash still reproduced 4/4 times for tag names ~29+ characters (typed or already-attached), unrelated to typing speed. `b46a47f8` found the real second cause — unbounded input/pill width feeding a `ResizeObserver` + `flushSync` loop in the tag-suggestions Popover — and fixed that separately.
**Root cause:** `92c7babf`'s fix correctly addressed the one variable its own repro happened to vary (typing speed) but wasn't re-tested against the other obvious axis of the same symptom (tag-name length) before being declared fixed — two independent defects shared one crash signature, and only one was checked.
**Consequence:** A second full repair cycle (root-cause trace through `@floating-ui/react-dom`'s `flushSync` path, a second fix, second verification round) for a crash that had already been marked resolved once.
**Prevention:** When a fix targets one specific variable of a reported crash (input speed, string length, count, etc.), before declaring it fixed check whether the same symptom can be reproduced by varying a *different* plausible axis of the same input — don't let "verified the exact repro steps" stand in for "confirmed the whole failure class is gone."

## 2026-08-20 — Concurrent Repair Squad members' git add/commit interleaved, swept one member's file into another's commit

**What happened:** Two squad members working in parallel each ran `git add` on their own assigned files followed by `git commit`; one member's `git add` (`TagsEditor.tsx`, for the long-tag-name-crash fix) landed in the window between another member's `add` and `commit` (for the note-content-disclosure fix), so `TagsEditor.tsx` was swept into the wrong commit (`7579db77`) under the wrong message. Neither `git commit` failed or warned — there was no `index.lock` collision to signal the problem — so it went unnoticed until a post-commit `git show --stat HEAD` check caught it.
**Root cause:** `git add <files>` immediately followed by `git commit` is not atomic against another process's concurrent `git add` on the same index — a race window exists between the two commands with no lock held across them. Two squad members dispatched to commit independently in parallel hit that window.
**Consequence:** A working-but-mis-attributed commit had to be surgically corrected after the fact: the swept-in hunk was reverse-applied as its own commit (`896b62c6`) and reapplied as a fresh, correctly-attributed commit (`b46a47f8`), without rewriting any shared history.
**Prevention:** When dispatching multiple squad members to commit in parallel, each must verify with `git show --stat HEAD` immediately after its own commit that only its intended files were included, and correct via additive revert+reapply (never `reset`/`rebase`/`amend` on shared history) if not. Prefer `git commit -- <exact paths>` over a prior separate `git add` step to shrink the race window where practical.

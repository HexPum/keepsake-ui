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

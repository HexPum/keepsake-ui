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

## 2026-09-25 — Semantic-search env block was appended twice

**What happened:** The local `apps/web/.env` and `apps/workers/.env` already contained the newly configured semantic-search variables, but a follow-up setup step appended the same assignments a second time. The duplicate values were identical and therefore did not change runtime behavior, but made the effective configuration needlessly ambiguous.
**Root cause:** The pre-write inspection reported matching lines without enough surrounding context and was treated as proof that the block was absent.
**Consequence:** Both ignored local env files needed a cleanup pass before restarting the development stack.
**Prevention:** Before adding environment keys, inspect their full section and make updates idempotent: replace existing assignments or add only absent names, then verify each key occurs exactly once.

## 2026-09-22 — Hermes model variant was generalized before dispatch

**What happened:** The user requested Hermes as the implementation agent and then had to correct the model from a generic “DeepSeek Flash” description to the exact variant “Flash v4.1” before dispatch.
**Root cause:** The orchestration update repeated an inferred model family instead of preserving the precise model selection as an explicit launch requirement.
**Consequence:** No incorrect worker was launched, but the dispatch had to be paused and corrected before execution.
**Prevention:** Treat named agent and model variants as an exact pair; echo the precise variant and verify the effective launch receipt before claiming the requested model is running.

## 2026-09-10 — QA-persona lane reported five phantom product failures and one phantom pass (playwright locator/assertion defects)

**What happened:** First end-to-end `qa:persona -- researcher` run returned 3 PASS / 5 FAIL. The FAILs looked like product defects but were one persona-script bug cascading: check 04 located the tag field with `getByRole("combobox").or(dialog.locator("input")).first()`, `.or()` unions both sets, and `.first()` returns the first input **in document order** — the dialog's *Title* field. "research" was typed into Title, the tag popover never opened, the dialog stayed open, and checks 05-08 failed behind its overlay. After fixing that, two more defects surfaced: a bare `getByRole("dialog")` became a strict-mode violation (the Radix tag popover is also `role="dialog"`), so the post-save `waitFor({ state: "hidden" })` threw although the tag change had persisted; and check 03 identified "the bookmark I just created" as the **top row**, which after a background crawl update was the new *article* — so it reported the article's URL as the new *note's* title and would have passed while asserting nothing about the note. Separately, the design-guardian's `countVisibleMedia` counted every element with a non-`none` `background-image`, so accent **gradients** (e.g. the RE-SUMMARISE button) showed up as "2 visible media elements" on a detail view that renders no image at all; and `list-reader` check 06 failed three different ways in a row (click timeout, then locator never resolving) because the bookmark preview route-modal makes Radix mark the rest of the app `aria-hidden`, so no role-based locator can reach the sidebar while it is open — and Escape does not dismiss that route-modal.
**Root cause:** Locators and identities were written from what *looked* reasonable rather than from the rendered DOM: `.or()` semantics were misread as "prefer the first selector", a role that is not unique was used bare, "newest = top row" was assumed stable under background job updates, a visual-media predicate treated decorative CSS as content, and modal/`aria-hidden` interaction was not considered. Each of these makes a check either unable to see its subject (false FAIL) or able to assert against the wrong element (false PASS) — the two ways a QA lane silently loses its value.
**Consequence:** Five FAILs that were not product bugs (and one PASS that verified the wrong row) had to be triaged by screenshot before any of it could be trusted; the researcher/list-reader/design-guardian runs were repeated four times in total. After the fixes: `researcher` 7/8 (remaining FAIL is a real finding — a tag created in the bookmark tag editor does not refresh the sidebar TAGS section until reload), `list-reader` 9/9, `design-guardian` 7/9 (remaining FAILs: a dialog ships `shadow-lg`, and the *default* theme computes to Violet/Deep-slate `#0e1116`/`#7c5dff` while `design/README.md` documents Charcoal/Mint `#0d0d0e`/`#7ee2b8` as the default).
**Prevention:** In persona/UI automation: never widen a locator with `.or()` plus `.first()` (it is document order, not preference) — target the specific element (here `input[cmdk-input]`); never use a bare role more than one element can carry — name it (`getByRole("dialog", { name: "Edit Bookmark" })`); never identify "what I just created" by position — diff the visible titles before/after and fail loudly on an ambiguous diff; count media/previews only for `img`/`picture`/`video[poster]` or a `url(...)` background at meaningful size, never for gradients; and before driving a sidebar/topbar from a route-modal state, leave the modal first, because Radix marks everything else `aria-hidden`. Read the failing check's screenshot before believing any persona FAIL or PASS.

## 2026-09-10 — Docker build context carried the whole local pnpm store and every agent artifact

**What happened:** Every E2E/QA stack start (`docker compose up --build`) re-transferred a ~4.9 GB build context and re-ran the entire AIO image build even when no source file had changed. `.dockerignore` excluded `**/node_modules`, `.git` and `packages/e2e_tests`, but not the repo-root `.pnpm-store/` (5.9 GB, gitignored) and not `.claude/**` beyond `.claude/worktrees` — and the QA lane rewrites `.claude/qa-reports/**` and `.claude/pipeline/**` on every run, so the `COPY . .` layer hash changed every single time.
**Root cause:** The ignore list was written against the *tracked* tree; local runtime artifacts (package-manager store, agent/QA output directories, macOS `.DS_Store`) were never considered, even though the build context is the working directory rather than the git index.
**Consequence:** A full rebuild per persona run, which made the three-charter lane impractical and hid real build failures behind repeated long builds.
**Prevention:** When a Docker build context is the repo root, check it against the ignored/untracked tree (`git status --ignored`, `du`) for local-only directories and exclude them explicitly (`.pnpm-store`, `.claude`, `**/.DS_Store` here). After the fix the context is ~275 MB and the `COPY . .` layer stays cacheable across runs.

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

## 2026-08-30 — QA-persona-lane executor run blocked by pre-existing `docker/Dockerfile` whisper.cpp build failure, unrelated to the diff

**What happened:** Implementing the QA-persona lane per `.claude/pipeline/qa-persona-lane/architect-spec.md`, the very first command in section 3 that touches Docker (`pnpm --filter @karakeep/e2e_tests exec vitest run qa/report.test.ts`, which boots the shared `packages/e2e_tests/docker-compose.yml` stack via `globalSetup`) failed at `docker compose up --build -d`. The `web` image's `whisper_builder` stage (`docker/Dockerfile`, unchanged by this diff) fails compiling `whisper.cpp`'s `ggml-cpu` with a SIMD codegen error (`GGML_F16x8_FMA` / `ops.cpp.o`, gcc exit code 2) — a pre-existing toolchain/compiler issue on this machine, not caused by the QA-persona-lane changes (docker-compose.yml's `web` build `context`/`target` were not touched, only port publishing + `NEXTAUTH_URL`/`extra_hosts`).
**Root cause:** `docker/Dockerfile`'s `whisper_builder` stage is currently broken against this machine's Docker Desktop build toolchain (likely a newer/different base-image compiler than whisper.cpp's `ggml-cpu` SIMD path was written against). This blocks *any* build of the `web` AIO image, including the pre-existing (unmodified) `packages/e2e_tests` suite, not just the new QA-persona commands.
**Consequence:** Per the executor briefing's rule 3 (stop on any deviation, do not improvise, do not touch files outside the spec), the run stopped here. All 15 files from the architecture spec were written and `pnpm install --frozen-lockfile` (after one `--lockfile-only`) succeeded, but none of the docker-dependent commands in section 3 (`qa/report.test.ts` onward) could be verified — they all depend on the same broken `web` image build. `pnpm-lock.yaml` also picked up unrelated `@babel/core` 7.29.0→7.29.7 peer-resolution-string churn (next/next-auth/next-i18next/nuqs/styled-jsx) and a `tsx@4.21.0` transitive `get-tsconfig` bump from the plain `--lockfile-only` re-resolution — not a version upgrade of any direct dependency, but wider than "only the e2e_tests importer change" per spec item 14.
**Prevention:** Before starting a task whose commands depend on `docker compose up --build` for the `web` AIO image, do a cheap standalone build check first (`docker build -f docker/Dockerfile --target aio .` or similar) to confirm the image builds on this machine, independent of whatever feature is being implemented — this surfaces a broken base image in seconds instead of after a full implementation pass. The whisper.cpp build failure itself needs a fix in `docker/Dockerfile` (pin a working gcc/base image, or patch/disable the affected SIMD path) before any e2e/QA docker-stack work on this machine can be verified end-to-end.
**Review finding (follow-up):** The Docker blocker above also masked that the diff's *Docker-independent* static gates (`typecheck`/`lint`/`format` on the new `qa/`+`tests/qa/` files) had never actually been run, since the stop-on-first-Docker-failure rule was applied to the whole command list rather than just the docker-dependent tail of it. Prevention: when a task's command list mixes Docker-dependent and Docker-independent steps and an early Docker step fails, still run every Docker-independent gate (`typecheck`, `lint`, `format`) before reporting the stop — a build-environment blocker is not a reason to leave static correctness unchecked.

## 2026-08-20 — Concurrent Repair Squad members' git add/commit interleaved, swept one member's file into another's commit

**What happened:** Two squad members working in parallel each ran `git add` on their own assigned files followed by `git commit`; one member's `git add` (`TagsEditor.tsx`, for the long-tag-name-crash fix) landed in the window between another member's `add` and `commit` (for the note-content-disclosure fix), so `TagsEditor.tsx` was swept into the wrong commit (`7579db77`) under the wrong message. Neither `git commit` failed or warned — there was no `index.lock` collision to signal the problem — so it went unnoticed until a post-commit `git show --stat HEAD` check caught it.
**Root cause:** `git add <files>` immediately followed by `git commit` is not atomic against another process's concurrent `git add` on the same index — a race window exists between the two commands with no lock held across them. Two squad members dispatched to commit independently in parallel hit that window.
**Consequence:** A working-but-mis-attributed commit had to be surgically corrected after the fact: the swept-in hunk was reverse-applied as its own commit (`896b62c6`) and reapplied as a fresh, correctly-attributed commit (`b46a47f8`), without rewriting any shared history.
**Prevention:** When dispatching multiple squad members to commit in parallel, each must verify with `git show --stat HEAD` immediately after its own commit that only its intended files were included, and correct via additive revert+reapply (never `reset`/`rebase`/`amend` on shared history) if not. Prefer `git commit -- <exact paths>` over a prior separate `git add` step to shrink the race window where practical.

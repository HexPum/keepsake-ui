---
description: Run the full plan -> code -> test -> review pipeline on a feature idea, unattended.
argument-hint: <feature idea>
---

Run the four-stage pipeline on this idea: $ARGUMENTS

<setup>
1. Derive a short kebab-case slug from the idea (e.g. "add CSV export to the reports page" -> `csv-export`).
2. Create `.claude/pipeline/<slug>/` if it doesn't exist.
3. If `.claude/pipeline/<slug>/spec.md` already exists, ask the user whether to resume this run or start a fresh slug — don't silently overwrite a previous plan.
</setup>

<pipeline>
Run each stage via the Task tool, invoking the named subagent, in order. Do not skip a stage and do not let a later stage start before the prior stage's output file exists.

1. **Plan** — dispatch to `pipeline-planner` with the idea and the slug. Wait for `spec.md` to exist before continuing.
2. **Code** — dispatch to `pipeline-coder` with the slug. If it reports "Blocked" in `implementation-log.md`, stop the whole run and surface the blocker to the user instead of guessing past it.
3. **Test** — dispatch to `pipeline-tester` with the slug.
4. **Review** — dispatch to `pipeline-reviewer` with the slug. Read its verdict.
</pipeline>

<gate>
- If the verdict is **APPROVED**: report success, list the changed files from `implementation-log.md`, and stop.
- If the verdict is **REJECTED**: write the reviewer's reasons into `.claude/pipeline/<slug>/review.md`, then dispatch back to `pipeline-coder` with the spec, the implementation log, and the rejection reasons, and re-run stages 2–4.
- Retry up to **3 times total**. On a 3rd REJECTED, stop and hand the full pipeline folder to the user rather than looping forever — a pipeline that can't converge needs a human, not another retry.
</gate>

<final_report>
State plainly: which slug, how many rounds it took, the final verdict, and the exact file list that changed. If it took more than one round, say why the first attempt was rejected — that's useful signal about where the spec or the Coder tends to go wrong.
</final_report>

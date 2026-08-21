---
description: Run the 3-role bug-extinguishing loop (Browser Scout + Log Watcher -> Repair Squad) for a fixed number of cycles against the running dev server.
argument-hint: [cycle count, default 5] [base URL, default http://localhost:3000]
---

Run the bug-extinguishing loop against the Keepsake dev site: $ARGUMENTS

<setup>
1. Ensure `.claude/pipeline/bug-loop/` exists.
2. Confirm the Next.js dev server is up at the target base URL (default `http://localhost:3000`) and its log is being captured to a file. If not running, start it (`pnpm web` or equivalent) in the background, redirected to `.claude/pipeline/bug-loop/dev-server.log`, and wait for it to report ready before cycle 1.
3. Default cycle count is 5 unless the arguments say otherwise.
</setup>

<cycle>
Repeat for N cycles. Do not let a stage start before the prior stage's output file for this cycle exists.

1. **Scout, in parallel** — dispatch both in the same turn:
   - `bug-scout-browser` with the base URL and any flows worth re-checking (e.g. ones the Repair Squad just touched last cycle).
   - `bug-scout-logs` with the log file path and the offset from `.claude/pipeline/bug-loop/log-offset.txt` (0 on cycle 1).
2. **Repair** — once both scouts finish, look at the distinct bugs found this cycle. Group them: bugs that plausibly touch the same file/module go in the same group (serialized), bugs that are clearly independent (different files/subsystems) each get their own group. Dispatch one `repair-squad` agent per group, in parallel, each given only its group's bug(s) as its assignment. Wait for all of them to finish and for `.claude/pipeline/bug-loop/repair-log.md` to reflect every group before continuing. If there's only one bug this cycle, dispatch a single `repair-squad` as before — don't parallelize for its own sake.
3. Record a one-line summary of the cycle (bugs found, bugs fixed, commits made) in `.claude/pipeline/bug-loop/cycle-summary.md`, appending, not overwriting.
</cycle>

<early_stop>
If two consecutive cycles both report zero new findings from both scouts, stop early and say so — don't burn remaining cycles for nothing.
</early_stop>

<final_report>
State plainly: cycles run, total bugs found, total fixed, total skipped (with why), and the commit list (`git log --oneline` since the loop started). If the dev server needs to stay running for the user, say that and how to stop it.
</final_report>

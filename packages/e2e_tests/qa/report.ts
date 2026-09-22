import { mkdir, rename, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import type { PersonaId } from "./charters";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** `packages/e2e_tests/qa/report.ts` -> repo root. */
const REPO_ROOT = path.resolve(__dirname, "../../..");
export const QA_REPORTS_ROOT = path.join(REPO_ROOT, ".claude", "qa-reports");

export type CheckResult = "PASS" | "FAIL";

export interface CheckReport {
  /** Two-digit order (or the literal "RUNNER" for a technical failure that
   *  isn't any one checklist item). */
  id: string;
  slug: string;
  title: string;
  result: CheckResult;
  reproduction: string;
  observed: string;
  expected: string;
  /** Relative paths (from the run directory) to evidence files, e.g.
   *  `screenshots/04-article-detail-pass.png`. */
  evidence: string[];
}

export interface RunManifest {
  personaId: PersonaId;
  startedAt: string;
  finishedAt: string;
  gitSha: string;
  composeProjectName: string;
  appOrigin: string;
  cdpEndpoint: string;
  viewport: { width: number; height: number };
  seedVersion: string;
}

export interface PersonaReport {
  run: RunManifest;
  checks: CheckReport[];
}

const RUN_DIR_PATTERN =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z-[0-9]+-[0-9a-z]{6}-(researcher|list-reader|design-guardian)$/;

const SECRET_KEY_PATTERN =
  /cookie|password|passwd|secret|apikey|api_key|token|authorization/i;

/** Throws if any key name anywhere in the value looks like it might carry
 *  a credential. Recurses through plain objects/arrays only (the shapes
 *  actually written to disk here). */
function assertNoSecretKeys(value: unknown, pathSoFar = ""): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecretKeys(v, `${pathSoFar}[${i}]`));
    return;
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(
        `Refusing to write report: key "${pathSoFar}.${key}" looks like a secret and must never be persisted.`,
      );
    }
    assertNoSecretKeys(v, `${pathSoFar}.${key}`);
  }
}

/** Resolves (and validates) the run directory for a persona report. Rejects
 *  anything that isn't exactly `.claude/qa-reports/<UTC>-<persona>` under
 *  the repo root — no path traversal via a crafted run id. */
export function resolveRunDir(runDirName: string): string {
  if (!RUN_DIR_PATTERN.test(runDirName)) {
    throw new Error(
      `Refusing to use run directory name "${runDirName}": must match ${RUN_DIR_PATTERN}.`,
    );
  }
  const resolved = path.resolve(QA_REPORTS_ROOT, runDirName);
  if (
    path.relative(QA_REPORTS_ROOT, resolved).startsWith("..") ||
    path.isAbsolute(path.relative(QA_REPORTS_ROOT, resolved))
  ) {
    throw new Error(
      `Refusing to write outside ${QA_REPORTS_ROOT}: ${resolved}`,
    );
  }
  return resolved;
}

async function writeFileAtomic(
  filePath: string,
  content: string,
): Promise<void> {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
}

/** Last-resort RUNNER evidence for `./browser`'s `runnerFailure`, used only
 *  when neither a screenshot nor any captured Docker log survived: a
 *  small, atomically-written text file recording the raw error, so
 *  `validateReport`'s "every FAIL needs evidence" rule is never satisfied
 *  by an empty lie. Returns the path relative to the run directory
 *  (`runner-error.txt`) for use as a check's `evidence` entry. */
export async function writeRunnerErrorFallback(
  runDir: string,
  error: unknown,
): Promise<string> {
  const relPath = "runner-error.txt";
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeFileAtomic(path.join(runDir, relPath), `${message}\n`);
  return relPath;
}

/** Fallback evidence for an ordinary checklist FAIL whose own failure
 *  screenshot also couldn't be captured (e.g. a Chromium "Target
 *  crashed"), used by `./browser`'s `runCheck` so that FAIL still has
 *  real evidence instead of tripping `validateReport`'s "every FAIL needs
 *  evidence" rule and losing the whole report — including every other
 *  check's already-completed PASS/FAIL result — to a single flaky
 *  screenshot. Content is deliberately minimal: only the screenshot
 *  capture's own error message and an ISO timestamp, never page content,
 *  cookies, tokens, headers, or environment values. Filename is per-check
 *  (`<id>-<slug>-screenshot-error.txt`) so two crashing checks in the same
 *  run don't overwrite each other's evidence. Returns the path relative to
 *  the run directory. */
export async function writeScreenshotErrorEvidence(
  runDir: string,
  id: string,
  slug: string,
  screenshotError: unknown,
): Promise<string> {
  const relPath = path.join(
    "screenshots",
    `${id}-${slug}-screenshot-error.txt`,
  );
  const message =
    screenshotError instanceof Error
      ? screenshotError.message
      : String(screenshotError);
  const content = [
    `Screenshot-Fehler: ${message}`,
    `Zeitstempel: ${new Date().toISOString()}`,
  ].join("\n");
  await mkdir(path.join(runDir, "screenshots"), { recursive: true });
  await writeFileAtomic(path.join(runDir, relPath), `${content}\n`);
  return relPath;
}

function renderCheckBlock(check: CheckReport): string {
  const evidence =
    check.evidence.length > 0 ? check.evidence.join(", ") : "none";
  return [
    `### ${check.id} — ${check.title}: ${check.result}`,
    `Reproduktion: ${check.reproduction}`,
    `Observed: ${check.observed}`,
    `Expected: ${check.expected}`,
    `Evidence: ${evidence}`,
  ].join("\n");
}

export function renderReportMarkdown(report: PersonaReport): string {
  const failed = report.checks.filter((c) => c.result === "FAIL");
  const passed = report.checks.filter((c) => c.result === "PASS");
  const blocks = report.checks.map(renderCheckBlock);
  const summary = [
    `Result: ${failed.length === 0 ? "PASS" : "FAIL"}`,
    `Passed: ${passed.length}`,
    `Failed: ${failed.length}`,
  ].join("\n");
  return `${blocks.join("\n\n")}\n\n${summary}\n`;
}

/** Validates a report before it's written: every FAIL must carry at least
 *  one evidence entry, a RUNNER entry must be FAIL (never a false PASS),
 *  and nothing secret-shaped is present anywhere in run or checks. */
export function validateReport(report: PersonaReport): void {
  for (const check of report.checks) {
    if (check.result === "FAIL" && check.evidence.length === 0) {
      throw new Error(
        `Refusing to write report: check ${check.id} (${check.slug}) is FAIL but has no evidence.`,
      );
    }
    if (check.id === "RUNNER" && check.result !== "FAIL") {
      throw new Error(
        `Refusing to write report: a RUNNER entry must never be reported as PASS (check ${check.slug}).`,
      );
    }
  }
  assertNoSecretKeys(report.run, "run");
  assertNoSecretKeys(report.checks, "checks");
}

export interface WrittenReportPaths {
  runDir: string;
  runJsonPath: string;
  reportJsonPath: string;
  reportMdPath: string;
}

/** Atomically writes `run.json`, `report.json` and `report.md` into
 *  `.claude/qa-reports/<UTC>-<persona>/`. Validates first — nothing is
 *  written if validation fails. */
export async function writeReport(
  runDirName: string,
  report: PersonaReport,
): Promise<WrittenReportPaths> {
  validateReport(report);

  const runDir = resolveRunDir(runDirName);
  await mkdir(runDir, { recursive: true });
  await mkdir(path.join(runDir, "screenshots"), { recursive: true });
  await mkdir(path.join(runDir, "docker-logs"), { recursive: true });

  const runJsonPath = path.join(runDir, "run.json");
  const reportJsonPath = path.join(runDir, "report.json");
  const reportMdPath = path.join(runDir, "report.md");

  await writeFileAtomic(
    runJsonPath,
    `${JSON.stringify(report.run, null, 2)}\n`,
  );
  await writeFileAtomic(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFileAtomic(reportMdPath, renderReportMarkdown(report));

  return { runDir, runJsonPath, reportJsonPath, reportMdPath };
}

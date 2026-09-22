import { readdir } from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";

import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../setup/seed";
import {
  writeRunnerErrorFallback,
  writeScreenshotErrorEvidence,
} from "./report";
import type { CheckReport, CheckResult } from "./report";
import { PERSONA_VIEWPORT } from "./charters";

/** Guards against ever driving the user's own dev/live stack. Mirrors the
 *  architecture spec's hard rule (section 1 "Executor-Briefing", success
 *  criteria): the runner must refuse app/CDP port 3000/9222 and compose
 *  project "docker". */
export function assertIsolatedRunTarget(opts: {
  appOrigin: string;
  cdpEndpoint: string;
  composeProjectName: string;
}): void {
  const forbidden = [
    { label: "appOrigin", value: opts.appOrigin, bad: /:3000\b/ },
    { label: "cdpEndpoint", value: opts.cdpEndpoint, bad: /:9222\b/ },
  ];
  for (const { label, value, bad } of forbidden) {
    if (bad.test(value)) {
      throw new Error(
        `Refusing to run against ${label}="${value}": matches the user's dev/live stack's fixed port and is off-limits to agent QA.`,
      );
    }
  }
  if (opts.composeProjectName === "docker") {
    throw new Error(
      'Refusing to run against compose project "docker": that is the user\'s own dev/live project.',
    );
  }
  if (!opts.composeProjectName.startsWith("keepsake-qa-")) {
    throw new Error(
      `Refusing to run against compose project "${opts.composeProjectName}": must be prefixed "keepsake-qa-".`,
    );
  }
}

export interface PersonaSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  appOrigin: string;
}

/** Connects to the run's own isolated Chrome container over CDP, opens a
 *  fresh isolated context at the 1440×900 desktop viewport, and confirms
 *  the page actually lands on the manifested app origin (never a
 *  same-looking fallback). */
export async function connectPersonaSession(opts: {
  cdpEndpoint: string;
  appOrigin: string;
  composeProjectName: string;
}): Promise<PersonaSession> {
  assertIsolatedRunTarget(opts);

  const browser = await chromium.connectOverCDP(opts.cdpEndpoint);
  const context = await browser.newContext({ viewport: PERSONA_VIEWPORT });
  const page = await context.newPage();
  return { browser, context, page, appOrigin: opts.appOrigin };
}

/** Signs in as the seeded admin via the accessible Email/Password/"Sign In"
 *  form, then confirms the resulting dashboard URL is on the manifested
 *  app origin — not some other origin the browser happened to redirect
 *  to. */
export async function loginAsAdmin(session: PersonaSession): Promise<void> {
  const { page, appOrigin } = session;
  await page.goto(`${appOrigin}/dashboard/bookmarks`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), {
    timeout: 30000,
  });
  if (!page.url().startsWith(appOrigin)) {
    throw new Error(
      `Post-login URL "${page.url()}" is not on the manifested app origin "${appOrigin}".`,
    );
  }
}

export async function closePersonaSession(
  session: PersonaSession,
): Promise<void> {
  await session.context.close();
  await session.browser.close();
}

/** Counts DOM elements that would render a visible image/preview inside
 *  `rootSelector`'s subtree — used by the design-guardian's "no thumbnails
 *  anywhere" checks.
 *
 *  What counts: a raster/media element (`img`, `picture`, `video[poster]`)
 *  or an element whose computed `background-image` actually paints a
 *  *raster* image (`url(...)`), at a meaningful size. What deliberately does
 *  NOT count:
 *  - `linear-gradient(...)`/`radial-gradient(...)` backgrounds: that is
 *    decorative accent chrome (e.g. the RE-SUMMARISE button's accent
 *    gradient), not a preview. Counting them made the design-guardian
 *    report two phantom "visible media elements" on a bookmark detail that
 *    renders no image at all (observed 2026-09-10, checks 04/05).
 *  - icon-sized boxes (< 32px in either axis): favicons and inline glyph
 *    backgrounds are not previews.
 *  Elements with zero layout size are excluded too (a 0×0 sentinel isn't a
 *  "visible" preview). */
export async function countVisibleMedia(
  page: Page,
  rootSelector: string,
): Promise<number> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return -1;
    const MIN_PREVIEW_PX = 32;
    let visible = 0;
    for (const el of Array.from(root.querySelectorAll("*"))) {
      const tag = el.tagName;
      const isMediaElement =
        tag === "IMG" || tag === "PICTURE" || tag === "VIDEO";
      const backgroundImage = getComputedStyle(el).backgroundImage;
      const paintsRasterImage = backgroundImage.includes("url(");
      if (!isMediaElement && !paintsRasterImage) {
        continue;
      }
      if (tag === "VIDEO" && !el.hasAttribute("poster")) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < MIN_PREVIEW_PX || rect.height < MIN_PREVIEW_PX) {
        continue;
      }
      visible++;
    }
    return visible;
  }, rootSelector);
}

/** `getComputedStyle(el).boxShadow` for the first element matching
 *  `selector`, or `null` if no such element exists. */
export async function getBoxShadow(
  page: Page,
  selector: string,
): Promise<string | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).boxShadow : null;
  }, selector);
}

/** A CSS custom property's value as authored on `<html>` — not resolved
 *  through any element that consumes it, so it reads back the literal
 *  token text (e.g. `#0d0d0e`) rather than a browser-normalised color. */
export async function getRootCssVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

export interface ComputedFont {
  fontSize: string;
  fontWeight: string;
  letterSpacing: string;
}

export async function getComputedFont(
  page: Page,
  selector: string,
): Promise<ComputedFont | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
    };
  }, selector);
}

/** Saves a PASS-baseline screenshot at the report format's fixed path
 *  (`screenshots/NN-<slug>-pass.png`) and returns its path relative to the
 *  run directory, for use as a check's `evidence` entry. Only the design-
 *  guardian charter's explicitly-listed baselines call this — an ordinary
 *  passing check has no evidence entry. */
export async function saveBaselineScreenshot(
  page: Page,
  runDir: string,
  id: string,
  slug: string,
): Promise<string> {
  const relPath = path.join("screenshots", `${id}-${slug}-pass.png`);
  await page.screenshot({ path: path.join(runDir, relPath), fullPage: false });
  return relPath;
}

async function saveFailureScreenshot(
  page: Page,
  runDir: string,
  id: string,
  slug: string,
): Promise<string> {
  const relPath = path.join("screenshots", `${id}-${slug}-fail.png`);
  await page.screenshot({ path: path.join(runDir, relPath), fullPage: false });
  return relPath;
}

/** Runs one checklist item's assertion function in its own result wrapper:
 *  an assertion failure becomes a FAIL with a screenshot, and execution
 *  moves on to the next check rather than aborting the whole persona run
 *  (architecture spec, "Ablauf eines Persona-Laufs", step 6). `fn` returns
 *  the `observed` text for a PASS, or throws an `Error` whose `message` is
 *  used as the `observed` text for a FAIL. `fn` may also return
 *  `{ observed, baselineEvidence }` to attach a required PASS-baseline
 *  screenshot already taken inside `fn` (design-guardian only). */
export async function runCheck(
  page: Page,
  runDir: string,
  spec: {
    id: string;
    slug: string;
    title: string;
    reproduction: string;
    expected: string;
  },
  fn: () => Promise<string | { observed: string; baselineEvidence?: string[] }>,
): Promise<CheckReport> {
  try {
    const result = await fn();
    const observed = typeof result === "string" ? result : result.observed;
    const evidence =
      typeof result === "string" ? [] : (result.baselineEvidence ?? []);
    return {
      id: spec.id,
      slug: spec.slug,
      title: spec.title,
      result: "PASS" as CheckResult,
      reproduction: spec.reproduction,
      observed,
      expected: spec.expected,
      evidence,
    };
  } catch (error) {
    let evidence: string[] = [];
    try {
      evidence = [
        await saveFailureScreenshot(page, runDir, spec.id, spec.slug),
      ];
    } catch (screenshotError) {
      console.error(
        `Failed to capture failure screenshot for check ${spec.id} (${spec.slug}):`,
        screenshotError,
      );
      // The screenshot is the preferred evidence; when it itself fails
      // (e.g. a Chromium "Target crashed"), fall back to a minimal text
      // record so this FAIL still carries real evidence instead of
      // sinking the whole report (validateReport refuses a FAIL with no
      // evidence at all) and losing every other check's already-completed
      // result along with it.
      try {
        evidence = [
          await writeScreenshotErrorEvidence(
            runDir,
            spec.id,
            spec.slug,
            screenshotError,
          ),
        ];
      } catch (fallbackError) {
        console.error(
          `Failed to write fallback text evidence for check ${spec.id} (${spec.slug}):`,
          fallbackError,
        );
      }
    }
    const observed = error instanceof Error ? error.message : String(error);
    return {
      id: spec.id,
      slug: spec.slug,
      title: spec.title,
      result: "FAIL" as CheckResult,
      reproduction: spec.reproduction,
      observed,
      expected: spec.expected,
      evidence,
    };
  }
}

/** Screenshot-only evidence for a RUNNER report, captured (if at all
 *  possible) at the moment of failure — before stack teardown runs and
 *  the session's page closes underneath it. Returns `[]`, never throws,
 *  when no page exists yet (a stack-start/seed failure) or the capture
 *  itself fails. */
export async function saveRunnerFailureScreenshot(
  page: Page | null,
  runDir: string,
): Promise<string[]> {
  if (!page) return [];
  try {
    return [
      await saveFailureScreenshot(page, runDir, "RUNNER", "runner-failure"),
    ];
  } catch (screenshotError) {
    console.error(
      "Failed to capture RUNNER failure screenshot:",
      screenshotError,
    );
    return [];
  }
}

/** Relative (`docker-logs/<service>.log`) paths of whatever service logs
 *  `stopStack` actually captured for this run. Used as RUNNER evidence in
 *  place of a screenshot when a failure happens before any page ever
 *  existed — must only be called after the run's stack teardown has
 *  finished, since the log files don't exist before that. */
export async function listCapturedDockerLogs(
  runDir: string,
): Promise<string[]> {
  try {
    const dockerLogsDir = path.join(runDir, "docker-logs");
    const entries = await readdir(dockerLogsDir);
    return entries
      .filter((entry) => entry.endsWith(".log"))
      .map((entry) => path.join("docker-logs", entry));
  } catch {
    return [];
  }
}

/** A `RUNNER`-category technical failure (architecture spec, "Exaktes
 *  Reportformat"): something outside any specific checklist item broke —
 *  the stack never came up, seeding failed, or login itself failed. Never
 *  a PASS. Unlike an ordinary checklist FAIL, a screenshot isn't required:
 *  a RUNNER failure can happen before any page exists at all, so this
 *  takes whatever evidence the caller already gathered
 *  (`saveRunnerFailureScreenshot` and/or `listCapturedDockerLogs`) and,
 *  only if none of that survived, falls back to a minimal
 *  `runner-error.txt` (`./report`'s `writeRunnerErrorFallback`) so the
 *  report is never left with no evidence at all. */
export async function runnerFailure(
  runDir: string,
  reproduction: string,
  error: unknown,
  evidence: string[],
): Promise<CheckReport> {
  const finalEvidence =
    evidence.length > 0
      ? evidence
      : [await writeRunnerErrorFallback(runDir, error)];
  return {
    id: "RUNNER",
    slug: "runner-failure",
    title: "Technischer Runnerfehler",
    result: "FAIL",
    reproduction,
    observed: error instanceof Error ? error.message : String(error),
    expected: "Runner läuft ohne technischen Abbruch durch.",
    evidence: finalEvidence,
  };
}

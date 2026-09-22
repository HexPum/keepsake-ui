import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import {
  closePersonaSession,
  connectPersonaSession,
  loginAsAdmin,
} from "../../qa/browser";
import type { PersonaSession } from "../../qa/browser";
import { writeReport } from "../../qa/report";
import type { PersonaReport } from "../../qa/report";
import { ADMIN_EMAIL, seedPersonaData } from "../../setup/seed";
import type { PersonaSeed } from "../../setup/seed";
import { generateRunId } from "../../setup/startContainers";

/** Uses the compose stack the *normal* e2e vitest global setup already
 *  started (per the architecture spec's "Ohne einen zweiten Stack zu
 *  starten" instruction for this test file) — it does not call
 *  `startStack` itself. Persona bookmark/tag/list data isn't part of that
 *  global setup's contract (only the admin user/API key is), so this test
 *  seeds it once for itself in `beforeAll`. */
describe("QA persona infrastructure", () => {
  const karakeepPort = inject("karakeepPort");
  const chromeCdpPort = inject("chromeCdpPort");
  const minioPort = inject("minioPort");
  const minioConsolePort = inject("minioConsolePort");
  const composeProjectName = inject("composeProjectName");
  const browserBaseUrl = inject("browserBaseUrl");
  const adminApiKey = inject("adminApiKey");

  if (
    !karakeepPort ||
    !chromeCdpPort ||
    !minioPort ||
    !minioConsolePort ||
    !composeProjectName ||
    !browserBaseUrl ||
    !adminApiKey
  ) {
    throw new Error("Missing required provided context from global setup.");
  }

  let seed: PersonaSeed;
  let session: PersonaSession;

  beforeAll(async () => {
    seed = await seedPersonaData(adminApiKey, karakeepPort);
    session = await connectPersonaSession({
      cdpEndpoint: `http://127.0.0.1:${chromeCdpPort}`,
      appOrigin: browserBaseUrl,
      composeProjectName,
    });
  }, 180000);

  afterAll(async () => {
    if (session) {
      await closePersonaSession(session);
    }
  });

  it("reserves a unique keepsake-qa- compose project and dynamic loopback ports", () => {
    expect(composeProjectName).toMatch(/^keepsake-qa-/);
    expect(composeProjectName).not.toBe("docker");
    for (const port of [
      karakeepPort,
      chromeCdpPort,
      minioPort,
      minioConsolePort,
    ]) {
      expect(port).toBeGreaterThan(0);
      expect(port).not.toBe(3000);
      expect(port).not.toBe(9222);
    }
    expect(browserBaseUrl).toBe(`http://host.docker.internal:${karakeepPort}`);
  });

  it("exposes a reachable CDP endpoint on the reserved port", async () => {
    const response = await fetch(
      `http://127.0.0.1:${chromeCdpPort}/json/version`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { Browser?: string };
    expect(body.Browser).toBeDefined();
  });

  it("logs the seeded admin in via the accessible sign-in form", async () => {
    await loginAsAdmin(session);
    expect(session.page.url()).toContain(browserBaseUrl);
  });

  it("seeds all five unique-titled content types and the starting tags/list", async () => {
    expect(seed.articleBookmarkId).toBeTruthy();
    expect(seed.pdfBookmarkId).toBeTruthy();
    expect(seed.videoBookmarkId).toBeTruthy();
    expect(seed.noteBookmarkId).toBeTruthy();
    expect(seed.feedEntryBookmarkId).toBeTruthy();
    expect(seed.researchTagId).toBeTruthy();
    expect(seed.readingTagId).toBeTruthy();
    expect(seed.seedListId).toBeTruthy();
    expect(seed.totalBookmarkCount).toBeGreaterThanOrEqual(5);

    await session.page.goto(`${browserBaseUrl}/dashboard/bookmarks`, {
      waitUntil: "domcontentloaded",
    });
    for (const title of [
      "QA Article",
      "QA PDF",
      "QA Video",
      "QA Note",
      "QA Feed Entry",
    ]) {
      await session.page
        .getByRole("link", { name: title, exact: true })
        .first()
        .waitFor({ timeout: 15000 });
    }
    const metaText = await session.page
      .locator("p", { hasText: /item/ })
      .first()
      .innerText();
    expect(metaText.startsWith(`${seed.totalBookmarkCount} item`)).toBe(true);
  }, 60000);

  it("serializes a persona report to .claude/qa-reports/ without secrets", async () => {
    const runId = generateRunId();
    const runDirName = `${runId}-design-guardian`;
    const report: PersonaReport = {
      run: {
        personaId: "design-guardian",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        gitSha: "test-sha",
        composeProjectName,
        appOrigin: browserBaseUrl,
        cdpEndpoint: `http://127.0.0.1:${chromeCdpPort}`,
        viewport: { width: 1440, height: 900 },
        seedVersion: "qa-persona-v1",
      },
      checks: [
        {
          id: "01",
          slug: "infra-smoke",
          title: "Infrastructure smoke check",
          result: "PASS",
          reproduction:
            "Synthetic check written by persona-infrastructure.test.ts.",
          observed: `Logged in as ${ADMIN_EMAIL}.`,
          expected: "Report serializes cleanly.",
          evidence: [],
        },
      ],
    };
    const written = await writeReport(runDirName, report);
    expect(written.runDir).toContain(runDirName);
    const { readFile } = await import("fs/promises");
    const reportMd = await readFile(written.reportMdPath, "utf-8");
    expect(reportMd).toContain("Result: PASS");
    const runJson = await readFile(written.runJsonPath, "utf-8");
    expect(runJson.toLowerCase()).not.toContain("password");
    expect(runJson.toLowerCase()).not.toContain("cookie");
  });
});

import { mkdir, readdir, readFile } from "fs/promises";
import path from "path";
import type { Page } from "playwright";
import { describe, expect, it } from "vitest";

import { generateRunId } from "../setup/startContainers";
import { runCheck } from "./browser";
import {
  renderReportMarkdown,
  resolveRunDir,
  validateReport,
  writeReport,
} from "./report";
import type { CheckReport, PersonaReport, RunManifest } from "./report";

function makeRun(overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    personaId: "researcher",
    startedAt: "2026-08-30T00:00:00.000Z",
    finishedAt: "2026-08-30T00:01:00.000Z",
    gitSha: "deadbeef",
    composeProjectName: "keepsake-qa-test",
    appOrigin: "http://host.docker.internal:12345",
    cdpEndpoint: "http://127.0.0.1:23456",
    viewport: { width: 1440, height: 900 },
    seedVersion: "qa-persona-v1",
    ...overrides,
  };
}

function makeCheck(overrides: Partial<CheckReport> = {}): CheckReport {
  return {
    id: "04",
    slug: "article-detail-no-preview",
    title: "Artikel-Detail ohne Bildvorschau",
    result: "PASS",
    reproduction:
      'FILES → „QA Article" öffnen → initial sichtbaren Detailbereich und DOM prüfen.',
    observed:
      "Titel und Summary führen; 0 sichtbare Preview-Medien; box-shadow: none.",
    expected:
      "Keine Thumbnail-/Hero-/Screenshot-Vorschau; flache tokenbasierte Detailfläche.",
    evidence: [],
    ...overrides,
  };
}

describe("renderReportMarkdown", () => {
  it("renders the exact fixed block format with no free-form prose", () => {
    const report: PersonaReport = {
      run: makeRun(),
      checks: [
        makeCheck({ evidence: ["screenshots/04-article-detail-pass.png"] }),
      ],
    };
    const md = renderReportMarkdown(report);
    expect(md).toBe(
      [
        "### 04 — Artikel-Detail ohne Bildvorschau: PASS",
        'Reproduktion: FILES → „QA Article" öffnen → initial sichtbaren Detailbereich und DOM prüfen.',
        "Observed: Titel und Summary führen; 0 sichtbare Preview-Medien; box-shadow: none.",
        "Expected: Keine Thumbnail-/Hero-/Screenshot-Vorschau; flache tokenbasierte Detailfläche.",
        "Evidence: screenshots/04-article-detail-pass.png",
        "",
        "Result: PASS",
        "Passed: 1",
        "Failed: 0",
        "",
      ].join("\n"),
    );
  });

  it("summarises Result: FAIL as soon as any check fails, regardless of order", () => {
    const report: PersonaReport = {
      run: makeRun(),
      checks: [
        makeCheck({ id: "01", result: "PASS", evidence: [] }),
        makeCheck({
          id: "02",
          result: "FAIL",
          evidence: ["screenshots/02-x-fail.png"],
        }),
      ],
    };
    const md = renderReportMarkdown(report);
    expect(md).toContain("Result: FAIL");
    expect(md).toContain("Passed: 1");
    expect(md).toContain("Failed: 1");
  });

  it("prints 'none' evidence rather than an empty line for a PASS with no evidence", () => {
    const report: PersonaReport = {
      run: makeRun(),
      checks: [makeCheck({ evidence: [] })],
    };
    const md = renderReportMarkdown(report);
    expect(md).toContain("Evidence: none");
  });
});

describe("validateReport", () => {
  it("rejects a FAIL with no evidence", () => {
    const report: PersonaReport = {
      run: makeRun(),
      checks: [makeCheck({ result: "FAIL", evidence: [] })],
    };
    expect(() => validateReport(report)).toThrow(/no evidence/);
  });

  it("rejects a RUNNER entry reported as PASS", () => {
    const report: PersonaReport = {
      run: makeRun(),
      checks: [
        makeCheck({ id: "RUNNER", slug: "runner-failure", result: "PASS" }),
      ],
    };
    expect(() => validateReport(report)).toThrow(/RUNNER/);
  });

  it("accepts a RUNNER entry reported as FAIL with evidence", () => {
    const report: PersonaReport = {
      run: makeRun(),
      checks: [
        makeCheck({
          id: "RUNNER",
          slug: "runner-failure",
          result: "FAIL",
          evidence: ["screenshots/RUNNER-runner-failure-fail.png"],
        }),
      ],
    };
    expect(() => validateReport(report)).not.toThrow();
  });

  it("rejects a report whose run manifest carries a secret-shaped key", () => {
    const runWithSecret = {
      ...makeRun(),
      apiKey: "leaked-key",
    } as unknown as RunManifest;
    const report: PersonaReport = { run: runWithSecret, checks: [makeCheck()] };
    expect(() => validateReport(report)).toThrow(/secret/);
  });

  it("rejects a report whose check text embeds a cookie-shaped key", () => {
    const report: PersonaReport = {
      run: makeRun(),
      checks: [
        { ...makeCheck(), cookie: "session=abc" } as unknown as CheckReport,
      ],
    };
    expect(() => validateReport(report)).toThrow(/secret/);
  });
});

describe("resolveRunDir", () => {
  it("accepts a well-formed UTC-run-id + known persona directory name", () => {
    const name = `${generateRunId()}-researcher`;
    expect(() => resolveRunDir(name)).not.toThrow();
  });

  it("rejects an unknown persona id", () => {
    expect(() => resolveRunDir(`${generateRunId()}-not-a-persona`)).toThrow();
  });

  it("rejects path traversal attempts", () => {
    expect(() => resolveRunDir("../../etc-passwd-researcher")).toThrow();
    expect(() =>
      resolveRunDir("2026-08-30T00-00-00Z-researcher/../../../etc"),
    ).toThrow();
  });
});

describe("writeReport", () => {
  it("atomically writes run.json, report.json and report.md with no leftover temp files", async () => {
    const runDirName = `${generateRunId()}-list-reader`;
    const report: PersonaReport = {
      run: makeRun({ personaId: "list-reader" }),
      checks: [
        makeCheck({ id: "01", slug: "smoke", title: "Smoke", evidence: [] }),
      ],
    };
    const written = await writeReport(runDirName, report);

    const runJson = JSON.parse(await readFile(written.runJsonPath, "utf-8"));
    expect(runJson.personaId).toBe("list-reader");

    const reportJson = JSON.parse(
      await readFile(written.reportJsonPath, "utf-8"),
    );
    expect(reportJson.checks).toHaveLength(1);

    const reportMd = await readFile(written.reportMdPath, "utf-8");
    expect(reportMd).toContain("Result: PASS");

    const entries = await readdir(written.runDir);
    expect(entries.some((e) => e.includes(".tmp-"))).toBe(false);
    expect(entries).toEqual(
      expect.arrayContaining([
        "run.json",
        "report.json",
        "report.md",
        "screenshots",
        "docker-logs",
      ]),
    );

    const combined =
      `${runJson ? JSON.stringify(runJson) : ""}${JSON.stringify(reportJson)}`.toLowerCase();
    expect(combined).not.toContain("password");
    expect(combined).not.toContain("test1234");
    expect(path.isAbsolute(written.runDir)).toBe(true);
  });
});

describe("runCheck screenshot-failure fallback", () => {
  it("falls back to a text evidence file when a FAIL's own failure screenshot also fails (e.g. a Chromium 'Target crashed'), and the report still writes with every prior PASS intact", async () => {
    const runDirName = `${generateRunId()}-researcher`;
    const runDir = resolveRunDir(runDirName);
    await mkdir(path.join(runDir, "screenshots"), { recursive: true });

    // A fake Page whose screenshot() always rejects, standing in for a
    // Chromium GPU-process crash — runCheck must not throw here, and must
    // still return a valid FAIL with real evidence.
    const crashingPage = {
      screenshot: async () => {
        throw new Error("Target crashed");
      },
    } as unknown as Page;

    const spec = {
      id: "03",
      slug: "add-note",
      title: "Add bookmark legt neue Textnotiz an",
      reproduction:
        "Add bookmark öffnen → Freitext ohne URL eingeben → speichern.",
      expected: "Notiz erscheint ohne Thumbnail/Bildvorschau.",
    };

    const failedCheck = await runCheck(crashingPage, runDir, spec, async () => {
      throw new Error("FILES counter did not increment after adding the note.");
    });

    expect(failedCheck.result).toBe("FAIL");
    expect(failedCheck.evidence).toHaveLength(1);
    expect(failedCheck.evidence[0]).toMatch(
      /^screenshots[\\/].*-screenshot-error\.txt$/,
    );

    const evidenceContent = await readFile(
      path.join(runDir, failedCheck.evidence[0]),
      "utf-8",
    );
    expect(evidenceContent).toContain("Screenshot-Fehler: Target crashed");
    expect(evidenceContent).toMatch(
      /Zeitstempel: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    // Minimal content only — never page content, cookies, tokens, headers,
    // or environment values.
    expect(evidenceContent.toLowerCase()).not.toContain("cookie");
    expect(evidenceContent.toLowerCase()).not.toContain("authorization");

    const priorPass = makeCheck({
      id: "01",
      slug: "files-seed-total",
      title: "FILES zeigt Seed-Gesamtstand und alle fünf Inhaltstypen",
      result: "PASS",
      evidence: [],
    });
    const report: PersonaReport = {
      run: makeRun(),
      checks: [priorPass, failedCheck],
    };

    // The whole point of the fallback: validateReport must accept this
    // (real evidence, not empty) and writeReport must persist both the
    // earlier PASS and this FAIL — neither is lost to the screenshot
    // crash.
    expect(() => validateReport(report)).not.toThrow();
    const written = await writeReport(runDirName, report);

    const reportJson = JSON.parse(
      await readFile(written.reportJsonPath, "utf-8"),
    );
    expect(reportJson.checks).toHaveLength(2);
    expect(reportJson.checks[0].result).toBe("PASS");
    expect(reportJson.checks[1].result).toBe("FAIL");

    const reportMd = await readFile(written.reportMdPath, "utf-8");
    expect(reportMd).toContain("Result: FAIL");
    expect(reportMd).toContain(
      "### 01 — FILES zeigt Seed-Gesamtstand und alle fünf Inhaltstypen: PASS",
    );
    expect(reportMd).toContain(
      "### 03 — Add bookmark legt neue Textnotiz an: FAIL",
    );
  });
});

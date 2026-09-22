import { execSync } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { seedAdmin, seedPersonaData } from "../setup/seed";
import type { PersonaSeed } from "../setup/seed";
import { generateRunId, startStack, stopStack } from "../setup/startContainers";
import type { StackHandle } from "../setup/startContainers";
import {
  closePersonaSession,
  connectPersonaSession,
  listCapturedDockerLogs,
  loginAsAdmin,
  runnerFailure,
  saveRunnerFailureScreenshot,
} from "./browser";
import type { PersonaSession } from "./browser";
import { CHARTERS, PERSONA_VIEWPORT } from "./charters";
import type { PersonaId } from "./charters";
import * as designGuardian from "./personas/design-guardian";
import * as listReader from "./personas/list-reader";
import * as researcher from "./personas/researcher";
import { resolveRunDir, writeReport } from "./report";
import type { CheckReport, PersonaReport } from "./report";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

type PersonaRunner = (
  session: PersonaSession,
  runDir: string,
  seed: PersonaSeed,
  apiKey: string,
  karakeepPort: number,
) => Promise<CheckReport[]>;

const RUNNERS: Record<PersonaId, PersonaRunner> = {
  researcher: researcher.run,
  "list-reader": listReader.run,
  "design-guardian": designGuardian.run,
};

const SEED_VERSION = "qa-persona-v1";

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

function usage(): string {
  return "Usage: qa:persona -- <researcher|list-reader|design-guardian|all>";
}

async function runOnePersona(personaId: PersonaId): Promise<boolean> {
  const runId = generateRunId();
  const composeProjectName = `keepsake-qa-${runId.toLowerCase()}`;
  const runDirName = `${runId}-${personaId}`;
  const runDir = resolveRunDir(runDirName);
  await mkdir(path.join(runDir, "screenshots"), { recursive: true });
  await mkdir(path.join(runDir, "docker-logs"), { recursive: true });

  const startedAt = new Date().toISOString();
  let handle: StackHandle | undefined;
  let session: PersonaSession | undefined;
  let stopped = false;

  const cleanup = async () => {
    if (stopped) return;
    stopped = true;
    if (session) {
      try {
        await closePersonaSession(session);
      } catch (error) {
        console.error("Failed to close browser session:", error);
      }
    }
    if (handle) {
      try {
        await stopStack(handle, path.join(runDir, "docker-logs"));
      } catch (error) {
        console.error("Failed to stop compose stack:", error);
      }
    }
  };

  const onSignal = (signal: NodeJS.Signals) => {
    console.log(`Received ${signal}, cleaning up run ${runDirName}...`);
    cleanup()
      .then(() => process.exit(signal === "SIGINT" ? 130 : 143))
      .catch((error) => {
        console.error("Cleanup after signal failed:", error);
        process.exit(1);
      });
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  let checks: CheckReport[] = [];
  // Set only for a RUNNER-category failure — never for an ordinary
  // checklist FAIL, which `RUNNERS[personaId]` already reports itself.
  // The final CheckReport for it isn't built until *after* `cleanup()`
  // below: Docker logs for this run don't exist on disk until `stopStack`
  // has captured them, and a RUNNER report should cite them as evidence
  // whenever no page/screenshot is available. Any screenshot IS captured
  // here, eagerly — before cleanup closes the page out from under it.
  let runnerErr:
    | { reproduction: string; error: unknown; screenshotEvidence: string[] }
    | undefined;
  try {
    handle = await startStack(
      composeProjectName,
      path.join(runDir, "docker-logs"),
    );
    process.env.KARAKEEP_PORT = handle.karakeepPort.toString();

    const { apiKey } = await seedAdmin();
    const seed = await seedPersonaData(apiKey, handle.karakeepPort);

    session = await connectPersonaSession({
      cdpEndpoint: `http://127.0.0.1:${handle.chromeCdpPort}`,
      appOrigin: handle.browserBaseUrl,
      composeProjectName,
    });

    try {
      await loginAsAdmin(session);
    } catch (error) {
      runnerErr = {
        reproduction: "Admin-Login über die Sign-In-Form.",
        error,
        screenshotEvidence: await saveRunnerFailureScreenshot(
          session.page,
          runDir,
        ),
      };
      throw error;
    }

    checks = await RUNNERS[personaId](
      session,
      runDir,
      seed,
      apiKey,
      handle.karakeepPort,
    );
  } catch (error) {
    if (checks.length === 0 && !runnerErr) {
      runnerErr = {
        reproduction: `Persona-Lauf "${personaId}" (Stack-Start/Seed/Login).`,
        error,
        screenshotEvidence: await saveRunnerFailureScreenshot(
          session?.page ?? null,
          runDir,
        ),
      };
    }
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await cleanup();
  }

  if (checks.length === 0 && runnerErr) {
    const dockerLogEvidence = await listCapturedDockerLogs(runDir);
    checks = [
      await runnerFailure(runDir, runnerErr.reproduction, runnerErr.error, [
        ...runnerErr.screenshotEvidence,
        ...dockerLogEvidence,
      ]),
    ];
  }

  const finishedAt = new Date().toISOString();
  const report: PersonaReport = {
    run: {
      personaId,
      startedAt,
      finishedAt,
      gitSha: gitSha(),
      composeProjectName,
      appOrigin: handle?.browserBaseUrl ?? "unknown",
      cdpEndpoint: handle
        ? `http://127.0.0.1:${handle.chromeCdpPort}`
        : "unknown",
      viewport: PERSONA_VIEWPORT,
      seedVersion: SEED_VERSION,
    },
    checks,
  };

  const written = await writeReport(runDirName, report);
  const failed = checks.filter((c) => c.result === "FAIL").length;
  const passed = checks.length - failed;
  console.log(
    `[${personaId}] Result: ${failed === 0 ? "PASS" : "FAIL"} — Passed: ${passed}, Failed: ${failed}`,
  );
  console.log(`[${personaId}] Report: ${written.reportMdPath}`);

  return failed === 0;
}

async function main() {
  const cliArgs = process.argv.slice(2);
  const arg = cliArgs[0] === "--" ? cliArgs[1] : cliArgs[0];
  const validIds: (PersonaId | "all")[] = [
    "researcher",
    "list-reader",
    "design-guardian",
    "all",
  ];
  if (!arg || !validIds.includes(arg as PersonaId | "all")) {
    console.error(usage());
    process.exit(2);
  }

  const personaIds: PersonaId[] =
    arg === "all" ? (Object.keys(CHARTERS) as PersonaId[]) : [arg as PersonaId];

  let allPassed = true;
  for (const personaId of personaIds) {
    const passed = await runOnePersona(personaId);
    allPassed = allPassed && passed;
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error in qa:persona runner:", error);
  process.exit(1);
});

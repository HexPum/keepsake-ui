import { execFile, execSync } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import type { GlobalSetupContext } from "vitest/node";

import { waitUntil } from "../utils/general";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPOSE_CWD = __dirname;

export interface StackPorts {
  karakeepPort: number;
  aimockPort: number;
  meiliPort: number;
  chromeCdpPort: number;
  minioPort: number;
  minioConsolePort: number;
}

export interface StackHandle extends StackPorts {
  composeProjectName: string;
  /** Origin the Chrome container (and only the Chrome container) resolves
   *  back to the host-published web port through `host.docker.internal`.
   *  Never `localhost:3000` or a Dev-stack fallback. */
  browserBaseUrl: string;
}

/** Env block every `docker compose` invocation for this stack must share —
 *  the project name and all reserved ports, so `up`, `logs`, `ps` and
 *  `down` all address the exact same run. */
function composeEnv(ports: StackPorts, composeProjectName: string) {
  return {
    ...process.env,
    COMPOSE_PROJECT_NAME: composeProjectName,
    KARAKEEP_PORT: ports.karakeepPort.toString(),
    AIMOCK_PORT: ports.aimockPort.toString(),
    MEILI_PORT: ports.meiliPort.toString(),
    CHROME_CDP_PORT: ports.chromeCdpPort.toString(),
    MINIO_PORT: ports.minioPort.toString(),
    MINIO_CONSOLE_PORT: ports.minioConsolePort.toString(),
  };
}

async function getRandomPort(): Promise<number> {
  const server = net.createServer();
  return new Promise<number>((resolve, reject) => {
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

async function reservePorts(): Promise<StackPorts> {
  const [
    karakeepPort,
    aimockPort,
    meiliPort,
    chromeCdpPort,
    minioPort,
    minioConsolePort,
  ] = await Promise.all([
    getRandomPort(),
    getRandomPort(),
    getRandomPort(),
    getRandomPort(),
    getRandomPort(),
    getRandomPort(),
  ]);
  return {
    karakeepPort,
    aimockPort,
    meiliPort,
    chromeCdpPort,
    minioPort,
    minioConsolePort,
  };
}

function randomSuffix(length = 6): string {
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join("");
}

/** UTC run id with millisecond resolution plus a short process-id + random
 *  suffix, e.g. `2026-08-30T14-05-22-123Z-53214-a1b2c3` — used both as the
 *  report directory suffix and, prefixed, as the compose project name.
 *  Whole-second resolution alone let two runs started in the same second
 *  race to the same project name / report directory; the millisecond +
 *  suffix tail makes that collision practically impossible. */
export function generateRunId(date = new Date()): string {
  const iso = date.toISOString().replace(/:/g, "-").replace(/\./g, "-");
  return `${iso}-${process.pid}-${randomSuffix()}`;
}

async function waitForHealthy(port: number, timeout = 60000): Promise<void> {
  return waitUntil(
    async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      return response.status === 200;
    },
    "Container are healthy",
    timeout,
  );
}

async function waitForAimockHealthy(
  port: number,
  timeout = 60000,
): Promise<void> {
  return waitUntil(
    async () => {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return response.status === 200;
    },
    "Aimock is healthy",
    timeout,
  );
}

async function waitForCdp(port: number, timeout = 60000): Promise<void> {
  return waitUntil(
    async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      return response.status === 200;
    },
    "Chrome CDP is reachable",
    timeout,
  );
}

/** Saves each service's `docker compose logs` output via Node's `writeFile`
 *  rather than a shell `>` redirection, so a shell-metacharacter-hostile
 *  log line can never corrupt the capture command itself. Best-effort per
 *  service: one service's capture failing doesn't stop the others. */
async function captureDockerLogs(
  env: NodeJS.ProcessEnv,
  logsDir: string,
): Promise<void> {
  await mkdir(logsDir, { recursive: true });

  const services = ["web", "meilisearch", "chrome", "nginx", "minio", "aimock"];
  for (const service of services) {
    try {
      const { stdout, stderr } = await execFileAsync(
        "docker",
        ["compose", "logs", service],
        { cwd: COMPOSE_CWD, env, maxBuffer: 1024 * 1024 * 50 },
      );
      await writeFile(
        path.join(logsDir, `${service}.log`),
        stdout + stderr,
        "utf-8",
      );
      console.log(`Captured logs for ${service}`);
    } catch (error) {
      console.error(`Failed to capture logs for ${service}:`, error);
    }
  }
}

/** Keyed by compose project name so a stack's teardown (log capture +
 *  `docker compose down`) runs at most once no matter how many call sites
 *  race to clean it up (a `finally` block and a signal handler, or a
 *  failed `up` and that same `finally`) — every caller gets back the same
 *  in-flight/settled promise instead of a second process each running its
 *  own `down`. */
const cleanupPromises = new Map<string, Promise<void>>();

function cleanupStack(handle: StackHandle, logsDir: string): Promise<void> {
  const existing = cleanupPromises.get(handle.composeProjectName);
  if (existing) return existing;

  const env = composeEnv(handle, handle.composeProjectName);
  const promise = (async () => {
    console.log(`Capturing docker logs for ${handle.composeProjectName}...`);
    try {
      await captureDockerLogs(env, logsDir);
    } catch (error) {
      console.error("Failed to capture docker logs:", error);
    }

    console.log(
      `Stopping docker compose project ${handle.composeProjectName}...`,
    );
    execSync("docker compose down --volumes --remove-orphans", {
      cwd: COMPOSE_CWD,
      stdio: "inherit",
      env,
    });
  })();
  cleanupPromises.set(handle.composeProjectName, promise);
  return promise;
}

/** Starts an isolated compose stack under its own project name and
 *  dynamic, loopback-bound ports. Never touches the user's dev stack
 *  (project `docker`, `docker-web-1`, host port 3000/9222).
 *
 *  The stack handle (ports + env) is built before `docker compose up` runs
 *  at all, so a failure in `up` or the post-up healthchecks has an exact
 *  handle to hand to `cleanupStack`: logs are captured best-effort and
 *  *this* project alone is torn down (`down --volumes --remove-orphans`)
 *  before the original error is re-thrown — never left running, and never
 *  reaching for another run's project by accident. */
export async function startStack(
  composeProjectName: string,
  logsDir: string,
): Promise<StackHandle> {
  if (
    composeProjectName === "docker" ||
    !composeProjectName.startsWith("keepsake-qa-")
  ) {
    throw new Error(
      `Refusing to start stack under compose project "${composeProjectName}": ` +
        `must be prefixed "keepsake-qa-" and must never be "docker" (the user's dev/live project).`,
    );
  }

  const ports = await reservePorts();
  const env = composeEnv(ports, composeProjectName);
  const handle: StackHandle = {
    ...ports,
    composeProjectName,
    browserBaseUrl: `http://host.docker.internal:${ports.karakeepPort}`,
  };
  const buildArg = process.env.E2E_TEST_NO_BUILD ? "" : "--build";

  try {
    console.log(
      `Starting docker compose project ${composeProjectName} on ports ` +
        `karakeep=${ports.karakeepPort} aimock=${ports.aimockPort} meili=${ports.meiliPort} ` +
        `cdp=${ports.chromeCdpPort} minio=${ports.minioPort}/${ports.minioConsolePort}...`,
    );
    execSync(`docker compose up ${buildArg} -d`, {
      cwd: COMPOSE_CWD,
      stdio: "inherit",
      env,
    });

    console.log("Waiting for services to become healthy...");
    await Promise.all([
      waitForHealthy(ports.karakeepPort),
      waitForAimockHealthy(ports.aimockPort),
      waitForCdp(ports.chromeCdpPort),
    ]);

    // Wait 5 seconds for the worker to start.
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (error) {
    await cleanupStack(handle, logsDir).catch((cleanupError) => {
      console.error(
        `Failed to clean up ${composeProjectName} after a failed start:`,
        cleanupError,
      );
    });
    throw error;
  }

  return handle;
}

/** Idempotent: safe to call more than once (e.g. once from a `finally`
 *  block and again from a signal handler racing it) — both calls share
 *  the one cleanup promise tracked per compose project in
 *  `cleanupPromises`. */
export function stopStack(handle: StackHandle, logsDir: string): Promise<void> {
  return cleanupStack(handle, logsDir);
}

export default async function ({ provide }: GlobalSetupContext) {
  const runId = generateRunId();
  const composeProjectName = `keepsake-qa-${runId.toLowerCase()}`;
  const logsDir = path.join(__dirname, "docker-logs");
  const handle = await startStack(composeProjectName, logsDir);

  provide("karakeepPort", handle.karakeepPort);
  provide("aimockPort", handle.aimockPort);
  provide("meiliPort", handle.meiliPort);
  provide("chromeCdpPort", handle.chromeCdpPort);
  provide("minioPort", handle.minioPort);
  provide("minioConsolePort", handle.minioConsolePort);
  provide("composeProjectName", handle.composeProjectName);
  provide("browserBaseUrl", handle.browserBaseUrl);

  process.env.KARAKEEP_PORT = handle.karakeepPort.toString();
  process.env.AIMOCK_PORT = handle.aimockPort.toString();
  process.env.MEILI_PORT = handle.meiliPort.toString();

  return async () => {
    await stopStack(handle, logsDir);
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    karakeepPort: number;
    aimockPort: number;
    meiliPort: number;
    chromeCdpPort: number;
    minioPort: number;
    minioConsolePort: number;
    composeProjectName: string;
    browserBaseUrl: string;
  }
}

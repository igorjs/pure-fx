/**
 * test-ci.mjs - Run the full CI test matrix locally.
 *
 * 1. Native tests: Node 22/24/25 (via fnm) + Deno + Bun
 * 2. Docker containers: 4 distros x 3 runtimes (11 containers, parallel)
 *
 * Output is quiet locally, verbose in CI or with --verbose.
 *
 * Usage:
 *   node scripts/test-ci.mjs              # full matrix
 *   node scripts/test-ci.mjs --native     # native only (skip Docker)
 *   node scripts/test-ci.mjs --docker     # Docker only (skip native)
 */

import { execFileSync, execSync, spawn } from "node:child_process";

const log = (msg) => process.stdout.write(`${msg}\n`);

const hasCommand = (cmd) => {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

const args = process.argv.slice(2);
const runNative = !args.includes("--docker");
const runDocker = !args.includes("--native");

const COMPOSE_FILE = "docker-compose.test.yml";
const COMPOSE_PROJECT = "pure-fx-test";
const NODE_VERSIONS = ["22", "24", "25"];

let failed = false;
const dockerErrors = [];

const cleanup = () => {
  if (runDocker && hasCommand("docker")) {
    log("\nCleaning up Docker resources...");
    try {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} down --rmi local --volumes --remove-orphans`,
        { stdio: "pipe" },
      );
    } catch {
      // best-effort cleanup
    }
  }
};

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

// -- Native tests -------------------------------------------------------------

if (runNative) {
  process.stdout.write("lint + check + build ... ");
  try {
    execSync("pnpm run lint && pnpm run check && pnpm run build", { stdio: "pipe" });
    log("OK");
  } catch (e) {
    log("FAIL");
    log(String(e.stderr || e.stdout || e.message));
    process.exit(1);
  }

  const hasFnm = hasCommand("fnm");

  // Run Node tests for each version
  for (const nodeVersion of NODE_VERSIONS) {
    try {
      if (hasFnm) {
        execSync(`fnm install ${nodeVersion} 2>/dev/null; fnm exec --using ${nodeVersion} node scripts/test-matrix.mjs --runtime node`, {
          stdio: "inherit",
          shell: true,
        });
      } else if (nodeVersion === process.versions.node.split(".")[0]) {
        execSync("node scripts/test-matrix.mjs --runtime node", { stdio: "inherit" });
      } else {
        log(`  node ${nodeVersion} ... SKIP (fnm not available)`);
      }
    } catch {
      failed = true;
    }
  }

  // Run Deno, Bun, browser, workers once
  for (const runtime of ["deno", "bun", "browser", "workers"]) {
    try {
      execSync(`node scripts/test-matrix.mjs --runtime ${runtime}`, { stdio: "inherit" });
    } catch {
      failed = true;
    }
  }
}

// -- Docker matrix (parallel) ------------------------------------------------

if (runDocker) {
  if (!hasCommand("docker")) {
    log("\nWARN: Docker not available, skipping container tests.");
  } else {
    log("\n── Docker ──");

    // Ensure dist/ exists for Deno containers (they COPY it from build context)
    try {
      const { statSync } = await import("node:fs");
      statSync("./dist/index.js");
    } catch {
      process.stdout.write("  building dist/ ... ");
      try {
        execSync("pnpm run build", { stdio: "pipe" });
        log("OK");
      } catch (e) {
        log("FAIL");
        log(String(e.stderr || e.stdout || e.message));
        process.exit(1);
      }
    }

    // Build all images (parallel by default with BuildKit)
    process.stdout.write("  building images ... ");
    try {
      execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} build`,
        { stdio: "pipe" },
      );
      log("OK");
    } catch (e) {
      log("FAIL");
      const output = String(e.stderr || e.stdout || e.message);
      log(output.split("\n").slice(-10).join("\n"));
      failed = true;
    }

    if (!failed) {
      // Discover services and run all in parallel
      const services = execSync(
        `docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} config --services`,
        { encoding: "utf-8", stdio: "pipe" },
      ).trim().split("\n");

      log(`  running ${services.length} containers in parallel...`);

      const runService = (service) => new Promise((resolve) => {
        const child = spawn("docker", [
          "compose", "-p", COMPOSE_PROJECT, "-f", COMPOSE_FILE,
          "run", "--rm", service,
        ], { stdio: "pipe" });
        let output = "";
        child.stdout.on("data", (d) => { output += d; });
        child.stderr.on("data", (d) => { output += d; });
        child.on("close", (code) => resolve({ service, ok: code === 0, output }));
      });

      const results = await Promise.all(services.map(runService));

      for (const r of results.sort((a, b) => a.service.localeCompare(b.service))) {
        log(`  ${r.service} ... ${r.ok ? "PASS" : "FAIL"}`);
        if (!r.ok) {
          dockerErrors.push({ service: r.service, output: r.output });
          failed = true;
        }
      }
    }
  }
}

// -- Final result -------------------------------------------------------------

if (dockerErrors.length > 0) {
  log("\n── DOCKER ERRORS ──");
  for (const err of dockerErrors) {
    log(`\n✗ ${err.service}:`);
    const lines = err.output.split("\n").slice(-20);
    log(lines.join("\n"));
  }
}

log("");
if (failed) {
  log("RESULT: SOME TESTS FAILED");
  process.exit(1);
} else {
  log("RESULT: ALL TESTS PASSED");
}

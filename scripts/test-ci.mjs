/**
 * test-ci.mjs - Run the full CI test matrix locally.
 *
 * 1. Native tests: Node 22/24/25 (via fnm) + Deno + Bun
 * 2. Docker containers: Ubuntu, Fedora, Arch, Alpine
 *
 * Usage:
 *   node scripts/test-ci.mjs              # full matrix
 *   node scripts/test-ci.mjs --native     # native only (skip Docker)
 *   node scripts/test-ci.mjs --docker     # Docker only (skip native)
 */

import { execFileSync, execSync } from "node:child_process";

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
let runNative = !args.includes("--docker");
let runDocker = !args.includes("--native");

const COMPOSE_FILE = "docker-compose.test.yml";
const COMPOSE_PROJECT = "pure-fx-test";
const NODE_VERSIONS = ["22", "24", "25"];
const DISTROS = ["ubuntu", "fedora", "arch", "alpine"];

let failed = false;

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

const banner = (title) => {
  log(`\n┌${"─".repeat(38)}┐`);
  log(`│${title.padStart(19 + Math.ceil(title.length / 2)).padEnd(38)}│`);
  log(`└${"─".repeat(38)}┘`);
};

// -- Native tests -------------------------------------------------------------

if (runNative) {
  // Lint + type-check + build once
  banner("NATIVE: lint + build");
  try {
    execSync("pnpm run lint && pnpm run check && pnpm run build", { stdio: "inherit" });
  } catch {
    log("Native lint/check/build failed.");
    process.exit(1);
  }

  // Run test matrix for each Node version via fnm
  const hasFnm = hasCommand("fnm");

  for (const nodeVersion of NODE_VERSIONS) {
    banner(`NATIVE: node ${nodeVersion}`);
    try {
      if (hasFnm) {
        execSync(`fnm install ${nodeVersion} 2>/dev/null; fnm exec --using ${nodeVersion} node scripts/test-matrix.mjs`, {
          stdio: "inherit",
          shell: true,
        });
      } else if (nodeVersion === process.versions.node.split(".")[0]) {
        execSync("node scripts/test-matrix.mjs", { stdio: "inherit" });
      } else {
        log(`SKIP: fnm not available, cannot test node ${nodeVersion}`);
      }
    } catch {
      log(`FAIL: node ${nodeVersion}`);
      failed = true;
    }
  }

  // Deno + Bun run from the default Node's test-matrix
  // (already covered if fnm ran the current version, but we need Deno/Bun explicitly
  // if fnm switched away from current node for the last run)
}

// -- Docker matrix ------------------------------------------------------------

if (runDocker) {
  if (!hasCommand("docker")) {
    log("\nWARN: Docker not available, skipping container tests.");
  } else {
    for (const distro of DISTROS) {
      banner(`DOCKER: ${distro}`);
      try {
        execSync(
          `docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} run --rm --build ${distro}`,
          { stdio: "inherit" },
        );
        log(`✓ ${distro} passed`);
      } catch {
        log(`✗ ${distro} FAILED`);
        failed = true;
      }
    }
  }
}

// -- Final result -------------------------------------------------------------

log("");
if (failed) {
  log("RESULT: SOME TESTS FAILED");
  process.exit(1);
} else {
  log("RESULT: ALL TESTS PASSED");
}

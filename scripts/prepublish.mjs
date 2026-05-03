/**
 * prepublish.mjs - Pre-publish gate.
 *
 * Runs lint, type-check, build, unit tests, and type tests.
 * Aborts publish if any step fails.
 *
 * Run by: `pnpm publish` (via prepublishOnly lifecycle hook)
 */

import { execSync } from "node:child_process";

const log = (msg) => process.stdout.write(`${msg}\n`);

const steps = [
  { name: "Lint", cmd: "pnpm run lint" },
  { name: "Type-check", cmd: "pnpm run check" },
  { name: "Build", cmd: "pnpm run build" },
  { name: "Unit tests", cmd: "pnpm test" },
  { name: "Type tests", cmd: "pnpm run test:types" },
];

for (const step of steps) {
  log(`\n── ${step.name} ──`);
  try {
    execSync(step.cmd, { stdio: "inherit" });
  } catch {
    process.stderr.write(`\nPublish aborted: ${step.name} failed.\n`);
    process.exit(1);
  }
}

log("\nAll pre-publish checks passed.");

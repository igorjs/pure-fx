/**
 * test-matrix.mjs - Run full test suite across all available runtimes.
 * Used inside Docker containers and natively on macOS.
 *
 * Usage:
 *   node scripts/test-matrix.mjs
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

const getVersion = (cmd, args = ["-v"]) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf-8", stdio: "pipe" }).trim().split("\n")[0];
  } catch {
    return cmd;
  }
};

const results = [];
let pass = 0;
let fail = 0;
let skip = 0;

const runTest = (name, cmd, args) => {
  log(`\n══════ ${name} ══════`);
  try {
    execFileSync(cmd, args, { stdio: "inherit" });
    results.push(`PASS  ${name}`);
    pass++;
  } catch {
    results.push(`FAIL  ${name}`);
    fail++;
  }
};

const runPnpm = (name, scriptArgs) => {
  log(`\n══════ ${name} ══════`);
  try {
    execSync(`pnpm ${scriptArgs}`, { stdio: "inherit" });
    results.push(`PASS  ${name}`);
    pass++;
  } catch {
    results.push(`FAIL  ${name}`);
    fail++;
  }
};

const skipTest = (name, reason) => {
  results.push(`SKIP  ${name} (${reason})`);
  skip++;
};

// -- Node.js ------------------------------------------------------------------

if (hasCommand("node")) {
  const v = getVersion("node");
  runPnpm(`node ${v} / unit tests`, "test");
  runPnpm(`node ${v} / type tests`, "run test:types");
  runTest(`node ${v} / bundle size`, "node", ["tests/bundle-size.mjs"]);
  runTest(`node ${v} / integration-runtime`, "node", ["tests/integration-runtime.mjs"]);
  runTest(`node ${v} / integration-web`, "node", ["tests/integration-web.mjs"]);
} else {
  skipTest("node", "not installed");
}

// -- Deno ---------------------------------------------------------------------

if (hasCommand("deno")) {
  const v = getVersion("deno");
  runTest(`${v} / integration-runtime`, "deno", ["run", "--allow-all", "tests/integration-runtime.mjs"]);
  runTest(`${v} / integration-web`, "deno", ["run", "--allow-all", "tests/integration-web.mjs"]);
} else {
  skipTest("deno", "not installed");
}

// -- Bun ----------------------------------------------------------------------

if (hasCommand("bun")) {
  const v = `bun ${getVersion("bun")}`;
  runTest(`${v} / integration-runtime`, "bun", ["tests/integration-runtime.mjs"]);
  runTest(`${v} / integration-web`, "bun", ["tests/integration-web.mjs"]);
} else {
  skipTest("bun", "not installed");
}

// -- Summary ------------------------------------------------------------------

const W = 38;
const pad = (s) => s.padEnd(W - 4);

log(`\n${"╔" + "═".repeat(W) + "╗"}`);
log(`║${" ".repeat(5)}TEST MATRIX RESULTS${" ".repeat(W - 24)}║`);
log(`${"╠" + "═".repeat(W) + "╣"}`);
for (const r of results) {
  log(`║  ${pad(r)} ║`);
}
log(`${"╠" + "═".repeat(W) + "╣"}`);
log(`║  ${pad(`PASS: ${pass}  FAIL: ${fail}  SKIP: ${skip}`)} ║`);
log(`${"╚" + "═".repeat(W) + "╝"}`);

if (fail > 0) {
  process.exit(1);
}

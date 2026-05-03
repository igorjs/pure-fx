/**
 * test-matrix.mjs - Run full test suite across all available runtimes.
 * Used inside Docker containers and natively on macOS.
 *
 * Captures output and only shows errors. Prints a summary table at the end.
 *
 * Usage:
 *   node scripts/test-matrix.mjs
 */

import { execFileSync, execSync } from "node:child_process";

const argv = process.argv.slice(2);
const verbose = argv.includes("--verbose") || !!process.env.CI;
const runtimeIdx = argv.indexOf("--runtime");
const runtimeFilter = runtimeIdx !== -1 ? argv[runtimeIdx + 1] : null;
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
const errors = [];
let pass = 0;
let fail = 0;
let skip = 0;

const runTest = (name, cmd, args) => {
  if (verbose) log(`\n══════ ${name} ══════`);
  else process.stdout.write(`  ${name} ... `);
  try {
    execFileSync(cmd, args, verbose ? { stdio: "inherit" } : { stdio: "pipe", encoding: "utf-8" });
    if (!verbose) log("PASS");
    results.push(`PASS  ${name}`);
    pass++;
  } catch (e) {
    if (!verbose) log("FAIL");
    results.push(`FAIL  ${name}`);
    errors.push({ name, output: e.stderr || e.stdout || e.message });
    fail++;
  }
};

const runPnpm = (name, scriptArgs) => {
  if (verbose) log(`\n══════ ${name} ══════`);
  else process.stdout.write(`  ${name} ... `);
  try {
    execSync(`pnpm ${scriptArgs}`, verbose ? { stdio: "inherit" } : { stdio: "pipe", encoding: "utf-8" });
    if (!verbose) log("PASS");
    results.push(`PASS  ${name}`);
    pass++;
  } catch (e) {
    if (!verbose) log("FAIL");
    results.push(`FAIL  ${name}`);
    errors.push({ name, output: e.stderr || e.stdout || e.message });
    fail++;
  }
};

const skipTest = (name, reason) => {
  if (verbose) log(`\n══════ ${name} ══════ SKIP (${reason})`);
  else log(`  ${name} ... SKIP (${reason})`);
  results.push(`SKIP  ${name} (${reason})`);
  skip++;
};

// -- Node.js ------------------------------------------------------------------

if (runtimeFilter && runtimeFilter !== "node") {
  // skip
} else if (hasCommand("node")) {
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

if (runtimeFilter && runtimeFilter !== "deno") {
  // skip
} else if (hasCommand("deno")) {
  const v = getVersion("deno");
  runTest(`${v} / integration-runtime`, "deno", ["run", "--allow-all", "tests/integration-runtime.mjs"]);
  runTest(`${v} / integration-web`, "deno", ["run", "--allow-all", "tests/integration-web.mjs"]);
} else {
  skipTest("deno", "not installed");
}

// -- Bun ----------------------------------------------------------------------

if (runtimeFilter && runtimeFilter !== "bun") {
  // skip
} else if (hasCommand("bun")) {
  const v = `bun ${getVersion("bun")}`;
  runTest(`${v} / integration-runtime`, "bun", ["tests/integration-runtime.mjs"]);
  runTest(`${v} / integration-web`, "bun", ["tests/integration-web.mjs"]);
} else {
  skipTest("bun", "not installed");
}

// -- Summary ------------------------------------------------------------------

const W = 42;
const pad = (s) => s.padEnd(W - 4);

log(`\n${"╔" + "═".repeat(W) + "╗"}`);
log(`║${" ".repeat(7)}TEST MATRIX RESULTS${" ".repeat(W - 26)}║`);
log(`${"╠" + "═".repeat(W) + "╣"}`);
for (const r of results) {
  log(`║  ${pad(r)} ║`);
}
log(`${"╠" + "═".repeat(W) + "╣"}`);
log(`║  ${pad(`PASS: ${pass}  FAIL: ${fail}  SKIP: ${skip}`)} ║`);
log(`${"╚" + "═".repeat(W) + "╝"}`);

if (errors.length > 0) {
  log("\n── ERRORS ──");
  for (const err of errors) {
    log(`\n✗ ${err.name}:`);
    const lines = err.output.split("\n").slice(-20);
    log(lines.join("\n"));
  }
  process.exit(1);
}

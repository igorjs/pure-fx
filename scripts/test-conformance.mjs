// SPDX-License-Identifier: Apache-2.0
/**
 * test-conformance.mjs - Run the cross-runtime conformance suites, one lane per
 * runtime: the current Node, Node 22/24/26 through fnm, Bun and Workers
 * (Miniflare).
 *
 * A lane whose runtime is missing is skipped locally and fails under --ci (or
 * when CI is set), so a green CI run always means every lane ran.
 *
 * Usage:
 *   node scripts/test-conformance.mjs                 # every lane
 *   node scripts/test-conformance.mjs --ci            # a missing lane fails
 *   node scripts/test-conformance.mjs --lane bun      # only the named lane(s), comma separated
 *   node scripts/test-conformance.mjs --config f.json # lanes from a JSON file
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const NODE_MAJORS = ["22", "24", "26"];
const NATIVE_ENTRY = "tests/conformance/lanes/run-native.mjs";
const WORKERS_ENTRY = "tests/conformance/lanes/run-workers.mjs";
const LANE_TIMEOUT_MS = 300_000;
const PROBE_TIMEOUT_MS = 30_000;
const RESULT_PREFIX = "CONFORMANCE_RESULT ";

const log = msg => process.stdout.write(`${msg}\n`);

/** Lanes are `{ name, bin, args, probeArgs? }`; probeArgs default to `--version`. */
const defaultLanes = () => [
  { name: "node-current", bin: process.execPath, args: [NATIVE_ENTRY] },
  ...NODE_MAJORS.map(major => ({
    name: `node-${major}`,
    bin: "fnm",
    args: ["exec", "--using", major, "node", NATIVE_ENTRY],
    probeArgs: ["exec", "--using", major, "node", "--version"],
  })),
  { name: "bun", bin: "bun", args: [NATIVE_ENTRY] },
  {
    name: "workers",
    bin: process.execPath,
    args: [WORKERS_ENTRY],
    probeArgs: ["--input-type=module", "-e", "await import('miniflare')"],
  },
];

const argv = process.argv.slice(2);
const flagValue = flag => {
  const idx = argv.indexOf(flag);
  return idx === -1 ? undefined : argv[idx + 1];
};

const strict = argv.includes("--ci") || Boolean(process.env.CI);
const configPath = flagValue("--config");
const only = flagValue("--lane")?.split(",");

let lanes = configPath === undefined ? defaultLanes() : JSON.parse(readFileSync(configPath, "utf-8")).lanes;
if (only !== undefined) lanes = lanes.filter(lane => only.includes(lane.name));

/** Why the lane cannot run, or undefined when its runtime is available. */
const missingReason = lane => {
  const probe = spawnSync(lane.bin, lane.probeArgs ?? ["--version"], {
    stdio: "pipe",
    timeout: PROBE_TIMEOUT_MS,
  });
  if (probe.error !== undefined) return `${lane.bin} not found`;
  if (probe.status !== 0) return `${lane.bin} cannot run this lane`;
  return undefined;
};

const parseResult = stdout => {
  const line = stdout.split("\n").find(l => l.startsWith(RESULT_PREFIX));
  return line === undefined ? undefined : JSON.parse(line.slice(RESULT_PREFIX.length));
};

const indent = text =>
  text
    .trimEnd()
    .split("\n")
    .map(line => `      ${line}`)
    .join("\n");

/** Run one lane and print its line. Resolves to "run", "skipped" or "failed". */
const runLane = lane => {
  const reason = missingReason(lane);
  if (reason !== undefined) {
    if (strict) {
      log(`  ${lane.name} ... MISSING (${reason}), required in CI`);
      return "failed";
    }
    log(`  ${lane.name} ... SKIPPED (${reason})`);
    return "skipped";
  }
  const res = spawnSync(lane.bin, lane.args, {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: LANE_TIMEOUT_MS,
  });
  const totals = parseResult(res.stdout ?? "");
  if (res.status === 0 && totals !== undefined && totals.failed === 0) {
    log(`  ${lane.name} ... PASS passed=${totals.passed} failed=0 skipped=${totals.skipped}`);
    return "run";
  }
  const summary =
    totals === undefined
      ? "no result reported"
      : `passed=${totals.passed} failed=${totals.failed} skipped=${totals.skipped}`;
  log(`  ${lane.name} ... FAIL ${summary}`);
  log(indent(`${res.stdout ?? ""}${res.stderr ?? ""}`));
  return "failed";
};

const counts = { run: 0, skipped: 0, failed: 0 };
for (const lane of lanes) {
  const outcome = runLane(lane);
  counts[outcome === "run" ? "run" : outcome]++;
}
// A lane that ran and failed counts as failed, not as run.
log(
  `\nConformance lanes: ${lanes.length} (${counts.run} run, ${counts.skipped} skipped, ${counts.failed} failed)`,
);
process.exit(counts.failed > 0 || lanes.length === 0 ? 1 : 0);

// SPDX-License-Identifier: Apache-2.0
/**
 * conformance-runner.test.mjs - The conformance runner fails a missing lane in
 * CI mode, skips it otherwise, and reports the lane count.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "@igorjs/pure-test";

const RUNNER = "scripts/test-conformance.mjs";
const CONFIG = "tests/fixtures/conformance-lanes.json";
const BROKEN_CONFIG = "tests/fixtures/conformance-lanes-broken.json";

const runWith = args => {
  const res = spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: "utf-8",
    env: { ...process.env, CI: "" },
  });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
};

const runRunner = (...flags) => runWith(["--config", CONFIG, ...flags]);

describe("conformance runner", () => {
  it("fails in CI mode when a lane's runtime is missing, and names the lane", () => {
    // Arrange / Act
    const { status, output } = runRunner("--ci");
    // Assert
    expect(status).not.toBe(0);
    expect(output).toContain("fixture-missing");
    expect(output).toContain("MISSING");
  });

  it("skips a missing lane outside CI and still passes", () => {
    // Arrange / Act
    const { status, output } = runRunner();
    // Assert
    expect(status).toBe(0);
    expect(output).toContain("fixture-missing ... SKIPPED");
  });

  it("prints the lane count and per-lane totals", () => {
    // Arrange / Act
    const { output } = runRunner();
    // Assert
    expect(output).toContain("Conformance lanes: 2 (1 run, 1 skipped, 0 failed)");
    expect(output).toContain("fixture-present ... PASS passed=3 failed=0 skipped=1");
  });

  it("fails a lane that reports failures and shows its output", () => {
    // Arrange / Act
    const { status, output } = runWith(["--config", BROKEN_CONFIG, "--lane", "fixture-failing"]);
    // Assert
    expect(status).not.toBe(0);
    expect(output).toContain("fixture-failing ... FAIL passed=1 failed=1 skipped=0");
    expect(output).toContain("FAIL fixture: something broke");
  });

  it("fails a lane that reports no result", () => {
    // Arrange / Act
    const { status, output } = runWith(["--config", BROKEN_CONFIG, "--lane", "fixture-silent"]);
    // Assert
    expect(status).not.toBe(0);
    expect(output).toContain("fixture-silent ... FAIL no result reported");
  });

  it("treats a runtime that cannot run the lane as missing", () => {
    // Arrange / Act
    const { status, output } = runWith(["--config", BROKEN_CONFIG, "--lane", "fixture-unusable"]);
    // Assert
    expect(status).toBe(0);
    expect(output).toContain("fixture-unusable ... SKIPPED (node cannot run this lane)");
  });

  it("fails when the lane filter matches nothing", () => {
    // Arrange / Act
    const { status, output } = runWith(["--config", CONFIG, "--lane", "no-such-lane"]);
    // Assert
    expect(status).not.toBe(0);
    expect(output).toContain("Conformance lanes: 0");
  });

  it("runs the real suites on the current Node through the default lanes", () => {
    // Arrange / Act
    const { status, output } = runWith(["--lane", "node-current"]);
    // Assert
    expect(status).toBe(0);
    expect(output).toContain("node-current ... PASS");
  });
});

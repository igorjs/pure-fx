/**
 * program.test.js - Black-box tests for Program.run() process lifecycle.
 *
 * Spawns fixture scripts as child processes and verifies exit codes,
 * stdout, and stderr. No mocking, no stubbing - tests real process behaviour.
 *
 * Run: node --test tests/program.test.js
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "@igorjs/pure-test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── Helpers ─────────────────────────────────────────────────────────────────

function spawnFixture(name) {
  const child = spawn(process.execPath, [`tests/fixtures/${name}`], {
    cwd: projectRoot,
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  const out = { stdout: "", stderr: "" };
  child.stdout.on("data", d => {
    out.stdout += d;
  });
  child.stderr.on("data", d => {
    out.stderr += d;
  });
  return { child, out };
}

function waitForExit(child, out, timeoutMs = 10_000) {
  if (child.exitCode !== null) {
    return Promise.resolve({ code: child.exitCode, stdout: out.stdout, stderr: out.stderr });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Timed out waiting for exit"));
    }, timeoutMs);
    child.on("close", code => {
      clearTimeout(timer);
      resolve({ code, stdout: out.stdout, stderr: out.stderr });
    });
  });
}

function runFixture(name) {
  const { child, out } = spawnFixture(name);
  return waitForExit(child, out);
}

function waitForOutput(child, out, field, text, timeoutMs = 5000) {
  if (out[field].includes(text)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${text}" in ${field}`)),
      timeoutMs,
    );
    const stream = field === "stdout" ? child.stdout : child.stderr;
    const onData = () => {
      if (out[field].includes(text)) {
        clearTimeout(timer);
        stream.off("data", onData);
        resolve();
      }
    };
    stream.on("data", onData);
  });
}

const LOG_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[test\] /;

// ── Ok path ─────────────────────────────────────────────────────────────────

describe("Program.run() Ok path", () => {
  let r;
  beforeAll(async () => {
    r = await runFixture("program-ok.js");
  });

  it("exits 0 on Ok result", () => {
    expect(r.code).toBe(0);
  });

  it('logs "started" then "completed" to stdout', () => {
    expect(r.stdout.includes("started")).toBe(true);
    expect(r.stdout.includes("completed")).toBe(true);
    expect(r.stdout.indexOf("started") < r.stdout.indexOf("completed")).toBe(true);
  });

  it("log lines match ISO timestamp and [name] tag format", () => {
    for (const line of r.stdout.trim().split("\n")) {
      expect(line).toMatch(LOG_RE);
    }
  });

  it("produces no stderr output", () => {
    expect(r.stderr).toBe("");
  });
});

// ── Err path ────────────────────────────────────────────────────────────────

describe("Program.run() Err path", () => {
  it("exits 1 on Err with string", async () => {
    const r = await runFixture("program-err-string.js");
    expect(r.code).toBe(1);
    expect(r.stdout.includes("started")).toBe(true);
    expect(r.stderr.includes("error: fail")).toBe(true);
  });

  it("exits 1 on Err with Error object", async () => {
    const r = await runFixture("program-err-error.js");
    expect(r.code).toBe(1);
    expect(r.stderr.includes("error: Error: boom")).toBe(true);
  });

  it("exits 1 on Err with plain object (JSON.stringify)", async () => {
    const r = await runFixture("program-err-object.js");
    expect(r.code).toBe(1);
    expect(r.stderr.includes('error: {"code":42}')).toBe(true);
  });

  it("exits 1 on Err with custom toString", async () => {
    const r = await runFixture("program-err-custom-tostring.js");
    expect(r.code).toBe(1);
    expect(r.stderr.includes("error: CustomErr")).toBe(true);
  });

  it("exits 1 on Err with circular object (fallback)", async () => {
    const r = await runFixture("program-err-circular.js");
    expect(r.code).toBe(1);
    expect(r.stderr.includes("error: [object Object]")).toBe(true);
  });

  it("exits 1 on Err with ErrType formatted as Tag(CODE): message", async () => {
    const r = await runFixture("program-errtype.js");
    expect(r.code).toBe(1);
    expect(r.stderr.includes("error: NotFound(NOT_FOUND): missing")).toBe(true);
  });
});

// ── Unhandled exception ─────────────────────────────────────────────────────

describe("Program.run() unhandled exception", () => {
  it("exits 1 and logs error when task throws", async () => {
    const r = await runFixture("program-throw.js");
    expect(r.code).toBe(1);
    expect(r.stderr.includes("error: Error: kaboom")).toBe(true);
  });
});

// ── Effect function ─────────────────────────────────────────────────────────

describe("Program.run() effect function", () => {
  it("accepts (signal) => Task form and exits 0", async () => {
    const r = await runFixture("program-effect-fn.js");
    expect(r.code).toBe(0);
    expect(r.stdout.includes("started")).toBe(true);
    expect(r.stdout.includes("completed")).toBe(true);
  });
});

// ── Signal handling ─────────────────────────────────────────────────────────

describe("Program.run() signal handling", () => {
  it('SIGINT logs "interrupted" to stderr and exits 130', async () => {
    const { child, out } = spawnFixture("program-signal-wait.js");
    await waitForOutput(child, out, "stdout", "started");
    const exit = waitForExit(child, out);
    child.kill("SIGINT");
    const r = await exit;
    expect(r.code).toBe(130);
    expect(r.stderr.includes("interrupted")).toBe(true);
  });

  it('SIGTERM logs "interrupted" to stderr and exits 130', async () => {
    const { child, out } = spawnFixture("program-signal-wait.js");
    await waitForOutput(child, out, "stdout", "started");
    const exit = waitForExit(child, out);
    child.kill("SIGTERM");
    const r = await exit;
    expect(r.code).toBe(130);
    expect(r.stderr.includes("interrupted")).toBe(true);
  });

  it("second SIGINT force-exits with 130", async () => {
    const { child, out } = spawnFixture("program-signal-hang.js");
    await waitForOutput(child, out, "stdout", "started");
    const exit = waitForExit(child, out);
    child.kill("SIGINT");
    await waitForOutput(child, out, "stderr", "interrupted");
    child.kill("SIGINT");
    const r = await exit;
    expect(r.code).toBe(130);
  });

  it("interrupt takes priority over Ok result", async () => {
    const { child, out } = spawnFixture("program-signal-ok.js");
    await waitForOutput(child, out, "stdout", "started");
    const exit = waitForExit(child, out);
    child.kill("SIGINT");
    const r = await exit;
    expect(r.code).toBe(130);
    expect(r.stdout.includes("completed")).toBe(false);
    expect(r.stderr.includes("interrupted")).toBe(true);
  });

  it("teardown timeout force-exits without second signal", async () => {
    const { child, out } = spawnFixture("program-signal-teardown.js");
    await waitForOutput(child, out, "stdout", "started");
    const start = Date.now();
    const exit = waitForExit(child, out);
    child.kill("SIGINT");
    const r = await exit;
    const elapsed = Date.now() - start;
    expect(r.code).toBe(130);
    expect(r.stderr.includes("interrupted")).toBe(true);
    expect(elapsed < 3000).toBe(true);
  });
});

// ── Silent option ───────────────────────────────────────────────────────────

describe("Program.run() silent option", () => {
  it("suppresses started/completed logs on Ok", async () => {
    const r = await runFixture("program-silent.js");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
  });

  it("still logs errors to stderr even when silent", async () => {
    const r = await runFixture("program-silent-err.js");
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr.includes("error: silent-fail")).toBe(true);
  });
});

// ── Custom logger ───────────────────────────────────────────────────────────

describe("Program.run() custom logger", () => {
  it("uses Logger for lifecycle messages instead of console", async () => {
    const r = await runFixture("program-logger.js");
    expect(r.code).toBe(0);
    // Logger.json writes to stdout. Parse each line as JSON.
    const lines = r.stdout.trim().split("\n").filter(Boolean);
    expect(lines.length >= 2).toBe(true);
    const started = JSON.parse(lines[0]);
    expect(started.name).toBe("custom");
    expect(started.level).toBe("info");
    expect(started.message).toBe("started");
    const completed = JSON.parse(lines[lines.length - 1]);
    expect(completed.message).toBe("completed");
    // No raw console.log output (no [test] tag)
    expect(r.stdout.includes("[test]")).toBe(false);
  });
});

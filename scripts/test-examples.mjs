// SPDX-License-Identifier: Apache-2.0
/**
 * Runs each example app as a child process on every runtime lane and checks it over HTTP.
 *
 * Usage: node scripts/test-examples.mjs [--ci]
 * A missing runtime is skipped locally and fails the run in CI (`--ci` or the CI env var).
 */

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STARTUP_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 5_000;
const ci = process.argv.includes("--ci") || Boolean(process.env.CI);

const LANES = [
  { name: "node", command: process.execPath },
  { name: "bun", command: "bun" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const hasRuntime = command => spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;

/** Start an example and resolve with its base URL once it prints the bound port. */
const start = (lane, entry) =>
  new Promise((resolve, reject) => {
    const child = spawn(lane.command, [entry], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const fail = reason => {
      clearTimeout(timer);
      child.kill();
      reject(new Error(`${reason}\n${output}`));
    };
    const timer = setTimeout(
      () => fail(`no port printed within ${STARTUP_TIMEOUT_MS}ms`),
      STARTUP_TIMEOUT_MS,
    );
    const onData = chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve({ child, url: `http://127.0.0.1:${match[1]}` });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", chunk => {
      output += chunk;
    });
    child.once("error", error => fail(`failed to spawn: ${error.message}`));
    child.once("exit", code => fail(`exited early with code ${code}`));
  });

/** The port is printed before the adapter finishes binding, so poll until it accepts connections. */
const waitReady = async url => {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  for (;;) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      return;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`${url} never accepted connections: ${error.message}`);
      await new Promise(r => setTimeout(r, 50));
    }
  }
};

const stop = child =>
  new Promise(resolve => {
    child.removeAllListeners("exit");
    child.once("exit", resolve);
    child.kill();
  });

const assertEqual = (actual, expected, label) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
};

/** Send a request and return `{ status, body }` with the body parsed when it is JSON. */
const call = async (base, method, path, body) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  return { status: response.status, body: raw === "" ? null : JSON.parse(raw) };
};

const expectError = (res, status, tag, code, label) => {
  assertEqual(res.status, status, `${label} status`);
  assertEqual([res.body.error.tag, res.body.error.code], [tag, code], `${label} error`);
};

// ── Example checks ──────────────────────────────────────────────────────────

const restApi = async base => {
  assertEqual((await call(base, "GET", "/notes")).body, [], "empty list");

  const created = await call(base, "POST", "/notes", { title: "first" });
  assertEqual(created.status, 201, "create status");
  assertEqual(created.body, { id: "1", title: "first", body: "" }, "create body");

  assertEqual((await call(base, "GET", "/notes/1")).body, created.body, "get one");
  assertEqual((await call(base, "GET", "/notes")).body, [created.body], "list one");

  const patched = await call(base, "PATCH", "/notes/1", { body: "hello" });
  assertEqual(patched.status, 200, "patch status");
  assertEqual(patched.body, { id: "1", title: "first", body: "hello" }, "patch body");

  const deleted = await call(base, "DELETE", "/notes/1");
  assertEqual(deleted.status, 204, "delete status");
  expectError(await call(base, "GET", "/notes/1"), 404, "NoteNotFound", "NOTE_NOT_FOUND", "get deleted");

  expectError(await call(base, "GET", "/notes/99"), 404, "NoteNotFound", "NOTE_NOT_FOUND", "get missing");
  expectError(await call(base, "PATCH", "/notes/99", {}), 404, "NoteNotFound", "NOTE_NOT_FOUND", "patch missing");
  expectError(await call(base, "DELETE", "/notes/99"), 404, "NoteNotFound", "NOTE_NOT_FOUND", "delete missing");
  expectError(await call(base, "POST", "/notes", { title: 5 }), 400, "ValidationFailed", "VALIDATION_FAILED", "wrong type");
  expectError(await call(base, "POST", "/notes", { title: "  " }), 400, "ValidationFailed", "VALIDATION_FAILED", "blank title");
  expectError(await call(base, "POST", "/notes", "{not json"), 400, "ValidationFailed", "VALIDATION_FAILED", "malformed JSON");
  assertEqual((await call(base, "GET", "/notes")).body, [], "invalid input stored nothing");
};

/** Add further example apps here: one entry per example, each with its own process and data. */
const EXAMPLES = [{ name: "rest-api", entry: "examples/rest-api/server.mjs", check: restApi }];

// ── Runner ──────────────────────────────────────────────────────────────────

const runLane = async lane => {
  for (const example of EXAMPLES) {
    const { child, url } = await start(lane, example.entry);
    try {
      await waitReady(url);
      await example.check(url);
    } finally {
      await stop(child);
    }
    console.log(`ok   ${lane.name} ${example.name}`);
  }
};

let passed = 0;
let skipped = 0;
const failures = [];

for (const lane of LANES) {
  if (!hasRuntime(lane.command)) {
    if (ci) {
      failures.push(`${lane.name} lane: runtime "${lane.command}" is not installed`);
    } else {
      skipped++;
      console.log(`skip ${lane.name}: runtime not installed`);
    }
    continue;
  }
  try {
    await runLane(lane);
    passed++;
  } catch (error) {
    failures.push(`${lane.name} lane: ${error.message}`);
  }
}

console.log(`lanes: ${passed} passed, ${failures.length} failed, ${skipped} skipped`);
for (const failure of failures) console.error(`FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);

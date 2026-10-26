// SPDX-License-Identifier: Apache-2.0
/**
 * Runs each example app on every runtime lane: HTTP apps and CLIs as child processes on Node and
 * Bun, and the Workers app inside Miniflare.
 *
 * Usage: node scripts/test-examples.mjs [--ci]
 * A missing runtime is skipped locally and fails the run in CI (`--ci` or the CI env var).
 */

import { spawn, spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STARTUP_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 5_000;
const ci = process.argv.includes("--ci") || Boolean(process.env.CI);

const MINIFLARE_TIMEOUT_MS = 30_000;

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

/** HTTP examples: one entry per example, each with its own process and data. */
const EXAMPLES = [{ name: "rest-api", entry: "examples/rest-api/server.mjs", check: restApi }];

// ── CLI example ─────────────────────────────────────────────────────────────

const CLI_ENTRY = "examples/cli/notes-cli.mjs";
const USER_ERROR_EXIT_CODE = 2;
const DEFECT_EXIT_CODE = 1;

const runCli = (lane, args, env = {}) => {
  const run = spawnSync(lane.command, [CLI_ENTRY, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: REQUEST_TIMEOUT_MS,
    env: { ...process.env, ...env },
  });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
};

const assertIncludes = (text, part, label) => {
  if (!text.includes(part)) throw new Error(`${label}: expected ${JSON.stringify(text)} to include ${JSON.stringify(part)}`);
};

const cliChecks = lane => {
  const ok = runCli(lane, ["add", "buy milk", "--tag", "home"]);
  assertEqual(ok.code, 0, "success exit code");
  assertEqual(ok.stdout.trim(), "[home] buy milk", "success stdout");

  const missing = runCli(lane, ["add"]);
  assertEqual(missing.code, USER_ERROR_EXIT_CODE, "missing title exit code");
  assertIncludes(missing.stderr, "title: expected string", "missing title stderr");

  const unknown = runCli(lane, ["remove", "x"]);
  assertEqual(unknown.code, USER_ERROR_EXIT_CODE, "unknown command exit code");
  assertIncludes(unknown.stderr, 'unknown command "remove"', "unknown command stderr");

  const crash = runCli(lane, ["add", "x"], { NOTES_CLI_CRASH: "1" });
  assertEqual(crash.code, DEFECT_EXIT_CODE, "unexpected error exit code");
  assertIncludes(crash.stderr, "unexpected error: crash requested", "unexpected error stderr");
};

// ── Workers example ─────────────────────────────────────────────────────────

const WORKER_SOURCE = "examples/workers-app/worker.mjs";
const WORKER_TMP = ".tmp-worker-example.mjs";
const ENV_GREETING = "hello-from-env";

const workersChecks = async mf => {
  const get = async (path, init) => {
    const res = await mf.dispatchFetch(`http://localhost${path}`, init);
    return { status: res.status, body: await res.json() };
  };
  const post = body =>
    get("/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  assertEqual((await get("/items")).body, [], "empty list");
  const created = await post({ name: "first" });
  assertEqual([created.status, created.body], [201, { id: "1", name: "first" }], "create");
  assertEqual((await get("/items")).body, [created.body], "list one");
  assertEqual((await get("/items/1")).body, created.body, "get one");
  expectError(await get("/items/99"), 404, "ItemNotFound", "ITEM_NOT_FOUND", "unknown id");
  expectError(await post({ name: 5 }), 400, "ValidationFailed", "VALIDATION_FAILED", "wrong type");
  expectError(await post("{not json"), 400, "ValidationFailed", "VALIDATION_FAILED", "malformed JSON");
  assertEqual((await get("/greeting")).body, { greeting: ENV_GREETING }, "env binding");
};

/** Load the worker in a fresh Miniflare instance without nodejs_compat. */
const runWorkers = async () => {
  const { Miniflare } = await import("miniflare");
  const { esModules } = await import("./miniflare-modules.mjs");
  // Miniflare cannot resolve bare package names, so point them at the built dist/.
  const source = (await readFile(`${ROOT}${WORKER_SOURCE}`, "utf8"))
    .replace('"@igorjs/pure-fx/runtime/adapter/workers"', '"./dist/runtime/adapter/workers.js"')
    .replace('"@igorjs/pure-fx"', '"./dist/index.js"');
  const tmpPath = `${ROOT}${WORKER_TMP}`;
  await writeFile(tmpPath, source);
  let mf;
  try {
    mf = new Miniflare({
      modules: esModules(tmpPath, `${ROOT}dist`),
      modulesRoot: ROOT,
      compatibilityDate: "2024-01-01",
      bindings: { GREETING: ENV_GREETING },
    });
    await Promise.race([
      workersChecks(mf),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${MINIFLARE_TIMEOUT_MS}ms`)), MINIFLARE_TIMEOUT_MS).unref(),
      ),
    ]);
  } finally {
    await mf?.dispose();
    await rm(tmpPath, { force: true });
  }
};

const hasMiniflare = async () => {
  try {
    await import("miniflare");
    return true;
  } catch {
    return false;
  }
};

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
  cliChecks(lane);
  console.log(`ok   ${lane.name} cli`);
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

if (await hasMiniflare()) {
  try {
    await runWorkers();
    console.log("ok   workers workers-app");
    passed++;
  } catch (error) {
    failures.push(`workers lane: ${error.message}`);
  }
} else if (ci) {
  failures.push('workers lane: package "miniflare" is not installed');
} else {
  skipped++;
  console.log("skip workers: miniflare not installed");
}

console.log(`lanes: ${passed} passed, ${failures.length} failed, ${skipped} skipped`);
for (const failure of failures) console.error(`FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);

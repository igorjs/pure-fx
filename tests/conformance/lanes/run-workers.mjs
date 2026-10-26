// SPDX-License-Identifier: Apache-2.0
/**
 * Conformance lane entry for Workers: runs the suites inside a fresh Miniflare
 * instance without nodejs_compat. Prints a CONFORMANCE_RESULT line.
 */
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { esModules } from "../../../scripts/miniflare-modules.mjs";

const ROOT = resolve(new URL("../../../", import.meta.url).pathname);
const SUITE_DIR = resolve(ROOT, "tests/conformance");
const TIMEOUT_MS = 60_000;
const WORKER_PATH = resolve(ROOT, ".tmp-worker-conformance.mjs");

const WORKER_SRC = `
import * as lib from "./dist/index.js";
import { toWorkersHandler } from "./dist/runtime/adapter/workers.js";
import { runSuites } from "./tests/conformance/run-suites.mjs";

const env = {
  runtime: "workers",
  spawn: false,
  async serve(app, options) {
    const handler = toWorkersHandler(app, { maxBodyBytes: options.maxBodyBytes });
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    return {
      send: (path, init) => handler.fetch(new Request("http://localhost" + path, init), {}, ctx),
      close: async () => {},
    };
  },
};

export default {
  async fetch() {
    return Response.json(await runSuites(lib, env));
  },
};
`;

const suiteModules = readdirSync(SUITE_DIR, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith(".mjs"))
  .map(entry => ({ type: "ESModule", path: resolve(SUITE_DIR, entry.name) }));

writeFileSync(WORKER_PATH, WORKER_SRC);
const mf = new Miniflare({
  modules: [...esModules(WORKER_PATH, resolve(ROOT, "dist")), ...suiteModules],
  modulesRoot: ROOT,
  compatibilityDate: "2024-01-01",
});

let exitCode = 1;
try {
  const res = await mf.dispatchFetch("http://localhost/", {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const { passed, failed, skipped, logs } = await res.json();
  for (const line of logs) process.stdout.write(`${line}\n`);
  process.stdout.write(`CONFORMANCE_RESULT ${JSON.stringify({ passed, failed, skipped })}\n`);
  exitCode = failed > 0 ? 1 : 0;
} catch (err) {
  process.stdout.write(`FAIL workers lane: ${err instanceof Error ? err.message : String(err)}\n`);
} finally {
  await mf.dispose().catch(() => undefined);
  rmSync(WORKER_PATH, { force: true });
}
process.exit(exitCode);

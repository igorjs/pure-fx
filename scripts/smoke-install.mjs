// SPDX-License-Identifier: Apache-2.0
/**
 * Post-release smoke test: install the package into a fresh project and import
 * every public subpath on the current runtime (Node, or Bun via `bun <script>`).
 *
 * Usage:
 *   node scripts/smoke-install.mjs --version <v> [--workers]
 *   node scripts/smoke-install.mjs --tarball <path> [--workers]
 *
 * Registry mode first waits for the version to appear on npm. `--workers`
 * also imports the core entry inside Miniflare. Exits 1 naming the failure.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { esModules } from "./miniflare-modules.mjs";

const PACKAGE_NAME = "@igorjs/pure-fx";
const REGISTRY_URL = "https://registry.npmjs.org";
const REGISTRY_WAIT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 15 * 1000;
const IMPORT_TIMEOUT_MS = 60 * 1000;
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const WORKER_TIMEOUT_MS = 60 * 1000;
const HTTP_OK = 200;
const PACKUMENT_ACCEPT = "application/vnd.npm.install-v1+json";

const projectRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");

/** Every importable specifier in an `exports` map (skips `package.json` and type-only entries). */
export function publicSubpaths(exportsMap) {
  return Object.entries(exportsMap)
    .filter(([, target]) => typeof target === "object" && (target.import ?? target.default))
    .map(([key]) => (key === "." ? PACKAGE_NAME : `${PACKAGE_NAME}${key.slice(1)}`));
}

const defaultSleep = ms => new Promise(done => setTimeout(done, ms));

/**
 * Polls the package document at `url` until its `versions` lists `version`
 * (npm resolves installs through it, not the per-version document); rejects
 * once `timeoutMs` of waiting has passed.
 */
export async function waitForVersion({
  fetch,
  url,
  version,
  timeoutMs = REGISTRY_WAIT_MS,
  intervalMs = POLL_INTERVAL_MS,
  sleep = defaultSleep,
}) {
  let waited = 0;
  for (;;) {
    const response = await fetch(url, { headers: { Accept: PACKUMENT_ACCEPT } }).catch(() => undefined);
    if (response?.status === HTTP_OK) {
      const document = await response.json().catch(() => undefined);
      if (document?.versions?.[version]) return;
    }
    if (waited >= timeoutMs) break;
    await sleep(intervalMs);
    waited += intervalMs;
  }
  throw new Error(`Version ${version} was not available at ${url} after waiting ${waited} ms`);
}

function installInto(dir, spec) {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", spec], {
    cwd: dir,
    stdio: "inherit",
    timeout: INSTALL_TIMEOUT_MS,
  });
}

function importAll(dir, specifiers) {
  const script = join(dir, "import-all.mjs");
  writeFileSync(
    script,
    `const specifiers = ${JSON.stringify(specifiers)};
for (const specifier of specifiers) {
  try {
    await import(specifier);
    console.log("ok   " + specifier);
  } catch (error) {
    console.error("FAIL " + specifier + ": " + (error?.message ?? error));
    process.exit(1);
  }
}
`,
  );
  const result = spawnSync(process.execPath, [script], {
    cwd: dir,
    stdio: "inherit",
    timeout: IMPORT_TIMEOUT_MS,
  });
  if (result.status !== 0) throw new Error("importing a public subpath failed (see FAIL line above)");
}

async function importInWorkers(dir) {
  const { Miniflare } = await import("miniflare");
  // Next to dist/ so the module root contains every relative import, as in tests/workers/run.mjs.
  const entry = join(dir, "node_modules", PACKAGE_NAME, "smoke-worker.mjs");
  writeFileSync(
    entry,
    `import * as lib from "./dist/index.js";
export default {
  fetch: () => new Response(JSON.stringify(Object.keys(lib))),
};
`,
  );
  const mf = new Miniflare({
    modules: esModules(entry, join(dirname(entry), "dist")),
    modulesRoot: dirname(entry),
    compatibilityDate: "2024-01-01",
  });
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Miniflare did not answer within ${WORKER_TIMEOUT_MS} ms`)),
        WORKER_TIMEOUT_MS,
      );
    });
    const response = await Promise.race([mf.dispatchFetch("http://localhost/"), timeout]);
    const names = await response.json();
    if (names.length === 0) throw new Error("core entry exported nothing inside Miniflare");
    console.log(`ok   ${PACKAGE_NAME} (Miniflare, ${names.length} exports)`);
  } finally {
    clearTimeout(timer);
    await mf.dispose();
  }
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      version: { type: "string" },
      tarball: { type: "string" },
      workers: { type: "boolean", default: false },
    },
  });
  if (!values.version === !values.tarball) {
    throw new Error("pass exactly one of --version <v> or --tarball <path>");
  }

  let spec;
  if (values.tarball) {
    spec = resolve(values.tarball);
    if (!existsSync(spec)) throw new Error(`tarball not found: ${spec}`);
  } else {
    spec = `${PACKAGE_NAME}@${values.version}`;
    const url = `${REGISTRY_URL}/${PACKAGE_NAME.replaceAll("/", "%2f")}`;
    await waitForVersion({ fetch, url, version: values.version });
  }

  const { exports: exportsMap } = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "smoke-install-")));
  try {
    installInto(dir, spec);
    importAll(dir, publicSubpaths(exportsMap));
    if (values.workers) await importInWorkers(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    error => {
      console.error(`smoke-install failed: ${error.message}`);
      process.exit(1);
    },
  );
}

// SPDX-License-Identifier: Apache-2.0
/**
 * Server plus toWorkersHandler cases, each run in a fresh Miniflare instance
 * without nodejs_compat, so the adapter is proven free of Node built-ins.
 */
import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { esModules } from "../../scripts/miniflare-modules.mjs";

const ROOT = resolve(new URL("../../", import.meta.url).pathname);
const CASE_TIMEOUT_MS = 30_000;
const SMALL_LIMIT_BYTES = 16;
const OVERSIZE_BYTES = 64;
const ENV_VALUE = "hello-from-env";
const STATUS_PAYLOAD_TOO_LARGE = 413;

const WORKER_PATH = resolve(ROOT, ".tmp-worker-server.mjs");
const WORKER_SRC = `
import { Server, json } from "./dist/index.js";
import { toWorkersHandler, workersEnv } from "./dist/runtime/adapter/workers.js";

const readAll = async req => {
  let bytes = 0;
  for await (const chunk of req.body) bytes += chunk.byteLength;
  return bytes;
};

const app = Server("workers-test")
  .get("/get", () => new Response("got"))
  .post("/json", async ctx => json({ echoed: await ctx.req.json() }, { status: 201 }))
  .put("/put", () => new Response("put"))
  .patch("/patch", () => new Response("patch"))
  .delete("/delete", () => new Response("delete"))
  .post("/stream", async ctx => json({ bytes: await readAll(ctx.req) }))
  .get("/cookies", () => {
    const headers = new Headers();
    headers.append("set-cookie", "a=1; Path=/");
    headers.append("set-cookie", "b=2; Path=/");
    return new Response("ok", { headers });
  })
  .post("/small", async ctx => json({ bytes: await readAll(ctx.req) }))
  .get("/env", ctx => new Response(workersEnv(ctx.req).GREETING));

export default toWorkersHandler(app, { maxBodyBytes: ${SMALL_LIMIT_BYTES} });
`;

const chunkedBody = (chunkCount, chunkBytes) =>
  new ReadableStream({
    start(controller) {
      for (let i = 0; i < chunkCount; i++) controller.enqueue(new Uint8Array(chunkBytes));
      controller.close();
    },
  });

const CASES = [
  [
    "GET",
    async mf => {
      const res = await mf.dispatchFetch("http://localhost/get");
      return [res.status === 200 && (await res.text()) === "got", `status ${res.status}`];
    },
  ],
  [
    "POST with a JSON body",
    async mf => {
      const res = await mf.dispatchFetch("http://localhost/json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ n: 1 }),
      });
      const body = await res.json();
      return [res.status === 201 && body.echoed.n === 1, `status ${res.status}`];
    },
  ],
  [
    "PUT",
    async mf => {
      const res = await mf.dispatchFetch("http://localhost/put", { method: "PUT", body: "x" });
      return [res.status === 200 && (await res.text()) === "put", `status ${res.status}`];
    },
  ],
  [
    "PATCH",
    async mf => {
      const res = await mf.dispatchFetch("http://localhost/patch", { method: "PATCH", body: "x" });
      return [res.status === 200 && (await res.text()) === "patch", `status ${res.status}`];
    },
  ],
  [
    "DELETE",
    async mf => {
      const res = await mf.dispatchFetch("http://localhost/delete", { method: "DELETE" });
      return [res.status === 200 && (await res.text()) === "delete", `status ${res.status}`];
    },
  ],
  [
    "streamed body under the limit",
    async mf => {
      const res = await mf.dispatchFetch("http://localhost/stream", {
        method: "POST",
        body: chunkedBody(2, 4),
        duplex: "half",
      });
      const body = await res.json();
      return [res.status === 200 && body.bytes === 8, `status ${res.status}`];
    },
  ],
  [
    "two Set-Cookie values reach the client separately",
    async mf => {
      const res = await mf.dispatchFetch("http://localhost/cookies");
      const cookies = res.headers.getSetCookie();
      return [
        cookies.length === 2 && cookies[0].startsWith("a=1") && cookies[1].startsWith("b=2"),
        JSON.stringify(cookies),
      ];
    },
  ],
  [
    "413 when Content-Length is over the limit",
    async mf => {
      const res = await mf.dispatchFetch("http://localhost/small", {
        method: "POST",
        body: new Uint8Array(OVERSIZE_BYTES),
      });
      return [res.status === STATUS_PAYLOAD_TOO_LARGE, `status ${res.status}`];
    },
  ],
  [
    "413 when a streamed body goes over the limit",
    async mf => {
      const res = await mf.dispatchFetch("http://localhost/small", {
        method: "POST",
        body: chunkedBody(OVERSIZE_BYTES / 8, 8),
        duplex: "half",
      });
      return [res.status === STATUS_PAYLOAD_TOO_LARGE, `status ${res.status}`];
    },
  ],
  [
    "env value is visible to a handler",
    async mf => {
      const res = await mf.dispatchFetch("http://localhost/env");
      return [res.status === 200 && (await res.text()) === ENV_VALUE, `status ${res.status}`];
    },
  ],
];

const withTimeout = (promise, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), CASE_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const runCase = async ([name, check]) => {
  const mf = new Miniflare({
    modules: esModules(WORKER_PATH, resolve(ROOT, "dist")),
    modulesRoot: ROOT,
    compatibilityDate: "2024-01-01",
    bindings: { GREETING: ENV_VALUE },
  });
  try {
    const [ok, detail] = await withTimeout(check(mf), name);
    console.log(`  ${ok ? "PASS" : "FAIL"}  workers server: ${name}${ok ? "" : ` (${detail})`}`);
    return ok;
  } catch (err) {
    console.log(`  FAIL  workers server: ${name} (${err instanceof Error ? err.message : err})`);
    return false;
  } finally {
    await mf.dispose().catch(() => undefined);
  }
};

/** Run every case in sequence; resolves to the number of failures. */
export const runServerCases = async () => {
  await writeFile(WORKER_PATH, WORKER_SRC);
  try {
    let failures = 0;
    for (const testCase of CASES) {
      if (!(await runCase(testCase))) failures++;
    }
    return failures;
  } finally {
    await rm(WORKER_PATH, { force: true });
  }
};

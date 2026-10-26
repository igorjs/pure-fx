// SPDX-License-Identifier: Apache-2.0
/**
 * server-body.test.js - Request bodies, duplex, response stream errors and
 * backpressure on the default adapter and the Node adapter.
 *
 * Tests the compiled dist/ output (black-box) over real sockets on
 * ephemeral ports.
 */

import { createServer } from "node:net";
import { describe, expect, it } from "@igorjs/pure-test";

const { Server, Task, Ok, json } = await import("../dist/index.js");
const { nodeAdapter, writeResponse } = await import("../dist/runtime/adapter/node.js");

const HOST = "127.0.0.1";
const CLIENT_TIMEOUT_MS = 3000;
const SETTLE_MS = 150;

const ADAPTERS = [
  ["default adapter", undefined],
  ["node adapter", nodeAdapter],
];
const METHODS = ["POST", "PUT", "PATCH"];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The adapter cannot report its bound port, so reserve a free one first. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const bytesOf = chunks => Buffer.concat(chunks.map(c => Buffer.from(c)));

/** Run `fn(baseUrl)` against a started server and always shut it down. */
const withServer = async (app, adapter, fn) => {
  const port = await freePort();
  const controller = new AbortController();
  const served = app.serve({ port, hostname: HOST, signal: controller.signal }, adapter).run();
  const baseUrl = `http://${HOST}:${port}`;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await fetch(`${baseUrl}/ready`, { signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) });
        break;
      } catch (err) {
        if (attempt > 50) throw err;
        await sleep(40);
      }
    }
    return await fn(baseUrl);
  } finally {
    controller.abort();
    await Promise.race([served, sleep(CLIENT_TIMEOUT_MS)]);
  }
};

const echoApp = () => {
  const handle = ctx =>
    Task(async () => {
      const buf = Buffer.from(await ctx.req.arrayBuffer());
      return Ok(
        new Response(buf, {
          headers: { "content-type": ctx.req.headers.get("content-type") ?? "text/plain" },
        }),
      );
    });
  return Server("body")
    .get("/ready", () => json({ ok: true }))
    .post("/echo", handle)
    .put("/echo", handle)
    .patch("/echo", handle);
};

describe("request bodies", () => {
  for (const [adapterName, adapter] of ADAPTERS) {
    for (const method of METHODS) {
      it(`${method} JSON body is read intact on the ${adapterName}`, async () => {
        // Arrange
        const payload = { name: "ada", tags: ["a", "b"], n: 42 };

        // Act
        const res = await withServer(echoApp(), adapter, baseUrl =>
          fetch(`${baseUrl}/echo`, {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
          }).then(r => r.json()),
        );

        // Assert
        expect(res).toEqual(payload);
      });

      it(`${method} streamed body arrives intact on the ${adapterName}`, async () => {
        // Arrange
        const parts = ["alpha-", "beta-", "gamma"];
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          async start(controller) {
            for (const part of parts) {
              controller.enqueue(encoder.encode(part));
              await sleep(10);
            }
            controller.close();
          },
        });

        // Act
        const echoed = await withServer(echoApp(), adapter, baseUrl =>
          fetch(`${baseUrl}/echo`, {
            method,
            body,
            duplex: "half",
            signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
          }).then(r => r.text()),
        );

        // Assert
        expect(echoed).toBe(parts.join(""));
      });
    }
  }
});

describe("response stream errors", () => {
  const streamFailsAfterOneChunk = () => {
    const encoder = new TextEncoder();
    let sent = false;
    const stream = new ReadableStream({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(encoder.encode("first"));
          return;
        }
        return sleep(20).then(() => controller.error(new Error("boom")));
      },
    });
    return Server("err")
      .get("/ready", () => json({ ok: true }))
      .get("/boom", () => new Response(stream));
  };

  it("unhandledRejection listener fires on a deliberate rejection (positive control)", async () => {
    // Arrange
    const seen = [];
    const listener = reason => seen.push(reason);
    process.on("unhandledRejection", listener);

    try {
      // Act
      void Promise.reject(new Error("control"));
      await sleep(SETTLE_MS);

      // Assert
      expect(seen.length).toBe(1);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });

  for (const [adapterName, adapter] of ADAPTERS) {
    it(`a body stream error after one chunk closes the socket without an unhandled rejection on the ${adapterName}`, async () => {
      // Arrange
      const seen = [];
      const listener = reason => seen.push(reason);
      process.on("unhandledRejection", listener);

      try {
        // Act
        const outcome = await withServer(streamFailsAfterOneChunk(), adapter, async baseUrl => {
          try {
            const res = await fetch(`${baseUrl}/boom`, {
              signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
            });
            await res.text();
            return { failed: false };
          } catch (err) {
            return { failed: true, timedOut: err?.name === "TimeoutError" };
          }
        });
        await sleep(SETTLE_MS);

        // Assert
        expect(seen.length).toBe(0);
        expect(outcome.failed).toBe(true);
        expect(outcome.timedOut).toBe(false);
      } finally {
        process.off("unhandledRejection", listener);
      }
    });
  }
});

describe("response backpressure", () => {
  it("waits for drain after write() returns false before reading again", async () => {
    // Arrange
    const chunks = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    let reads = 0;
    const response = {
      status: 200,
      headers: new Headers(),
      body: {
        getReader: () => ({
          read: async () => {
            const chunk = chunks[reads];
            reads++;
            return chunk === undefined ? { done: true } : { done: false, value: chunk };
          },
        }),
      },
    };
    const drainListeners = [];
    const written = [];
    let writeCalls = 0;
    let ended = false;
    const nodeRes = {
      headersSent: false,
      writeHead() {
        this.headersSent = true;
      },
      write(chunk) {
        written.push(chunk);
        writeCalls++;
        return writeCalls !== 1;
      },
      end() {
        ended = true;
      },
      destroy() {
        // Not exercised by the backpressure scenario.
      },
      once(event, cb) {
        if (event === "drain") drainListeners.push(cb);
        return this;
      },
    };

    // Act
    const done = writeResponse(response, nodeRes);
    await sleep(SETTLE_MS);
    const readsBeforeDrain = reads;
    for (const cb of drainListeners.splice(0)) cb();
    await done;

    // Assert
    expect(readsBeforeDrain).toBe(1);
    expect(reads).toBe(4);
    expect(bytesOf(written)).toEqual(Buffer.from([1, 2, 3]));
    expect(ended).toBe(true);
  });
});

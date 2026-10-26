// SPDX-License-Identifier: Apache-2.0
/**
 * server-body.test.js - Request bodies, duplex, response stream errors and
 * backpressure on the default adapter and the Node adapter.
 *
 * Tests the compiled dist/ output (black-box) over real sockets on
 * ephemeral ports.
 */

import { EventEmitter } from "node:events";
import { connect, createServer } from "node:net";
import { describe, expect, it } from "@igorjs/pure-test";

const { Server, Task, Ok, json } = await import("../dist/index.js");
const { nodeAdapter } = await import("../dist/runtime/adapter/node.js");
const { writeResponse } = await import("../dist/runtime/adapter/node-response.js");
const { toWorkersHandler } = await import("../dist/runtime/adapter/workers.js");

const HOST = "127.0.0.1";
const IPV6_HOST = "::1";
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
const withServer = async (app, adapter, fn, extra = {}) => {
  const server = await startServer(app, adapter, extra);
  try {
    return await fn(server.baseUrl, server.port);
  } finally {
    server.abort();
    await Promise.race([server.served, sleep(CLIENT_TIMEOUT_MS)]);
  }
};

/** Send raw bytes over a socket (fetch normalizes what these tests forge) and parse the reply. */
const rawRequest = (port, raw) =>
  new Promise((resolve, reject) => {
    const socket = connect(port, HOST);
    const received = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("raw request timed out"));
    }, CLIENT_TIMEOUT_MS);
    socket.on("data", chunk => received.push(chunk));
    socket.on("error", () => socket.destroy());
    socket.on("close", () => {
      clearTimeout(timer);
      const reply = Buffer.concat(received).toString("utf8");
      const [head = "", ...rest] = reply.split("\r\n\r\n");
      resolve({ status: Number(head.split(" ")[1]), body: rest.join("\r\n\r\n") });
    });
    socket.write(raw);
  });

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
      removeListener() {
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

const BOUND_MS = 3000;
const SHORT_DRAIN_MS = 200;

/** Reject if `promise` has not settled within `ms`, so a hang fails the test. */
const within = (promise, ms, label) =>
  Promise.race([
    promise,
    sleep(ms).then(() => {
      throw new Error(`timed out waiting for ${label}`);
    }),
  ]);

const deferred = () => {
  let resolve;
  const promise = new Promise(r => {
    resolve = r;
  });
  return { promise, resolve };
};

/** Start `app.serve` on a free port and wait until it accepts connections. */
const startServer = async (app, adapter, extra = {}, urlHost = HOST) => {
  const port = await freePort();
  const controller = new AbortController();
  const served = app
    .serve({ port, hostname: HOST, signal: controller.signal, ...extra }, adapter)
    .run();
  const baseUrl = `http://${urlHost}:${port}`;
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
  } catch (err) {
    controller.abort();
    throw err;
  }
  return { baseUrl, port, served, abort: () => controller.abort() };
};

describe("listen errors", () => {
  for (const [adapterName, adapter] of ADAPTERS) {
    it(`serve resolves to a ListenError when the port is in use on the ${adapterName}`, async () => {
      // Arrange
      const blocker = createServer();
      await new Promise((resolve, reject) => {
        blocker.once("error", reject);
        blocker.listen(0, HOST, resolve);
      });
      const { port } = blocker.address();
      const controller = new AbortController();

      try {
        // Act
        const result = await within(
          Server("busy")
            .get("/", () => json({ ok: true }))
            .serve({ port, hostname: HOST, signal: controller.signal }, adapter)
            .run(),
          BOUND_MS,
          "serve on a busy port",
        );

        // Assert
        expect(result.isErr).toBe(true);
        expect(result.unwrapErr().tag).toBe("ListenError");
      } finally {
        controller.abort();
        await new Promise(resolve => blocker.close(resolve));
      }
    });
  }
});

describe("shutdown drain", () => {
  for (const [adapterName, adapter] of ADAPTERS) {
    it(`close waits for a slow in-flight request on the ${adapterName}`, async () => {
      // Arrange
      const entered = deferred();
      const gate = deferred();
      const app = Server("slow")
        .get("/ready", () => json({ ok: true }))
        .get("/slow", () =>
          Task(async () => {
            entered.resolve();
            await gate.promise;
            return Ok(new Response("finished"));
          }),
        );
      const { baseUrl, served, abort } = await startServer(app, adapter);

      try {
        const pending = fetch(`${baseUrl}/slow`, {
          signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
        });
        await within(entered.promise, BOUND_MS, "handler to start");

        // Act
        abort();
        let settledEarly = false;
        void served.then(() => {
          settledEarly = true;
        });
        await sleep(SETTLE_MS);
        const stillDraining = !settledEarly;
        gate.resolve();
        const res = await within(pending, BOUND_MS, "the in-flight response");
        const body = await within(res.text(), BOUND_MS, "the in-flight body");
        await within(served, BOUND_MS, "serve to resolve after the drain");

        // Assert
        expect(stillDraining).toBe(true);
        expect(res.status).toBe(200);
        expect(body).toBe("finished");
      } finally {
        gate.resolve();
        abort();
      }
    });
  }

  it("force-closes a request still running after drainTimeoutMs and serve resolves", async () => {
    // Arrange
    const entered = deferred();
    const gate = deferred();
    const app = Server("stuck")
      .get("/ready", () => json({ ok: true }))
      .get("/stuck", () =>
        Task(async () => {
          entered.resolve();
          await gate.promise;
          return Ok(new Response("late"));
        }),
      );
    const { baseUrl, served, abort } = await startServer(app, undefined, {
      drainTimeoutMs: SHORT_DRAIN_MS,
    });

    try {
      const outcome = fetch(`${baseUrl}/stuck`, { signal: AbortSignal.timeout(BOUND_MS) }).then(
        () => "responded",
        err => (err?.name === "TimeoutError" ? "hung" : "cut"),
      );
      await within(entered.promise, BOUND_MS, "handler to start");

      // Act
      abort();
      const result = await within(served, BOUND_MS, "serve to resolve after the drain timeout");

      // Assert
      expect(result.isOk).toBe(true);
      expect(await within(outcome, BOUND_MS + SETTLE_MS, "the client outcome")).toBe("cut");
    } finally {
      gate.resolve();
      abort();
    }
  });

  it("close mid-stream finishes a clean stream and cuts an erroring one without hanging", async () => {
    // Arrange
    const encoder = new TextEncoder();
    const gate = deferred();
    const streamResponse = finish =>
      new Response(
        new ReadableStream({
          async start(controller) {
            controller.enqueue(encoder.encode("first"));
            await gate.promise;
            finish(controller);
          },
        }),
      );
    const app = Server("streams")
      .get("/ready", () => json({ ok: true }))
      .get("/clean", () => streamResponse(c => c.close()))
      .get("/bad", () =>
        streamResponse(c => {
          c.error(new Error("boom"));
        }),
      );
    const { baseUrl, served, abort } = await startServer(app, undefined);

    try {
      // Headers reach the client with the first chunk, so wait for them before closing.
      const open = path => fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(BOUND_MS) });
      const [cleanRes, badRes] = await within(
        Promise.all([open("/clean"), open("/bad")]),
        BOUND_MS,
        "both streams to start",
      );
      const read = res =>
        res.text().then(
          text => ({ ok: true, text }),
          () => ({ ok: false }),
        );
      const clean = read(cleanRes);
      const bad = read(badRes);

      // Act
      abort();
      gate.resolve();
      const [cleanOutcome, badOutcome] = await within(
        Promise.all([clean, bad]),
        BOUND_MS + SETTLE_MS,
        "both streams to settle",
      );
      await within(served, BOUND_MS, "serve to resolve");

      // Assert
      expect(cleanOutcome).toEqual({ ok: true, text: "first" });
      expect(badOutcome.ok).toBe(false);
    } finally {
      gate.resolve();
      abort();
    }
  });
});

describe("Set-Cookie", () => {
  const cookieApp = () =>
    Server("cookies")
      .get("/ready", () => json({ ok: true }))
      .get("/raw", () => {
        const headers = new Headers();
        headers.append("set-cookie", "a=1; Path=/");
        headers.append("set-cookie", "b=2; Path=/");
        return new Response("ok", { headers });
      })
      .get("/helper", () => {
        const headers = new Headers();
        headers.append("set-cookie", "a=1; Path=/");
        headers.append("set-cookie", "b=2; Path=/");
        return json({ ok: true }, { headers });
      });

  for (const [adapterName, adapter] of ADAPTERS) {
    for (const route of ["raw", "helper"]) {
      it(`keeps both Set-Cookie values from the ${route} route on the ${adapterName}`, async () => {
        // Arrange
        const app = cookieApp();

        // Act
        const cookies = await withServer(app, adapter, async baseUrl => {
          const res = await fetch(`${baseUrl}/${route}`, {
            signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
          });
          await res.text();
          return res.headers.getSetCookie();
        });

        // Assert
        expect(cookies).toEqual(["a=1; Path=/", "b=2; Path=/"]);
      });
    }
  }
});

describe("maxBodyBytes", () => {
  const LIMIT = 16;
  const STATUS_PAYLOAD_TOO_LARGE = 413;
  const post = (baseUrl, size) =>
    fetch(`${baseUrl}/echo`, {
      method: "POST",
      body: "x".repeat(size),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    }).then(async r => ({ status: r.status, text: await r.text() }));

  for (const [adapterName, adapter] of ADAPTERS) {
    it(`accepts a body of exactly the limit on the ${adapterName}`, async () => {
      // Arrange
      const size = LIMIT;

      // Act
      const res = await withServer(echoApp(), adapter, baseUrl => post(baseUrl, size), {
        maxBodyBytes: LIMIT,
      });

      // Assert
      expect(res.status).toBe(200);
      expect(res.text.length).toBe(LIMIT);
    });

    it(`rejects a Content-Length one byte over the limit with 413 on the ${adapterName}`, async () => {
      // Arrange
      const size = LIMIT + 1;

      // Act
      const res = await withServer(echoApp(), adapter, baseUrl => post(baseUrl, size), {
        maxBodyBytes: LIMIT,
      });

      // Assert
      expect(res.status).toBe(STATUS_PAYLOAD_TOO_LARGE);
    });

    it(`rejects a chunked body over the limit with 413 on the ${adapterName}`, async () => {
      // Arrange
      const chunk = "x".repeat(LIMIT);
      const raw =
        "POST /echo HTTP/1.1\r\nHost: x\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n\r\n" +
        `${LIMIT.toString(16)}\r\n${chunk}\r\n${LIMIT.toString(16)}\r\n${chunk}\r\n0\r\n\r\n`;

      // Act
      const res = await withServer(echoApp(), adapter, (_baseUrl, port) => rawRequest(port, raw), {
        maxBodyBytes: LIMIT,
      });

      // Assert
      expect(res.status).toBe(STATUS_PAYLOAD_TOO_LARGE);
    });
  }
});

describe("request URL origin", () => {
  const urlOf = body => JSON.parse(body.match(/\{.*\}/)[0]).url;
  const BAD_REQUEST = 400;
  const urlApp = () =>
    Server("host")
      .get("/ready", () => json({ ok: true }))
      .get("/url", ctx => json({ url: ctx.req.url }));
  const get = (port, target, ...headerLines) =>
    rawRequest(
      port,
      [`GET ${target} HTTP/1.1`, ...headerLines, "Connection: close", "", ""].join("\r\n"),
    );

  for (const [adapterName, adapter] of ADAPTERS) {
    it(`ignores a forged Host header on the ${adapterName}`, async () => {
      // Arrange
      const forged = "Host: evil.example";

      // Act
      const res = await withServer(urlApp(), adapter, (_b, port) =>
        get(port, "/url", forged).then(r => ({ ...r, port })),
      );

      // Assert
      expect(res.status).toBe(200);
      expect(urlOf(res.body)).toBe(`http://${HOST}:${res.port}/url`);
    });

    it(`ignores a malformed Host header on the ${adapterName}`, async () => {
      // Arrange
      const malformed = "Host: not a host<>/\\@";

      // Act
      const res = await withServer(urlApp(), adapter, (_b, port) =>
        get(port, "/url", malformed).then(r => ({ ...r, port })),
      );

      // Assert
      expect(res.status).toBe(200);
      expect(urlOf(res.body)).toBe(`http://${HOST}:${res.port}/url`);
    });

    it(`never lets a duplicate Host header change the origin on the ${adapterName}`, async () => {
      // Arrange
      const headers = ["Host: a.example", "Host: b.example"];

      // Act
      const res = await withServer(urlApp(), adapter, (_b, port) =>
        get(port, "/url", ...headers).then(r => ({ ...r, port })),
      );

      // Assert
      const origin = res.status === 200 ? urlOf(res.body) : "";
      expect([BAD_REQUEST, 200]).toContain(res.status);
      expect(origin === "" || origin === `http://${HOST}:${res.port}/url`).toBe(true);
    });

    it(`answers 400 to an absolute-form request target on the ${adapterName}`, async () => {
      // Arrange
      const target = "http://evil.example/url";

      // Act
      const res = await withServer(urlApp(), adapter, (_b, port) => get(port, target, "Host: x"));

      // Assert
      expect(res.status).toBe(BAD_REQUEST);
    });

    it(`answers 400 to a request target starting with // on the ${adapterName}`, async () => {
      // Arrange
      const target = "//evil.example/url";

      // Act
      const res = await withServer(urlApp(), adapter, (_b, port) => get(port, target, "Host: x"));

      // Assert
      expect(res.status).toBe(BAD_REQUEST);
    });

    it(`builds the origin from publicOrigin when configured on the ${adapterName}`, async () => {
      // Arrange
      const publicOrigin = "https://api.example.com";

      // Act
      const res = await withServer(
        urlApp(),
        adapter,
        (_b, port) => get(port, "/url", "Host: evil.example"),
        { publicOrigin },
      );

      // Assert
      expect(urlOf(res.body)).toBe("https://api.example.com/url");
    });
  }
});

describe("review fixes", () => {
  const collectUncaught = () => {
    const seen = [];
    const listener = err => seen.push(err);
    process.on("uncaughtException", listener);
    return { seen, stop: () => process.off("uncaughtException", listener) };
  };

  for (const [adapterName, adapter] of ADAPTERS) {
    it(`a handler cancelling the request body does not crash on later chunks on the ${adapterName}`, async () => {
      // Arrange
      const uncaught = collectUncaught();
      const app = Server("cancel")
        .get("/ready", () => json({ ok: true }))
        .post("/cancel", ctx =>
          Task(async () => {
            const reader = ctx.req.body.getReader();
            await reader.read();
            await reader.cancel();
            return Ok(new Response("done"));
          }),
        );
      const head = "POST /cancel HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n";

      try {
        // Act
        const status = await withServer(
          app,
          adapter,
          (_b, port) =>
            new Promise(resolve => {
              const socket = connect(port, HOST);
              socket.on("error", () => socket.destroy());
              socket.on("close", () => resolve(0));
              socket.write(`${head}5\r\nhello\r\n`);
              void sleep(SETTLE_MS)
                .then(() => socket.write("5\r\nworld\r\n0\r\n\r\n"))
                .then(() => sleep(SETTLE_MS))
                .then(() => socket.destroy());
            }),
        );
        await sleep(SETTLE_MS);

        // Assert
        expect(status).toBe(0);
        expect(uncaught.seen.length).toBe(0);
      } finally {
        uncaught.stop();
      }
    });

    it(`an errorHandler that throws on a late body stream error is not an unhandled rejection on the ${adapterName}`, async () => {
      // Arrange
      const seen = [];
      const listener = reason => seen.push(reason);
      process.on("unhandledRejection", listener);
      const stream = new ReadableStream({
        pull(controller) {
          controller.error(new Error("boom"));
        },
      });
      const app = Server("throwing")
        .get("/ready", () => json({ ok: true }))
        .get("/boom", () => new Response(stream))
        .onError(() => {
          throw new Error("handler failed");
        });

      try {
        // Act
        await withServer(app, adapter, baseUrl =>
          fetch(`${baseUrl}/boom`, { signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) })
            .then(r => r.text())
            .catch(() => undefined),
        );
        await sleep(SETTLE_MS);

        // Assert
        expect(seen.length).toBe(0);
      } finally {
        process.off("unhandledRejection", listener);
      }
    });
  }

  it("backpressure waits leave no drain or close listeners behind", async () => {
    // Arrange
    const nodeRes = Object.assign(new EventEmitter(), {
      headersSent: false,
      destroyed: false,
      writeHead() {
        this.headersSent = true;
      },
      write() {
        void sleep(1).then(() => this.emit("drain"));
        return false;
      },
      end() {
        // Nothing to flush on the fake.
      },
    });
    const chunks = Array.from({ length: 25 }, () => new Uint8Array([1]));
    const body = new ReadableStream({
      pull(controller) {
        const next = chunks.shift();
        if (next === undefined) controller.close();
        else controller.enqueue(next);
      },
    });

    // Act
    await writeResponse(new Response(body), nodeRes);

    // Assert
    expect(nodeRes.listenerCount("close")).toBe(0);
    expect(nodeRes.listenerCount("drain")).toBe(0);
  });
});

describe("request origin", () => {
  for (const [adapterName, adapter] of ADAPTERS) {
    it(`brackets an IPv6 hostname in request.url on the ${adapterName}`, async () => {
      // Arrange
      const app = Server("origin")
        .get("/ready", () => json({ ok: true }))
        .get("/url", ctx => json({ url: ctx.req.url }));
      const server = await startServer(app, adapter, { hostname: IPV6_HOST }, `[${IPV6_HOST}]`);

      // Act
      const res = await fetch(`${server.baseUrl}/url`, {
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const { url } = await res.json();
      server.abort();
      await server.served;

      // Assert
      expect(url).toBe(`http://[${IPV6_HOST}]:${server.port}/url`);
    });
  }
});

describe("onListen", () => {
  for (const [adapterName, adapter] of ADAPTERS) {
    it(`reports the real port for port 0 and builds request.url from it on the ${adapterName}`, async () => {
      // Arrange
      const app = Server("listen").get("/url", ctx => json({ url: ctx.req.url }));
      const controller = new AbortController();
      const listening = deferred();

      // Act
      const served = app
        .serve(
          { port: 0, hostname: HOST, signal: controller.signal, onListen: listening.resolve },
          adapter,
        )
        .run();
      const address = await within(listening.promise, BOUND_MS, "onListen");
      const res = await fetch(`http://${HOST}:${address.port}/url`, {
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const { url } = await res.json();
      controller.abort();
      await served;

      // Assert
      expect(address.hostname).toBe(HOST);
      expect(address.port > 0).toBe(true);
      expect(url).toBe(`http://${HOST}:${address.port}/url`);
    });
  }

  for (const [adapterName, adapter] of ADAPTERS) {
    it(`keeps serving and settles Ok when onListen throws on the ${adapterName}`, async () => {
      // Arrange
      const app = Server("listen-throws").get("/ok", () => json({ ok: true }));
      const controller = new AbortController();
      const listening = deferred();
      const onListen = address => {
        listening.resolve(address);
        throw new Error("reporter failed");
      };

      // Act
      const served = app
        .serve({ port: 0, hostname: HOST, signal: controller.signal, onListen }, adapter)
        .run();
      const address = await within(listening.promise, BOUND_MS, "onListen");
      const res = await fetch(`http://${HOST}:${address.port}/ok`, {
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      controller.abort();
      const result = await served;

      // Assert
      expect(res.status).toBe(200);
      expect(result.isOk).toBe(true);
    });
  }

  it("is passed from listen() to the adapter", async () => {
    // Arrange
    const onListen = () => undefined;
    let received;
    const adapter = {
      serve: async (_handler, options) => {
        received = options.onListen;
      },
    };

    // Act
    await Server("listen-opts").listen({ port: 0, onListen }, adapter).execute();

    // Assert
    expect(received).toBe(onListen);
  });
});

describe("toWorkersHandler request metadata", () => {
  for (const redirect of ["manual", "error"]) {
    it(`keeps redirect ${redirect} on a request with a body`, async () => {
      // Arrange
      let seen;
      const handler = toWorkersHandler({
        fetch: async req => {
          seen = req.redirect;
          await req.text();
          return new Response("ok");
        },
      });
      const request = new Request("http://example.test/x", {
        method: "POST",
        body: "hello",
        redirect,
      });

      // Act
      await handler.fetch(request, {}, { waitUntil: () => undefined });

      // Assert
      expect(seen).toBe(redirect);
    });
  }
});

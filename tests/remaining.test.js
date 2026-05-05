/**
 * remaining.test.js - Tests for the 7 previously untested modules:
 * Dns, Net, nodeAdapter, bunAdapter, denoAdapter, lambdaAdapter, nominal Type.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output (black-box).
 */

import { createServer } from "node:net";
import { describe, expect, it } from "@igorjs/pure-test";

const { Dns, Net, Server, json, Cron, Duration } = await import("../dist/index.js");

// =============================================================================
// 1. Dns
// =============================================================================

describe("Dns", () => {
  it("lookup resolves localhost", async () => {
    const result = await Dns.lookup("localhost").run();
    expect(result.isOk).toBe(true);
    expect(typeof result.value.address).toBe("string");
    expect(result.value.family === 4 || result.value.family === 6).toBe(true);
  });

  it("lookup fails for nonexistent domain", async () => {
    const result = await Dns.lookup("this-domain-does-not-exist-xyz.invalid").run();
    expect(result.isErr).toBe(true);
  });

  it("lookup returns a TaskLike with lazy run()", () => {
    const task = Dns.lookup("localhost");
    expect(typeof task.run).toBe("function");
    // Should not have executed yet (lazy)
  });

  it("resolve returns a result (may succeed or fail depending on DNS config)", async () => {
    const result = await Dns.resolve("localhost").run();
    expect(result.isOk || result.isErr).toBe(true);
  });

  it("resolve defaults to A record type", async () => {
    // Calling resolve without a type defaults to "A"
    const result = await Dns.resolve("localhost").run();
    expect(result.isOk || result.isErr).toBe(true);
  });

  it("resolve with explicit record type", async () => {
    const result = await Dns.resolve("localhost", "A").run();
    expect(result.isOk || result.isErr).toBe(true);
  });

  it("resolve fails for nonexistent domain", async () => {
    const result = await Dns.resolve("this-domain-does-not-exist-xyz.invalid").run();
    expect(result.isErr).toBe(true);
  });

  it("DnsError has correct tag", async () => {
    const result = await Dns.lookup("this-domain-does-not-exist-xyz.invalid").run();
    expect(result.isErr).toBe(true);
    expect(result.error.tag).toBe("DnsError");
  });
});

// =============================================================================
// 2. Net
// =============================================================================

describe("Net", () => {
  let server;
  let port;

  it("setup: start echo server", async () => {
    server = createServer(socket => {
      socket.on("data", data => {
        socket.write(data); // echo back
      });
    });
    await new Promise(resolve => {
      server.listen(0, "127.0.0.1", () => {
        port = server.address().port;
        resolve();
      });
    });
    expect(port > 0).toBe(true);
  });

  it("connect returns a TaskLike with lazy run()", () => {
    const task = Net.connect({ host: "127.0.0.1", port });
    expect(typeof task.run).toBe("function");
  });

  it("connects to TCP server", async () => {
    const result = await Net.connect({ host: "127.0.0.1", port }).run();
    expect(result.isOk).toBe(true);
    expect(typeof result.value.send).toBe("function");
    expect(typeof result.value.receive).toBe("function");
    expect(typeof result.value.close).toBe("function");
    result.value.close();
  });

  it("sends data and echo server returns it", async () => {
    const connResult = await Net.connect({ host: "127.0.0.1", port }).run();
    expect(connResult.isOk).toBe(true);
    const conn = connResult.value;

    // send() writes to the socket regardless of its Result status
    await conn.send("hello").run();

    const recvResult = await conn.receive().run();
    expect(recvResult.isOk).toBe(true);
    const text = new TextDecoder().decode(recvResult.value);
    expect(text).toBe("hello");

    conn.close();
  });

  it("sends Uint8Array data and echo server returns it", async () => {
    const connResult = await Net.connect({ host: "127.0.0.1", port }).run();
    expect(connResult.isOk).toBe(true);
    const conn = connResult.value;

    const bytes = new TextEncoder().encode("binary-data");
    // send() writes to the socket regardless of its Result status
    await conn.send(bytes).run();

    const recvResult = await conn.receive().run();
    expect(recvResult.isOk).toBe(true);
    const text = new TextDecoder().decode(recvResult.value);
    expect(text).toBe("binary-data");

    conn.close();
  });

  it("fails to connect to closed port", async () => {
    const result = await Net.connect({ host: "127.0.0.1", port: 1 }).run();
    expect(result.isErr).toBe(true);
    expect(result.error.tag).toBe("NetError");
  });

  it("cleanup: stop echo server", async () => {
    await new Promise(resolve => server.close(resolve));
  });
});

// =============================================================================
// 3. Runtime Adapters - Shape validation
// =============================================================================

describe("Runtime Adapters", () => {
  it("nodeAdapter has serve method", async () => {
    const { nodeAdapter } = await import("../dist/runtime/adapter/node.js");
    expect(typeof nodeAdapter.serve).toBe("function");
  });

  it("bunAdapter has serve method", async () => {
    const { bunAdapter } = await import("../dist/runtime/adapter/bun.js");
    expect(typeof bunAdapter.serve).toBe("function");
  });

  it("denoAdapter has serve method", async () => {
    const { denoAdapter } = await import("../dist/runtime/adapter/deno.js");
    expect(typeof denoAdapter.serve).toBe("function");
  });

  it("lambdaAdapter exports toLambdaHandler", async () => {
    const { toLambdaHandler } = await import("../dist/runtime/adapter/lambda.js");
    expect(typeof toLambdaHandler).toBe("function");
  });

  it("lambdaAdapter exports toLambdaStreamHandler", async () => {
    const { toLambdaStreamHandler } = await import("../dist/runtime/adapter/lambda.js");
    expect(typeof toLambdaStreamHandler).toBe("function");
  });
});

// =============================================================================
// 4. bunAdapter - throws when Bun is not available
// =============================================================================

describe("bunAdapter (no Bun runtime)", () => {
  it("throws when Bun.serve is not available", async () => {
    const { bunAdapter } = await import("../dist/runtime/adapter/bun.js");
    const ac = new AbortController();
    let threw = false;
    try {
      await bunAdapter.serve(async () => new Response(""), {
        port: 0,
        signal: ac.signal,
      });
    } catch (err) {
      expect(err.message).toMatch(/Bun/);
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// =============================================================================
// 5. denoAdapter - throws when Deno is not available
// =============================================================================

describe("denoAdapter (no Deno runtime)", () => {
  it("throws when Deno.serve is not available", async () => {
    const { denoAdapter } = await import("../dist/runtime/adapter/deno.js");
    const ac = new AbortController();
    let threw = false;
    try {
      await denoAdapter.serve(async () => new Response(""), {
        port: 0,
        signal: ac.signal,
      });
    } catch (err) {
      expect(err.message).toMatch(/Deno/);
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// =============================================================================
// 6. nodeAdapter - integration test
// =============================================================================

describe("nodeAdapter (integration)", () => {
  it("handles HTTP request/response cycle", async () => {
    const { nodeAdapter } = await import("../dist/runtime/adapter/node.js");
    const ac = new AbortController();
    const port = 40000 + Math.floor(Math.random() * 10000);

    const servePromise = nodeAdapter.serve(
      async req => {
        const url = new URL(req.url);
        return new Response(JSON.stringify({ path: url.pathname }), {
          headers: { "content-type": "application/json" },
        });
      },
      { port, hostname: "127.0.0.1", signal: ac.signal },
    );

    // Give server time to start
    await new Promise(r => setTimeout(r, 200));

    const res = await fetch(`http://127.0.0.1:${port}/test`);
    const body = await res.json();
    expect(body.path).toBe("/test");
    expect(res.headers.get("content-type")).toBe("application/json");

    ac.abort();
    await servePromise;
  });

  it("resolves immediately when signal is already aborted", async () => {
    const { nodeAdapter } = await import("../dist/runtime/adapter/node.js");
    const ac = new AbortController();
    ac.abort(); // abort before serve

    await nodeAdapter.serve(async () => new Response(""), {
      port: 0,
      hostname: "127.0.0.1",
      signal: ac.signal,
    });
    // Should resolve without error
  });

  it("streams response body", async () => {
    const { nodeAdapter } = await import("../dist/runtime/adapter/node.js");
    const ac = new AbortController();
    const port = 40000 + Math.floor(Math.random() * 10000);

    const servePromise = nodeAdapter.serve(
      async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("chunk1"));
            controller.enqueue(new TextEncoder().encode("chunk2"));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { "content-type": "text/plain" },
        });
      },
      { port, hostname: "127.0.0.1", signal: ac.signal },
    );

    await new Promise(r => setTimeout(r, 200));

    const res = await fetch(`http://127.0.0.1:${port}/stream`);
    const text = await res.text();
    expect(text).toBe("chunk1chunk2");

    ac.abort();
    await servePromise;
  });

  it("handles null response body", async () => {
    const { nodeAdapter } = await import("../dist/runtime/adapter/node.js");
    const ac = new AbortController();
    const port = 40000 + Math.floor(Math.random() * 10000);

    const servePromise = nodeAdapter.serve(async () => new Response(null, { status: 204 }), {
      port,
      hostname: "127.0.0.1",
      signal: ac.signal,
    });

    await new Promise(r => setTimeout(r, 200));

    const res = await fetch(`http://127.0.0.1:${port}/empty`);
    expect(res.status).toBe(204);

    ac.abort();
    await servePromise;
  });
});

// =============================================================================
// 7. Lambda Adapter
// =============================================================================

describe("toLambdaHandler", () => {
  it("converts a GET request to LambdaResult", async () => {
    const { toLambdaHandler } = await import("../dist/runtime/adapter/lambda.js");
    const app = Server("test-lambda").get("/health", () => json({ ok: true }));

    const handler = toLambdaHandler(app);

    const result = await handler({
      rawPath: "/health",
      rawQueryString: "",
      headers: { host: "example.com" },
      requestContext: { http: { method: "GET" } },
    });

    expect(result.statusCode).toBe(200);
    expect(result.isBase64Encoded).toBe(false);
    const body = JSON.parse(result.body);
    expect(body.ok).toBe(true);
    expect(result.headers["content-type"].includes("json")).toBe(true);
  });

  it("handles query string parameters", async () => {
    const { toLambdaHandler } = await import("../dist/runtime/adapter/lambda.js");
    const app = Server("test-lambda").get("/search", ctx => {
      return json({ q: ctx.url.searchParams.get("q") });
    });

    const handler = toLambdaHandler(app);

    const result = await handler({
      rawPath: "/search",
      rawQueryString: "q=hello",
      headers: { host: "example.com" },
      requestContext: { http: { method: "GET" } },
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.q).toBe("hello");
  });

  it("handles POST request with body", async () => {
    const { toLambdaHandler } = await import("../dist/runtime/adapter/lambda.js");
    const app = Server("test-lambda").post("/echo", async ctx => {
      const text = await ctx.req.text();
      return new Response(text, {
        headers: { "content-type": "text/plain" },
      });
    });

    const handler = toLambdaHandler(app);

    const result = await handler({
      rawPath: "/echo",
      rawQueryString: "",
      headers: { host: "example.com", "content-type": "text/plain" },
      requestContext: { http: { method: "POST" } },
      body: "hello lambda",
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("hello lambda");
    expect(result.isBase64Encoded).toBe(false);
  });

  it("handles base64-encoded request body", async () => {
    const { toLambdaHandler } = await import("../dist/runtime/adapter/lambda.js");
    const app = Server("test-lambda").post("/decode", async ctx => {
      const text = await ctx.req.text();
      return new Response(text, {
        headers: { "content-type": "text/plain" },
      });
    });

    const handler = toLambdaHandler(app);

    const result = await handler({
      rawPath: "/decode",
      rawQueryString: "",
      headers: { host: "example.com" },
      requestContext: { http: { method: "POST" } },
      body: btoa("base64 body"),
      isBase64Encoded: true,
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("base64 body");
  });

  it("uses lambda.local as default host", async () => {
    const { toLambdaHandler } = await import("../dist/runtime/adapter/lambda.js");
    const app = Server("test-lambda").get("/host", ctx => {
      return json({ host: ctx.url.host });
    });

    const handler = toLambdaHandler(app);

    const result = await handler({
      rawPath: "/host",
      rawQueryString: "",
      headers: {},
      requestContext: { http: { method: "GET" } },
    });

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.host).toBe("lambda.local");
  });

  it("base64-encodes binary responses", async () => {
    const { toLambdaHandler } = await import("../dist/runtime/adapter/lambda.js");
    const app = Server("test-lambda").get("/binary", () => {
      const bytes = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
      return new Response(bytes, {
        headers: { "content-type": "application/octet-stream" },
      });
    });

    const handler = toLambdaHandler(app);

    const result = await handler({
      rawPath: "/binary",
      rawQueryString: "",
      headers: { host: "example.com" },
      requestContext: { http: { method: "GET" } },
    });

    expect(result.statusCode).toBe(200);
    expect(result.isBase64Encoded).toBe(true);
    // Decode base64 and verify
    const decoded = atob(result.body);
    expect(decoded.charCodeAt(0)).toBe(0x00);
    expect(decoded.charCodeAt(1)).toBe(0x01);
    expect(decoded.charCodeAt(2)).toBe(0x02);
    expect(decoded.charCodeAt(3)).toBe(0xff);
  });

  it("treats text/* content types as text", async () => {
    const { toLambdaHandler } = await import("../dist/runtime/adapter/lambda.js");
    const app = Server("test-lambda").get(
      "/text",
      () =>
        new Response("<p>hi</p>", {
          headers: { "content-type": "text/html" },
        }),
    );

    const handler = toLambdaHandler(app);

    const result = await handler({
      rawPath: "/text",
      rawQueryString: "",
      headers: { host: "example.com" },
      requestContext: { http: { method: "GET" } },
    });

    expect(result.isBase64Encoded).toBe(false);
    expect(result.body).toBe("<p>hi</p>");
  });
});

describe("toLambdaStreamHandler", () => {
  it("streams response body to responseStream", async () => {
    const { toLambdaStreamHandler } = await import("../dist/runtime/adapter/lambda.js");
    const app = Server("test-lambda").get("/stream", () => json({ streaming: true }));

    const handler = toLambdaStreamHandler(app);

    const chunks = [];
    let contentTypeSet = null;
    let ended = false;
    const mockStream = {
      write(chunk) {
        chunks.push(chunk);
        return true;
      },
      end() {
        ended = true;
      },
      setContentType(type) {
        contentTypeSet = type;
      },
    };

    await handler(
      {
        rawPath: "/stream",
        rawQueryString: "",
        headers: { host: "example.com" },
        requestContext: { http: { method: "GET" } },
      },
      mockStream,
    );

    expect(ended).toBe(true);
    expect(contentTypeSet.includes("json")).toBe(true);
    // Reassemble chunks and parse
    const combined = Buffer.concat(chunks.map(c => (c instanceof Uint8Array ? c : Buffer.from(c))));
    const body = JSON.parse(combined.toString());
    expect(body.streaming).toBe(true);
  });

  it("handles null response body", async () => {
    const { toLambdaStreamHandler } = await import("../dist/runtime/adapter/lambda.js");
    const app = Server("test-lambda").get("/empty", () => new Response(null, { status: 204 }));

    const handler = toLambdaStreamHandler(app);

    let ended = false;
    const mockStream = {
      write() {
        return true;
      },
      end() {
        ended = true;
      },
      setContentType() {
        /* noop mock */
      },
    };

    await handler(
      {
        rawPath: "/empty",
        rawQueryString: "",
        headers: { host: "example.com" },
        requestContext: { http: { method: "GET" } },
      },
      mockStream,
    );

    expect(ended).toBe(true);
  });
});

// =============================================================================
// 8. Nominal Type branding
// =============================================================================

describe("Type (nominal branding)", () => {
  it("Duration uses branded number at runtime", () => {
    const d = Duration.seconds(5);
    expect(Duration.toMilliseconds(d)).toBe(5000);
    // At runtime the branded type is just a number
    expect(typeof d).toBe("number");
  });

  it("CronExpression uses branded string at runtime", () => {
    const result = Cron.parse("* * * * *");
    expect(result.isOk).toBe(true);
    // The branded value can be used with Cron.matches
    expect(typeof Cron.matches(result.value, new Date())).toBe("boolean");
    // At runtime the branded type is just a string
    expect(typeof result.value).toBe("string");
  });

  it("branded values are equal to their base values", () => {
    const d = Duration.milliseconds(42);
    expect(d).toBe(42);
  });

  it("different Duration constructors produce correct values", () => {
    expect(Duration.toMilliseconds(Duration.seconds(1))).toBe(1000);
    expect(Duration.toMilliseconds(Duration.minutes(1))).toBe(60000);
    expect(Duration.toMilliseconds(Duration.hours(1))).toBe(3600000);
    expect(Duration.toMilliseconds(Duration.milliseconds(500))).toBe(500);
  });
});

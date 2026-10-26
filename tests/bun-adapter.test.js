// SPDX-License-Identifier: Apache-2.0
/**
 * bun-adapter.test.js - The Bun adapter's request bridge, driven through a
 * stand-in for Bun.serve so it runs on Node. The real Bun run is covered by
 * the conformance suite.
 */
import { describe, expect, it } from "@igorjs/pure-test";

const { bunAdapter } = await import("../dist/runtime/adapter/bun.js");

const LIMIT = 8;
const STATUS_BAD_REQUEST = 400;
const STATUS_TOO_LARGE = 413;
const STATUS_SERVER_ERROR = 500;

/** Start the adapter against a fake Bun.serve and hand back the fetch it registered. */
const withFakeBun = async (handler, options, fn) => {
  const controller = new AbortController();
  let registered;
  globalThis.Bun = {
    serve: serveOptions => {
      registered = serveOptions;
      return { stop: () => undefined, port: options.port, hostname: "localhost" };
    },
  };
  const served = bunAdapter.serve(handler, { port: 3000, signal: controller.signal, ...options });
  try {
    return await fn(registered.fetch);
  } finally {
    controller.abort();
    await served;
    globalThis.Bun = undefined;
  }
};

const echoUrl = async req => new Response(req.url);
const chunked = (count, bytes) =>
  new ReadableStream({
    start(controller) {
      for (let i = 0; i < count; i++) controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });

describe("bunAdapter request bridge", () => {
  it("builds request.url from the configured origin, not the Host header", async () => {
    // Arrange
    const forged = new Request("http://evil.example/a?x=1", { headers: { host: "evil.example" } });
    // Act
    const res = await withFakeBun(echoUrl, { hostname: "127.0.0.1" }, fetch => fetch(forged));
    // Assert
    expect(await res.text()).toBe("http://127.0.0.1:3000/a?x=1");
  });

  it("prefers publicOrigin over hostname and port", async () => {
    // Arrange
    const request = new Request("http://evil.example/p");
    // Act
    const res = await withFakeBun(echoUrl, { publicOrigin: "https://api.example.com" }, fetch =>
      fetch(request),
    );
    // Assert
    expect(await res.text()).toBe("https://api.example.com/p");
  });

  it("answers 400 when the request URL cannot be parsed", async () => {
    // Arrange
    const unparsable = { url: "not a url" };
    // Act
    const res = await withFakeBun(echoUrl, {}, fetch => fetch(unparsable));
    // Assert
    expect(res.status).toBe(STATUS_BAD_REQUEST);
  });

  it("passes a body under the limit through", async () => {
    // Arrange
    const handler = async req => new Response(String((await req.arrayBuffer()).byteLength));
    const request = new Request("http://x/b", { method: "POST", body: new Uint8Array(LIMIT) });
    // Act
    const res = await withFakeBun(handler, { maxBodyBytes: LIMIT }, fetch => fetch(request));
    // Assert
    expect(await res.text()).toBe(String(LIMIT));
  });

  it("answers 413 when a streamed body goes over the limit, even if the handler recovers", async () => {
    // Arrange
    const handler = async req => {
      await req.arrayBuffer().catch(() => undefined);
      return new Response("recovered");
    };
    const request = new Request("http://x/b", {
      method: "POST",
      body: chunked(4, LIMIT),
      duplex: "half",
    });
    // Act
    const res = await withFakeBun(handler, { maxBodyBytes: LIMIT }, fetch => fetch(request));
    // Assert
    expect(res.status).toBe(STATUS_TOO_LARGE);
  });

  it("answers 413 when the handler throws after the body went over the limit", async () => {
    // Arrange
    const handler = async req => {
      await req.arrayBuffer();
      return new Response("unreachable");
    };
    const request = new Request("http://x/b", {
      method: "POST",
      body: chunked(4, LIMIT),
      duplex: "half",
    });
    // Act
    const res = await withFakeBun(handler, { maxBodyBytes: LIMIT }, fetch => fetch(request));
    // Assert
    expect(res.status).toBe(STATUS_TOO_LARGE);
  });

  it("answers 500 and reports the error when the handler throws", async () => {
    // Arrange
    const seen = [];
    const handler = async () => {
      throw new Error("boom");
    };
    const onError = err => seen.push(err.message);
    // Act
    const res = await withFakeBun(handler, { onError }, fetch => fetch(new Request("http://x/e")));
    // Assert
    expect(res.status).toBe(STATUS_SERVER_ERROR);
    expect(seen).toEqual(["boom"]);
  });

  it("cancels the source body when the handler cancels the request body", async () => {
    // Arrange
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const handler = async req => {
      await req.body.cancel();
      return new Response("done");
    };
    const request = new Request("http://x/c", { method: "POST", body, duplex: "half" });
    // Act
    await withFakeBun(handler, {}, fetch => fetch(request));
    // Assert
    expect(cancelled).toBe(true);
  });

  it("brackets an IPv6 hostname in the default origin", async () => {
    // Arrange
    const request = new Request("http://x/v6");
    // Act
    const res = await withFakeBun(echoUrl, { hostname: "::1" }, fetch => fetch(request));
    // Assert
    expect(await res.text()).toBe("http://[::1]:3000/v6");
  });

  it("answers 500 instead of rejecting when the rebuilt request cannot be constructed", async () => {
    // Arrange
    const request = new Request("http://x/o");
    // Act
    const res = await withFakeBun(echoUrl, { publicOrigin: "not an origin" }, fetch =>
      fetch(request),
    );
    // Assert
    expect(res.status).toBe(STATUS_SERVER_ERROR);
  });

  it("aborts the handler's request signal when the client's signal aborts", async () => {
    // Arrange
    const client = new AbortController();
    const request = new Request("http://x/s", { signal: client.signal });
    const handler = async req => new Response(String(req.signal.aborted));
    // Act
    client.abort();
    const res = await withFakeBun(handler, {}, fetch => fetch(request));
    // Assert
    expect(await res.text()).toBe("true");
  });

  it("stops gracefully on abort, then forces after drainTimeoutMs", async () => {
    // Arrange
    const calls = [];
    globalThis.Bun = {
      serve: () => ({
        stop: force => {
          calls.push(force === true);
          return new Promise(() => undefined);
        },
        port: 3000,
        hostname: "localhost",
      }),
    };
    const controller = new AbortController();
    const served = bunAdapter.serve(echoUrl, {
      port: 3000,
      signal: controller.signal,
      drainTimeoutMs: 30,
    });
    // Act
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 5));
    const immediate = [...calls];
    await served;
    globalThis.Bun = undefined;
    // Assert
    expect(immediate).toEqual([false]);
    expect(calls).toEqual([false, true]);
  });
});

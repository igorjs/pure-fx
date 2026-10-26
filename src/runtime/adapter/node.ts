// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapter/node
 *
 * Node.js HTTP adapter implementing {@link ServerAdapter}.
 *
 * Uses dynamic `import("node:http")` so the module never hard-depends on
 * Node APIs at the type level. All node:http types are expressed
 * structurally, keeping the library free of `@types/node`.
 *
 * Supports streaming responses: when a WHATWG Response has a ReadableStream
 * body, chunks are piped to `res.write()` incrementally rather than buffered.
 */

import type { ServerAdapter } from "./types.js";

// ── Structural types for node:http (avoids @types/node) ─────────────────────

/** Subset of node:http IncomingMessage used by this adapter. */
interface NodeRequest {
  readonly method?: string | undefined;
  readonly url?: string | undefined;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  on(event: "data", cb: (chunk: Uint8Array) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (err: Error) => void): void;
}

/** Subset of node:http ServerResponse used by this adapter. */
interface NodeResponse {
  readonly headersSent: boolean;
  readonly destroyed?: boolean | undefined;
  writeHead(status: number, headers: Record<string, string | string[]>): void;
  write(chunk: Uint8Array): boolean;
  end(body?: string | Uint8Array): void;
  destroy(err?: Error): void;
  once(event: "drain" | "close", cb: () => void): void;
}

/** Subset of node:http Server used by this adapter. */
interface NodeServer {
  listen(port: number, hostname: string | undefined, cb: () => void): void;
  close(cb?: (err?: Error) => void): void;
}

/** Structural type for the `node:http` module. */
interface NodeHttpModule {
  createServer(listener: (req: NodeRequest, res: NodeResponse) => void): NodeServer;
}

const STATUS_INTERNAL_SERVER_ERROR = 500;

// ── Header conversion ───────────────────────────────────────────────────────

/**
 * Convert Node.js header record to [key, value] pairs for WHATWG Headers.
 * Multi-value headers (string[]) are joined with ", " per HTTP/1.1 spec.
 */
const convertHeaders = (
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
): [string, string][] => {
  const pairs: [string, string][] = [];
  const keys = Object.keys(headers);
  // biome-ignore lint/style/useForOf: hot-path, indexed loop avoids iterator allocation
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const val = headers[key];
    if (typeof val === "string") {
      pairs.push([key, val]);
    } else if (Array.isArray(val)) {
      pairs.push([key, val.join(", ")]);
    }
  }
  return pairs;
};

// ── Request / Response bridges ──────────────────────────────────────────────

/**
 * Build a WHATWG Request from Node.js IncomingMessage data.
 * Body chunks are streamed via ReadableStream to avoid buffering.
 */
const toRequest = (nodeReq: NodeRequest, hostname: string, port: number): Request => {
  const method = nodeReq.method ?? "GET";
  const urlStr = nodeReq.url ?? "/";
  const fullUrl = `http://${hostname}:${port}${urlStr}`;

  const hasBody = method !== "GET" && method !== "HEAD";

  const body = hasBody
    ? new ReadableStream<Uint8Array>({
        start(controller) {
          nodeReq.on("data", (chunk: Uint8Array) => {
            controller.enqueue(chunk);
          });
          nodeReq.on("end", () => {
            controller.close();
          });
          nodeReq.on("error", (err: Error) => {
            controller.error(err);
          });
        },
      })
    : undefined;

  // Node's fetch rejects a streamed body unless duplex is "half".
  const init: RequestInit & { duplex?: "half" } =
    body === undefined
      ? { method, headers: convertHeaders(nodeReq.headers) }
      : { method, headers: convertHeaders(nodeReq.headers), body, duplex: "half" };
  return new Request(fullUrl, init);
};

/** Reply 500 on a response whose headers have not been sent yet. */
const sendInternalError = (nodeRes: NodeResponse): void => {
  nodeRes.writeHead(STATUS_INTERNAL_SERVER_ERROR, { "content-type": "text/plain" });
  nodeRes.end("Internal Server Error");
};

/**
 * Write a WHATWG Response back to Node.js ServerResponse.
 * Chunks are streamed via res.write(), pausing for `drain` when the socket
 * buffer is full. A body read error sends 500 if no header has gone out yet,
 * otherwise destroys the response, then rethrows for the caller to report.
 *
 * @internal
 */
export const writeResponse = async (response: Response, nodeRes: NodeResponse): Promise<void> => {
  // Headers are written with the first chunk so a failure before it can still become a 500.
  const sendHead = (): void => {
    if (nodeRes.headersSent) return;
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headers[k] = v;
    });
    nodeRes.writeHead(response.status, headers);
  };

  if (response.body === null) {
    sendHead();
    nodeRes.end();
    return;
  }

  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      sendHead();
      if (done) {
        nodeRes.end();
        return;
      }
      if (nodeRes.destroyed === true) {
        await reader.cancel();
        return;
      }
      if (!nodeRes.write(value)) {
        await new Promise<void>(resolve => {
          nodeRes.once("drain", resolve);
          nodeRes.once("close", resolve);
        });
      }
    }
  } catch (err: unknown) {
    if (nodeRes.headersSent) {
      nodeRes.destroy(err instanceof Error ? err : undefined);
    } else {
      sendInternalError(nodeRes);
    }
    throw err;
  }
};

// ── Adapter ─────────────────────────────────────────────────────────────────

/**
 * Node.js HTTP server adapter.
 *
 * Dynamically imports `node:http` so the module can be type-checked
 * without Node-specific lib references. Pass this to `Server.listen()`
 * to run on Node.js with streaming support.
 *
 * @example
 * ```ts
 * import { Server, json } from "@igorjs/pure-fx";
 * import { nodeAdapter } from "@igorjs/pure-fx/runtime/adapter/node";
 *
 * const app = Server("api")
 *   .get("/health", () => json({ ok: true }))
 *   .listen({ port: 3000 }, nodeAdapter);
 *
 * await app.run();
 * ```
 */
export const nodeAdapter: ServerAdapter = {
  async serve(handler, options) {
    const http: NodeHttpModule = await (Function(
      "return import('node:http')",
    )() as Promise<NodeHttpModule>);

    await new Promise<void>((resolve, reject) => {
      const hostname = options.hostname ?? "localhost";

      const server = http.createServer((nodeReq, nodeRes) => {
        const request = toRequest(nodeReq, hostname, options.port);
        void handler(request)
          .then(
            response => writeResponse(response, nodeRes),
            () => sendInternalError(nodeRes),
          )
          .catch((err: unknown) => options.onError?.(err, request));
      });

      const onAbort = (): void => {
        server.close(err => {
          if (err !== undefined) {
            reject(err);
          } else {
            resolve();
          }
        });
      };

      if (options.signal.aborted) {
        resolve();
        return;
      }

      options.signal.addEventListener("abort", onAbort);
      server.listen(options.port, options.hostname, () => {
        // Server is listening
      });
    });
  },
};

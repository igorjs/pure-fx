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
  writeHead(status: number, headers: Record<string, string>): void;
  write(chunk: Uint8Array): boolean;
  end(body?: string | Uint8Array): void;
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

  return new Request(fullUrl, {
    method,
    headers: convertHeaders(nodeReq.headers),
    body,
  });
};

/**
 * Write a WHATWG Response back to Node.js ServerResponse.
 * When the body is a ReadableStream, chunks are streamed via res.write().
 */
const writeResponse = async (response: Response, nodeRes: NodeResponse): Promise<void> => {
  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headers[k] = v;
  });
  nodeRes.writeHead(response.status, headers);

  if (response.body === null) {
    nodeRes.end();
    return;
  }

  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      nodeRes.end();
      return;
    }
    nodeRes.write(value);
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
 * import { Server, json } from "@igorjs/pure-ts";
 * import { nodeAdapter } from "@igorjs/pure-ts/runtime/adapter/node";
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
        void handler(request).then(
          response => writeResponse(response, nodeRes),
          () => {
            nodeRes.writeHead(500, { "content-type": "text/plain" });
            nodeRes.end("Internal Server Error");
          },
        );
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

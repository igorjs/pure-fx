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

import { toListenError } from "./listen-error.js";
import { DEFAULT_MAX_BODY_BYTES, type ServerAdapter } from "./types.js";

// ── Structural types for node:http (avoids @types/node) ─────────────────────

/** Subset of node:http IncomingMessage used by this adapter. */
interface NodeRequest {
  readonly method?: string | undefined;
  readonly url?: string | undefined;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  on(event: "data", cb: (chunk: Uint8Array) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  pause(): void;
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
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "connection", cb: (socket: NodeSocket) => void): void;
  closeAllConnections?(): void;
  closeIdleConnections?(): void;
}

/** Subset of net.Socket used to force-close connections. */
interface NodeSocket {
  destroy(): void;
  once(event: "close", cb: () => void): void;
}

/** Structural type for the `node:http` module. */
interface NodeHttpModule {
  createServer(listener: (req: NodeRequest, res: NodeResponse) => void): NodeServer;
}

const STATUS_BAD_REQUEST = 400;
const STATUS_PAYLOAD_TOO_LARGE = 413;
const STATUS_INTERNAL_SERVER_ERROR = 500;
const SET_COOKIE = "set-cookie";

/** Default ms in-flight requests get to finish after shutdown starts. */
const DEFAULT_DRAIN_TIMEOUT_MS = 10_000;

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

/** Tracks whether a request body went over the size limit while streaming. */
interface BodyLimit {
  exceeded: boolean;
}

/** True when the request target is origin-form (`/path`) and not protocol-relative (`//host`). */
const isOriginForm = (target: string): boolean =>
  target.startsWith("/") && !target.startsWith("//");

/** True when a declared Content-Length is already over the limit. */
const declaresOversizeBody = (nodeReq: NodeRequest, maxBodyBytes: number): boolean => {
  const declared = nodeReq.headers["content-length"];
  return typeof declared === "string" && Number(declared) > maxBodyBytes;
};

/**
 * Build a WHATWG Request from Node.js IncomingMessage data.
 * Body chunks are streamed via ReadableStream to avoid buffering. Once more than
 * `maxBodyBytes` have arrived the stream errors, reading stops and `limit.exceeded` is set.
 */
const toRequest = (
  nodeReq: NodeRequest,
  origin: string,
  maxBodyBytes: number,
  limit: BodyLimit,
): Request => {
  const method = nodeReq.method ?? "GET";
  const fullUrl = `${origin}${nodeReq.url ?? "/"}`;

  const hasBody = method !== "GET" && method !== "HEAD";

  const body = hasBody
    ? new ReadableStream<Uint8Array>({
        start(controller) {
          let received = 0;
          nodeReq.on("data", (chunk: Uint8Array) => {
            if (limit.exceeded) return;
            received += chunk.byteLength;
            if (received > maxBodyBytes) {
              limit.exceeded = true;
              nodeReq.pause();
              controller.error(new Error(`Request body exceeds ${maxBodyBytes} bytes`));
              return;
            }
            controller.enqueue(chunk);
          });
          nodeReq.on("end", () => {
            if (!limit.exceeded) controller.close();
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

/** Reply with a plain-text status on a response whose headers have not been sent yet. */
const sendPlain = (nodeRes: NodeResponse, status: number, message: string): void => {
  // Closing the connection also drops any unread request body.
  nodeRes.writeHead(status, { "content-type": "text/plain", connection: "close" });
  nodeRes.end(message);
};

/** Reply 500 on a response whose headers have not been sent yet. */
const sendInternalError = (nodeRes: NodeResponse): void => {
  sendPlain(nodeRes, STATUS_INTERNAL_SERVER_ERROR, "Internal Server Error");
};

/** Reply 413 unless the handler already started its response. */
const sendPayloadTooLarge = (nodeRes: NodeResponse): void => {
  if (nodeRes.headersSent) {
    nodeRes.destroy();
    return;
  }
  sendPlain(nodeRes, STATUS_PAYLOAD_TOO_LARGE, "Payload Too Large");
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
    const headers: Record<string, string | string[]> = {};
    response.headers.forEach((v, k) => {
      if (k !== SET_COOKIE) headers[k] = v;
    });
    // forEach joins Set-Cookie values into one line, which breaks the cookies.
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) headers[SET_COOKIE] = cookies;
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
      const origin = options.publicOrigin ?? `http://${hostname}:${options.port}`;
      const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
      const drainTimeoutMs = options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;
      const sockets = new Set<NodeSocket>();
      let draining = false;

      const server = http.createServer((nodeReq, nodeRes) => {
        nodeRes.once("close", () => {
          // A keep-alive connection that just finished its request would otherwise hold close() open.
          if (draining) server.closeIdleConnections?.();
        });
        // The Host header is never used, so a request target that could redirect the origin is refused.
        if (!isOriginForm(nodeReq.url ?? "/")) {
          sendPlain(nodeRes, STATUS_BAD_REQUEST, "Bad Request");
          return;
        }
        if (declaresOversizeBody(nodeReq, maxBodyBytes)) {
          sendPayloadTooLarge(nodeRes);
          return;
        }
        const limit: BodyLimit = { exceeded: false };
        const request = toRequest(nodeReq, origin, maxBodyBytes, limit);
        void handler(request)
          .then(
            response =>
              limit.exceeded ? sendPayloadTooLarge(nodeRes) : writeResponse(response, nodeRes),
            () => (limit.exceeded ? sendPayloadTooLarge(nodeRes) : sendInternalError(nodeRes)),
          )
          .catch((err: unknown) => options.onError?.(err, request));
      });

      server.on("connection", socket => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
      });

      // Without a listener, a bind failure such as EADDRINUSE crashes the process.
      server.on("error", err => {
        options.signal.removeEventListener("abort", onAbort);
        reject(toListenError(options.port, err));
      });

      const forceCloseConnections = (): void => {
        if (server.closeAllConnections !== undefined) {
          server.closeAllConnections();
          return;
        }
        for (const socket of sockets) socket.destroy();
      };

      // close() stops accepting and resolves once every connection has ended;
      // connections still open after the drain timeout are cut off.
      function onAbort(): void {
        draining = true;
        const timer = setTimeout(forceCloseConnections, drainTimeoutMs);
        server.close(err => {
          clearTimeout(timer);
          if (err !== undefined) {
            reject(err);
          } else {
            resolve();
          }
        });
      }

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

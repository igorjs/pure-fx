// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapter/bun
 *
 * Bun HTTP adapter implementing {@link ServerAdapter}.
 *
 * Uses `Bun.serve()` which natively accepts a WHATWG fetch handler.
 * All Bun types are expressed structurally so the module compiles
 * without Bun-specific type declarations.
 *
 * Two usage modes:
 * 1. **Via adapter**: `app.listen({ port: 3000 }, bunAdapter)` for
 *    Program lifecycle integration (signals, logging, graceful shutdown).
 * 2. **Direct**: `Bun.serve({ fetch: app.fetch })` when Program is not needed.
 */

import { toListenError } from "./listen-error.js";
import { DEFAULT_MAX_BODY_BYTES, type ServerAdapter } from "./types.js";

// ── Structural types for Bun.serve (avoids @types/bun) ──────────────────────

/**
 * Subset of Bun.ServeOptions used by this adapter.
 * Matches Bun's API without importing Bun-specific type declarations.
 */
interface BunServeOptions {
  readonly port: number;
  readonly hostname?: string;
  readonly maxRequestBodySize: number;
  readonly fetch: (request: Request) => Response | Promise<Response>;
}

/**
 * Subset of the Bun.Server returned by Bun.serve().
 * The `stop` method shuts down the server.
 */
interface BunServer {
  readonly stop: (closeActiveConnections?: boolean) => void | Promise<void>;
  readonly port: number;
  readonly hostname: string;
}

/** Structural type for the Bun.serve() function. */
type BunServeFn = (options: BunServeOptions) => BunServer;

// ── Request bridge ──────────────────────────────────────────────────────────

const STATUS_BAD_REQUEST = 400;
const STATUS_PAYLOAD_TOO_LARGE = 413;
const STATUS_INTERNAL_SERVER_ERROR = 500;
const DEFAULT_DRAIN_TIMEOUT_MS = 10_000;

/** Tracks whether a request body went over the size limit while streaming. */
interface BodyLimit {
  exceeded: boolean;
}

/** Pass chunks through, erroring the stream once more than `maxBodyBytes` have arrived. */
const limitBody = (
  body: ReadableStream<Uint8Array>,
  maxBodyBytes: number,
  limit: BodyLimit,
): ReadableStream<Uint8Array> => {
  const reader = body.getReader();
  let received = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      received += value.byteLength;
      if (received > maxBodyBytes) {
        limit.exceeded = true;
        controller.error(new Error(`Request body exceeds ${maxBodyBytes} bytes`));
        await reader.cancel();
        return;
      }
      controller.enqueue(value);
    },
    cancel: reason => reader.cancel(reason),
  });
};

/**
 * Rebuild the request on the configured origin, so the Host header never decides
 * `request.url`, with the body capped at `maxBodyBytes`. Returns undefined when
 * Bun could not parse the request URL.
 */
const toRequest = (
  request: Request,
  origin: string,
  maxBodyBytes: number,
  limit: BodyLimit,
): Request | undefined => {
  let parsed: URL;
  try {
    parsed = new URL(request.url);
  } catch {
    return undefined;
  }
  const target = `${origin}${parsed.pathname}${parsed.search}`;
  const { method, headers, signal } = request;
  // Bun's fetch rejects a streamed body unless duplex is "half".
  const init: RequestInit & { duplex?: "half" } =
    request.body === null
      ? { method, headers, signal }
      : {
          method,
          headers,
          signal,
          body: limitBody(request.body, maxBodyBytes, limit),
          duplex: "half",
        };
  return new Request(target, init);
};

/** Wrap an IPv6 literal in brackets so it forms a valid URL authority. */
const toUrlHost = (hostname: string): string =>
  hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;

const plain = (status: number, message: string): Response =>
  new Response(message, { status, headers: { "content-type": "text/plain" } });

// ── Adapter ─────────────────────────────────────────────────────────────────

/**
 * Bun HTTP server adapter.
 *
 * Uses `Bun.serve()` which accepts a standard WHATWG fetch handler.
 * Streaming responses work natively since Bun handles ReadableStream
 * bodies without any conversion.
 *
 * Pass this to `Server.listen()` to run on Bun with Program lifecycle
 * management (SIGINT/SIGTERM handling, structured logging, exit codes).
 *
 * @example
 * ```ts
 * import { Server, json } from "@igorjs/pure-fx";
 * import { bunAdapter } from "@igorjs/pure-fx/runtime/adapter/bun";
 *
 * const app = Server("api")
 *   .get("/health", () => json({ ok: true }))
 *   .listen({ port: 3000 }, bunAdapter);
 *
 * await app.run();
 * ```
 *
 * For simpler cases where Program lifecycle is not needed:
 * ```ts
 * Bun.serve({ fetch: app.fetch, port: 3000 });
 * ```
 */
export const bunAdapter: ServerAdapter = {
  async serve(handler, options) {
    // Why: globalThis doesn't declare Bun. Structural typing avoids @types/bun dependency.
    const bunGlobal = globalThis as unknown as {
      Bun?: { serve?: BunServeFn };
    };

    if (bunGlobal.Bun?.serve === undefined) {
      throw new Error(
        "Bun.serve is not available. The bunAdapter requires Bun. " +
          "For Node.js, use nodeAdapter or the default .listen() behavior. ",
      );
    }

    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    const origin =
      options.publicOrigin ??
      `http://${toUrlHost(options.hostname ?? "localhost")}:${options.port}`;

    // Bun's own cap does not stop a chunked body, so the stream is counted here too.
    const serveOptions: BunServeOptions = {
      port: options.port,
      maxRequestBodySize: maxBodyBytes,
      fetch: async bunRequest => {
        const limit: BodyLimit = { exceeded: false };
        let request: Request | undefined;
        try {
          request = toRequest(bunRequest, origin, maxBodyBytes, limit);
          if (request === undefined) return plain(STATUS_BAD_REQUEST, "Bad Request");
          const response = await handler(request);
          return limit.exceeded ? plain(STATUS_PAYLOAD_TOO_LARGE, "Payload Too Large") : response;
        } catch (err: unknown) {
          if (limit.exceeded) return plain(STATUS_PAYLOAD_TOO_LARGE, "Payload Too Large");
          options.onError?.(err, request ?? bunRequest);
          return plain(STATUS_INTERNAL_SERVER_ERROR, "Internal Server Error");
        }
      },
    };

    // Only set hostname when provided (exactOptionalPropertyTypes)
    if (options.hostname !== undefined) {
      (serveOptions as { hostname: string }).hostname = options.hostname;
    }

    let server: BunServer;
    try {
      server = bunGlobal.Bun.serve(serveOptions);
    } catch (err: unknown) {
      throw toListenError(options.port, err);
    }

    const drainTimeoutMs = options.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;

    // Stop accepting, let in-flight requests finish, and cut the rest off after the drain timeout.
    const shutdown = async (): Promise<void> => {
      let resolveExpired: () => void = () => undefined;
      const expired = new Promise<void>(resolve => {
        resolveExpired = resolve;
      });
      const timer = setTimeout(resolveExpired, drainTimeoutMs);
      try {
        await Promise.race([Promise.resolve(server.stop()), expired]);
      } finally {
        clearTimeout(timer);
        void server.stop(true);
      }
    };

    if (options.signal.aborted) {
      void server.stop(true);
      return;
    }
    await new Promise<void>(resolve => {
      options.signal.addEventListener("abort", () => resolve());
    });
    await shutdown();
  },
};

// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapter/workers
 *
 * Cloudflare Workers adapter for the pure-fx server module.
 *
 * {@link toWorkersHandler} turns a server into the `{ fetch(request, env, ctx) }`
 * object a Worker module exports. Workers types are structural, so the module
 * needs no `@cloudflare/workers-types` and no Node built-ins.
 *
 * Handlers read the Worker bindings with {@link workersEnv} and the execution
 * context with {@link workersContext}, both keyed by the incoming request.
 */

import { type BodyLimit, limitBodyStream, payloadTooLarge, plain } from "./body-limit.js";
import { DEFAULT_MAX_BODY_BYTES } from "./types.js";

// ── Structural types (zero deps, no @cloudflare/workers-types) ──────────────

/** Subset of the Workers ExecutionContext used by handlers. */
export interface WorkersExecutionContext {
  /** Keep the Worker alive until the promise settles. */
  waitUntil(promise: Promise<unknown>): void;
  /** Fall through to the origin if the Worker throws. */
  passThroughOnException(): void;
}

/** The module shape Cloudflare Workers expects as the default export. */
export interface WorkersHandler<Env = Record<string, unknown>> {
  fetch(request: Request, env: Env, ctx: WorkersExecutionContext): Promise<Response>;
}

/** Anything with a WHATWG fetch handler, such as the result of `Server(...)`. */
export interface WorkersApp {
  readonly fetch: (request: Request) => Promise<Response>;
}

/** Options for {@link toWorkersHandler}. */
export interface WorkersOptions {
  /** Max request body bytes before the request fails with 413 (default 1 MiB). */
  readonly maxBodyBytes?: number | undefined;
}

// ── Constants ───────────────────────────────────────────────────────────────

const STATUS_INTERNAL_SERVER_ERROR = 500;

// ── Per-request bindings ────────────────────────────────────────────────────

interface Bindings {
  readonly env: unknown;
  readonly ctx: WorkersExecutionContext;
}

// Keyed by request so bindings live exactly as long as the request does.
const bindingsByRequest = new WeakMap<Request, Bindings>();

const bindingsOf = (request: Request): Bindings => {
  const bindings = bindingsByRequest.get(request);
  if (bindings === undefined) {
    throw new Error("No Workers bindings for this request. Was it handled by toWorkersHandler?");
  }
  return bindings;
};

/** The Worker bindings (`env`) for a request handled by {@link toWorkersHandler}. */
export const workersEnv = <Env = Record<string, unknown>>(request: Request): Env =>
  bindingsOf(request).env as Env;

/** The Worker execution context for a request handled by {@link toWorkersHandler}. */
export const workersContext = (request: Request): WorkersExecutionContext =>
  bindingsOf(request).ctx;

// ── Body limit ──────────────────────────────────────────────────────────────

/** True when a declared Content-Length is already over the limit. */
const declaresOversizeBody = (request: Request, maxBodyBytes: number): boolean => {
  const declared = request.headers.get("content-length");
  return declared !== null && Number(declared) > maxBodyBytes;
};

/**
 * Rebuild the request with a body that errors once more than `maxBodyBytes`
 * have been read, setting `limit.exceeded`. Bodyless requests pass through.
 */
const limitBody = (request: Request, maxBodyBytes: number, limit: BodyLimit): Request => {
  if (request.body === null) return request;
  const counted = limitBodyStream(request.body, maxBodyBytes, limit);
  // The lib Request type omits `redirect`, though every runtime exposes it.
  const { cf, redirect } = request as Request & { cf?: unknown; redirect: string };
  const init: RequestInit & { duplex: "half"; redirect: string; cf?: unknown } = {
    method: request.method,
    headers: request.headers,
    redirect,
    signal: request.signal,
    body: counted,
    duplex: "half",
    ...(cf === undefined ? {} : { cf }),
  };
  const rebuilt = new Request(request.url, init) as Request & { cf?: unknown };
  // workerd takes cf from the init and makes it read-only; other runtimes ignore it.
  if (cf !== undefined && rebuilt.cf === undefined) {
    Object.defineProperty(rebuilt, "cf", { value: cf, enumerable: true });
  }
  return rebuilt;
};

// ── Adapter ─────────────────────────────────────────────────────────────────

/**
 * Wrap a server as a Cloudflare Workers module handler.
 *
 * Workers has no per-route body limit, so `maxBodyBytes` is enforced here from
 * the Content-Length header and again while the body streams. An unexpected
 * failure becomes a plain 500 that never exposes the error message.
 *
 * @example
 * ```ts
 * import { Server, json } from "@igorjs/pure-fx";
 * import { toWorkersHandler, workersEnv } from "@igorjs/pure-fx/runtime/adapter/workers";
 *
 * const app = Server("api").get("/hello", ctx =>
 *   json({ greeting: workersEnv<{ GREETING: string }>(ctx.req).GREETING }),
 * );
 *
 * export default toWorkersHandler(app);
 * ```
 */
export const toWorkersHandler = <Env = Record<string, unknown>>(
  app: WorkersApp,
  options: WorkersOptions = {},
): WorkersHandler<Env> => {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return {
    async fetch(request, env, ctx) {
      if (declaresOversizeBody(request, maxBodyBytes)) {
        return payloadTooLarge();
      }
      const limit: BodyLimit = { exceeded: false };
      const limited = limitBody(request, maxBodyBytes, limit);
      bindingsByRequest.set(limited, { env, ctx });
      try {
        const response = await app.fetch(limited);
        return limit.exceeded ? payloadTooLarge() : response;
      } catch {
        return limit.exceeded
          ? payloadTooLarge()
          : plain(STATUS_INTERNAL_SERVER_ERROR, "Internal Server Error");
      }
    },
  };
};

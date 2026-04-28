/**
 * @module io/net
 *
 * Cross-runtime TCP client returning Task instead of throwing.
 *
 * **Why wrap TCP?**
 * Raw TCP sockets are runtime-specific with no web standard equivalent.
 * This module uses the TcpClient adapter from runtime/adapters which
 * normalises Deno and Node/Bun TCP APIs behind a single interface.
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import { Err, Ok } from "../core/result.js";
import { resolveTcpClient } from "../runtime/adapters/net-adapter.js";
import type { TcpClient } from "../runtime/adapters/types.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** TCP connection or communication failed. */
export const NetError: ErrTypeConstructor<"NetError", string> = ErrType("NetError");

// ── TCP connection ──────────────────────────────────────────────────────────

/** A connected TCP socket with send, receive, and close operations. */
export interface TcpConnection {
  readonly send: (data: string | Uint8Array) => TaskLike<void, ErrType<"NetError">>;
  readonly receive: () => TaskLike<Uint8Array, ErrType<"NetError">>;
  readonly close: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const toErr = (e: unknown, meta?: Record<string, unknown>): ErrType<"NetError", string> =>
  NetError(e instanceof Error ? e.message : String(e), meta);

const NO_TCP = "TCP connections are not available in this runtime";

let cachedClient: TcpClient | null | undefined;

const getClient = async (): Promise<TcpClient | null> => {
  if (cachedClient !== undefined) return cachedClient;
  cachedClient = await resolveTcpClient();
  return cachedClient;
};

const wrapSocket = (raw: import("../runtime/adapters/types.js").TcpSocket): TcpConnection => ({
  send: (data: string | Uint8Array): TaskLike<void, ErrType<"NetError">> =>
    makeTask(async () => {
      try {
        await raw.send(data);
        return Ok(undefined);
      } catch (e) {
        return Err(toErr(e));
      }
    }),
  receive: (): TaskLike<Uint8Array, ErrType<"NetError">> =>
    makeTask(async () => {
      try {
        return Ok(await raw.receive());
      } catch (e) {
        return Err(toErr(e));
      }
    }),
  close: () => raw.close(),
});

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Cross-runtime TCP client.
 *
 * @example
 * ```ts
 * const conn = await Net.connect({ host: '127.0.0.1', port: 8080 }).run();
 * if (conn.isOk) {
 *   await conn.value.send('hello').run();
 *   const data = await conn.value.receive().run();
 *   conn.value.close();
 * }
 * ```
 */
export const Net: {
  /** Connect to a TCP host and port. */
  readonly connect: (options: {
    host: string;
    port: number;
  }) => TaskLike<TcpConnection, ErrType<"NetError">>;
} = {
  connect: (options: {
    host: string;
    port: number;
  }): TaskLike<TcpConnection, ErrType<"NetError">> =>
    makeTask(async () => {
      const client = await getClient();
      if (client === null) return Err(NetError(NO_TCP));
      try {
        const socket = await client.connect(options);
        return Ok(wrapSocket(socket));
      } catch (e) {
        return Err(toErr(e, { host: options.host, port: options.port }));
      }
    }),
};

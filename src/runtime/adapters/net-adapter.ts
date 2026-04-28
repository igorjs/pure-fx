/**
 * @module runtime/adapters/net-adapter
 *
 * TCP client adapter implementations for Deno and Node/Bun.
 */

import { getDeno, importNode } from "./detect.js";
import type { TcpClient, TcpSocket } from "./types.js";

// ── Node structural types ───────────────────────────────────────────────────

interface NodeSocket {
  write(data: string | Uint8Array, cb?: (err?: Error) => void): boolean;
  on(event: "data", cb: (data: Uint8Array) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: () => void): void;
  once(event: "connect", cb: () => void): void;
  destroy(): void;
}

interface NodeNet {
  createConnection(options: { host: string; port: number }): NodeSocket;
}

const getNodeNet = importNode<NodeNet>("node:net");

// ── Deno adapter ────────────────────────────────────────────────────────────

const createDenoTcpClient = (): TcpClient | undefined => {
  const deno = getDeno();
  if (deno?.connect === undefined) return undefined;

  return {
    connect: async options => {
      const conn = await deno.connect!({ hostname: options.host, port: options.port });
      const socket: TcpSocket = {
        send: async data => {
          const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
          await conn.write(bytes);
        },
        receive: async () => {
          const buf = new Uint8Array(4096);
          const n = await conn.read(buf);
          if (n === null) throw new Error("Connection closed");
          return buf.subarray(0, n);
        },
        close: () => conn.close(),
      };
      return socket;
    },
  };
};

// ── Node/Bun adapter ────────────────────────────────────────────────────────

const createNodeTcpClient = async (): Promise<TcpClient | null> => {
  const net = await getNodeNet();
  if (net === null) return null;

  return {
    connect: options =>
      new Promise<TcpSocket>((resolve, reject) => {
        const raw = net.createConnection({ host: options.host, port: options.port });
        raw.once("connect", () => {
          const socket: TcpSocket = {
            send: data =>
              new Promise<void>((res, rej) => {
                raw.write(data, (err?: Error) => {
                  if (err !== undefined) rej(err);
                  else res();
                });
              }),
            receive: () =>
              new Promise<Uint8Array>((res, rej) => {
                raw.on("data", chunk => res(chunk));
                raw.on("error", err => rej(err));
                raw.on("close", () => rej(new Error("Connection closed")));
              }),
            close: () => raw.destroy(),
          };
          resolve(socket);
        });
        raw.on("error", reject);
      }),
  };
};

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the TCP client adapter for the current runtime. */
export const resolveTcpClient = async (): Promise<TcpClient | null> => {
  const deno = createDenoTcpClient();
  if (deno !== undefined) return deno;
  return createNodeTcpClient();
};

// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapters/net-adapter
 *
 * TCP client adapter implementations for Node/Bun.
 */

import { importNode } from "./detect.js";
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

const getNodeNet = importNode<NodeNet>("net");

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
export const resolveTcpClient = (): Promise<TcpClient | null> => createNodeTcpClient();

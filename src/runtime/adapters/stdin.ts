// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapters/stdin
 *
 * Stdin/stdout adapter implementations for Node/Bun.
 */

import { getNodeProcess, importNode } from "./detect.js";
import type { Stdin, Stdout } from "./types.js";

// ── Node structural types ───────────────────────────────────────────────────

interface NodeReadlineModule {
  createInterface(opts: { input: unknown; output?: unknown; terminal?: boolean }): {
    question(query: string, cb: (answer: string) => void): void;
    close(): void;
    on(event: string, cb: (...args: readonly unknown[]) => void): unknown;
  };
}

const getNodeReadline = importNode<NodeReadlineModule>("node:readline");

// ── Node/Bun stdin adapter ──────────────────────────────────────────────────

const createNodeStdin = (): Stdin | undefined => {
  const proc = getNodeProcess();
  if (proc === undefined) return undefined;

  const base: Stdin = {
    isTTY: proc.stdin.isTTY === true,

    readLine: async prompt => {
      const rl = await getNodeReadline();
      if (rl === null) return null;

      const iface = rl.createInterface({
        input: proc.stdin,
        output: proc.stdout,
        terminal: proc.stdin.isTTY === true,
      });

      return new Promise<string | null>(resolve => {
        let settled = false;
        iface.question(prompt, answer => {
          if (!settled) {
            settled = true;
            iface.close();
            resolve(answer);
          }
        });
        iface.on("close", () => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        });
      });
    },

    readAll: async () => {
      if (proc.stdin.isTTY === true) return "";

      if (proc.stdin.setEncoding !== undefined) proc.stdin.setEncoding("utf8");
      proc.stdin.resume();

      const chunks: string[] = [];

      return new Promise<string>((resolve, reject) => {
        proc.stdin.on("data", (chunk: unknown) => chunks.push(String(chunk)));
        proc.stdin.on("end", () => resolve(chunks.join("")));
        proc.stdin.on("error", (err: unknown) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        );
      });
    },

    onData: cb => {
      const handler = (chunk: unknown): void => cb(String(chunk));
      proc.stdin.on("data", handler);
      return () => proc.stdin.removeListener("data", handler);
    },
  };

  if (proc.stdin.setRawMode !== undefined) {
    base.setRawMode = mode => {
      proc.stdin.setRawMode!(mode);
      if (mode) {
        if (proc.stdin.setEncoding !== undefined) proc.stdin.setEncoding("utf8");
        proc.stdin.resume();
      } else {
        proc.stdin.pause();
      }
    };
  }

  return base;
};

// ── Stdout adapters ─────────────────────────────────────────────────────────

const createNodeStdout = (): Stdout | undefined => {
  const proc = getNodeProcess();
  if (proc === undefined) return undefined;

  return {
    write: text => proc.stdout.write(text),
    columns: proc.stdout.columns,
    rows: proc.stdout.rows,
  };
};

const createNodeStderr = (): Stdout | undefined => {
  const proc = getNodeProcess();
  if (proc === undefined) return undefined;
  return { write: text => proc.stderr.write(text) };
};

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the stdin adapter for the current runtime. */
export const resolveStdin = (): Stdin | undefined => createNodeStdin();

/** Resolve the stdout adapter for the current runtime. */
export const resolveStdout = (): Stdout | undefined => createNodeStdout();

/** Resolve the stderr adapter for the current runtime. */
export const resolveStderr = (): Stdout | undefined => createNodeStderr();

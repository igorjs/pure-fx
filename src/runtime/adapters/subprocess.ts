// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapters/subprocess
 *
 * Subprocess adapter implementations for Bun and Node.
 */

import { importNode } from "./detect.js";
import type { Subprocess, SubprocessOptions, SubprocessResult } from "./types.js";

// ── Bun structural types ────────────────────────────────────────────────────

interface BunSpawnSyncResult {
  readonly exitCode: number;
  readonly stdout: { toString(): string };
  readonly stderr: { toString(): string };
}

interface BunChild {
  readonly stdin?: {
    write(data: string): unknown;
    end(): unknown;
  };
  readonly exitCode: number | null;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  kill(): void;
}

interface BunGlobal {
  spawnSync(
    cmd: readonly string[],
    opts?: { cwd?: string; env?: Record<string, string> },
  ): BunSpawnSyncResult;
  spawn(
    cmd: readonly string[],
    opts?: {
      cwd?: string;
      env?: Record<string, string>;
      stdin?: "pipe";
      stdout?: "pipe" | "inherit";
      stderr?: "pipe" | "inherit";
    },
  ): BunChild;
}

// ── Node structural types ───────────────────────────────────────────────────

interface NodeChildProcess {
  execFile(
    cmd: string,
    args: readonly string[],
    options: { cwd?: string; env?: Record<string, string>; timeout?: number },
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ): void;
  spawn(
    cmd: string,
    args: readonly string[],
    options: { cwd?: string; env?: Record<string, string> },
  ): NodeChild;
}

interface NodeChild {
  readonly pid?: number | undefined;
  readonly stdin: {
    write(data: string, encoding?: string): boolean;
    end(): void;
    on(event: "error", cb: (err: Error) => void): unknown;
  } | null;
  readonly stdout: {
    on(event: "data", cb: (chunk: { toString(): string }) => void): unknown;
  } | null;
  readonly stderr: {
    on(event: "data", cb: (chunk: { toString(): string }) => void): unknown;
  } | null;
  on(event: "close", cb: (code: number | null) => void): unknown;
  on(event: "error", cb: (err: Error) => void): unknown;
  on(event: "spawn", cb: () => void): unknown;
  kill(signal?: string): boolean;
  unref?(): void;
}

const getNodeCp = importNode<NodeChildProcess>("child_process");

// ── Helpers ─────────────────────────────────────────────────────────────────

const buildOpts = (options: SubprocessOptions): { cwd?: string; env?: Record<string, string> } => {
  const result: { cwd?: string; env?: Record<string, string> } = {};
  if (options.cwd !== undefined) result.cwd = options.cwd;
  if (options.env !== undefined) result.env = options.env;
  return result;
};

const raceTimeout = <T>(
  promise: Promise<T>,
  ms: number | undefined,
  cleanup: () => void,
): Promise<T> => {
  if (ms === undefined) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Command timed out after ${ms}ms`));
    }, ms);
    promise.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      e => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
};

// ── Bun adapter ─────────────────────────────────────────────────────────────

const getBun = (): BunGlobal | undefined => (globalThis as unknown as { Bun?: BunGlobal }).Bun;

const createBunSubprocess = (): Subprocess | undefined => {
  const bun = getBun();
  if (bun?.spawnSync === undefined) return undefined;

  return {
    exec: async (cmd, args, options) => {
      const spawnOpts = buildOpts(options);

      if (options.stdin !== undefined || options.timeout !== undefined) {
        const asyncOpts: {
          cwd?: string;
          env?: Record<string, string>;
          stdin?: "pipe";
          stderr?: "pipe";
        } = { ...spawnOpts, stderr: "pipe" };
        if (options.stdin !== undefined) asyncOpts.stdin = "pipe";
        const child = bun.spawn([cmd, ...args], asyncOpts);
        const output = Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        const stdinData = options.stdin;
        const feedStdin = async (): Promise<void> => {
          if (stdinData === undefined || child.stdin === undefined) return;
          // Bun accepts writes to an exited child's pipe silently, so check first.
          if (child.exitCode !== null) throw new Error("write EPIPE: child exited before stdin");
          child.stdin.write(stdinData);
          await child.stdin.end();
        };
        const [exitCode, stdout, stderr] = await raceTimeout(
          feedStdin().then(
            () => output,
            err => {
              output.catch(() => undefined);
              child.kill();
              throw err;
            },
          ),
          options.timeout,
          () => {
            try {
              child.kill();
            } catch {
              /* */
            }
          },
        );
        return { exitCode, stdout, stderr };
      }

      const result = bun.spawnSync([cmd, ...args], spawnOpts);
      return {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      };
    },

    spawn: async (cmd, args, options) => {
      const capture = options.capture === true;
      const spawnOpts = capture
        ? { ...buildOpts(options), stdout: "pipe" as const, stderr: "pipe" as const }
        : { ...buildOpts(options), stdout: "inherit" as const, stderr: "inherit" as const };
      const child = bun.spawn([cmd, ...args], spawnOpts);
      // Output is read from spawn time so a late wait() still sees it.
      const readStream = (stream: unknown): Promise<string> =>
        capture ? new Response(stream as BodyInit).text() : Promise.resolve("");
      const result = Promise.all([
        child.exited,
        readStream(child.stdout),
        readStream(child.stderr),
      ]).then(([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr }));
      result.catch(() => undefined);
      return {
        pid: (child as unknown as { pid?: number }).pid,
        kill: () => child.kill(),
        unref: () => (child as unknown as { unref?(): void }).unref?.(),
        wait: () => result,
      };
    },
  };
};

// ── Node adapter ────────────────────────────────────────────────────────────

const createNodeSubprocess = (): Subprocess => ({
  exec: async (cmd, args, options) => {
    const cp = await getNodeCp();
    if (cp === null) throw new Error("node:child_process not available");

    if (options.stdin !== undefined) {
      const stdinData = options.stdin;
      const nodeOpts = buildOpts(options);
      return new Promise<SubprocessResult>((resolve, reject) => {
        const child = cp.spawn(cmd, args, nodeOpts);
        let stdout = "";
        let stderr = "";
        let stdinError: Error | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;

        if (options.timeout !== undefined) {
          const ms = options.timeout;
          timer = setTimeout(() => {
            child.kill();
            reject(new Error(`Command timed out after ${ms}ms`));
          }, ms);
        }

        child.stdout?.on("data", chunk => {
          stdout += chunk.toString();
        });
        child.stderr?.on("data", chunk => {
          stderr += chunk.toString();
        });
        child.on("error", err => {
          if (timer !== undefined) clearTimeout(timer);
          reject(err);
        });
        child.on("close", code => {
          if (timer !== undefined) clearTimeout(timer);
          if (stdinError !== undefined) {
            reject(stdinError);
            return;
          }
          resolve({ exitCode: code ?? 1, stdout, stderr });
        });

        if (child.stdin !== null) {
          // A child that exits without reading stdin makes the write fail with EPIPE.
          child.stdin.on("error", err => {
            stdinError = err;
            // The timeout is cleared below, so kill here or the child outlives exec.
            child.kill();
            if (timer !== undefined) clearTimeout(timer);
            reject(err);
          });
          child.stdin.write(stdinData);
          child.stdin.end();
        }
      });
    }

    const nodeOpts: { cwd?: string; env?: Record<string, string>; timeout?: number } =
      buildOpts(options);
    if (options.timeout !== undefined) nodeOpts.timeout = options.timeout;

    return new Promise<SubprocessResult>((resolve, reject) => {
      cp.execFile(cmd, args, nodeOpts, (error, stdout, stderr) => {
        if (error === null) {
          resolve({ exitCode: 0, stdout, stderr });
          return;
        }
        const killed = (error as unknown as { killed?: boolean }).killed;
        if (killed === true && options.timeout !== undefined) {
          reject(new Error(`Command timed out after ${options.timeout}ms`));
          return;
        }
        const exitCode = (error as unknown as { code?: number | string }).code;
        if (typeof exitCode === "number") {
          resolve({ exitCode, stdout, stderr });
          return;
        }
        reject(error);
      });
    });
  },

  spawn: async (cmd, args, options) => {
    const cp = await getNodeCp();
    if (cp === null) throw new Error("node:child_process not available");

    const nodeOpts: { cwd?: string; env?: Record<string, string>; stdio?: string[] } =
      buildOpts(options);
    if (options.capture !== true) {
      nodeOpts.stdio = ["ignore", "inherit", "inherit"];
    }
    const child = cp.spawn(cmd, args, nodeOpts);

    // Listeners attach at creation so a failed spawn or an early exit is never
    // an unhandled event, and a later wait() still sees the stored result.
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", chunk => {
      stderr += chunk.toString();
    });
    const closed = new Promise<SubprocessResult>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", code => resolve({ exitCode: code ?? 1, stdout, stderr }));
    });
    closed.catch(() => undefined);

    await new Promise<void>((resolve, reject) => {
      child.on("spawn", resolve);
      child.on("error", reject);
    });

    return {
      pid: child.pid,
      kill: (signal?) => child.kill(signal),
      unref: () => child.unref?.(),
      wait: () => closed,
    };
  },
});

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the subprocess adapter for the current runtime. */
export const resolveSubprocess = (): Subprocess => createBunSubprocess() ?? createNodeSubprocess();

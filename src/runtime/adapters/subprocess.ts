/**
 * @module runtime/adapters/subprocess
 *
 * Subprocess adapter implementations for Deno, Bun, and Node.
 */

import { getDeno, importNode } from "./detect.js";
import type { Subprocess, SubprocessOptions, SubprocessResult } from "./types.js";

// ── Bun structural types ────────────────────────────────────────────────────

interface BunSpawnSyncResult {
  readonly exitCode: number;
  readonly stdout: { toString(): string };
  readonly stderr: { toString(): string };
}

interface BunChild {
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
    opts?: { cwd?: string; env?: Record<string, string>; stdin?: { readonly size: number } },
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
  readonly stdin: { write(data: string, encoding?: string): boolean; end(): void } | null;
  readonly stdout: {
    on(event: "data", cb: (chunk: { toString(): string }) => void): unknown;
  } | null;
  readonly stderr: {
    on(event: "data", cb: (chunk: { toString(): string }) => void): unknown;
  } | null;
  on(event: "close", cb: (code: number | null) => void): unknown;
  on(event: "error", cb: (err: Error) => void): unknown;
  kill(signal?: string): boolean;
  unref?(): void;
}

const getNodeCp = importNode<NodeChildProcess>("node:child_process");

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

// ── Deno adapter ────────────────────────────────────────────────────────────

const createDenoSubprocess = (): Subprocess | undefined => {
  const deno = getDeno();
  const DenoCommand = (deno as unknown as { Command?: unknown })?.Command;
  if (DenoCommand === undefined) return undefined;

  // biome-ignore lint/complexity/noBannedTypes: Deno.Command constructor stored dynamically
  const Cmd = DenoCommand as Function;

  return {
    exec: async (cmd, args, options) => {
      const spawnOpts = buildOpts(options);
      const decoder = new TextDecoder();

      if (options.stdin !== undefined) {
        const proc = new (
          Cmd as new (
            ...a: unknown[]
          ) => {
            spawn(): {
              stdin: WritableStream<Uint8Array>;
              output(): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }>;
            };
            kill(): void;
          }
        )(cmd, { args, stdin: "piped", stdout: "piped", stderr: "piped", ...spawnOpts });
        const child = proc.spawn();
        const writer = child.stdin.getWriter();
        await writer.write(new TextEncoder().encode(options.stdin));
        await writer.close();
        const output = await raceTimeout(child.output(), options.timeout, () => {
          try {
            proc.kill();
          } catch {
            /* */
          }
        });
        return {
          exitCode: output.code,
          stdout: decoder.decode(output.stdout),
          stderr: decoder.decode(output.stderr),
        };
      }

      const proc = new (
        Cmd as new (
          ...a: unknown[]
        ) => {
          output(): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }>;
          spawn(): {
            output(): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }>;
            kill(): void;
          };
        }
      )(cmd, { args, stdout: "piped", stderr: "piped", ...spawnOpts });

      if (options.timeout !== undefined) {
        const child = proc.spawn();
        const output = await raceTimeout(child.output(), options.timeout, () => {
          try {
            child.kill();
          } catch {
            /* */
          }
        });
        return {
          exitCode: output.code,
          stdout: decoder.decode(output.stdout),
          stderr: decoder.decode(output.stderr),
        };
      }

      const output = await proc.output();
      return {
        exitCode: output.code,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr),
      };
    },

    spawn: async (cmd, args, options) => {
      const spawnOpts = buildOpts(options);
      const pipeOpts = options.capture === true ? { stdout: "piped", stderr: "piped" } : {};
      const proc = new (
        Cmd as new (
          ...a: unknown[]
        ) => {
          spawn(): {
            readonly pid: number;
            output(): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }>;
            kill(signal?: string): void;
            unref(): void;
          };
        }
      )(cmd, { args, ...pipeOpts, ...spawnOpts });
      const child = proc.spawn();
      const decoder = new TextDecoder();

      return {
        pid: child.pid,
        kill: (signal?) => child.kill(signal),
        unref: () => child.unref(),
        wait: async () => {
          const output = await child.output();
          return {
            exitCode: output.code,
            stdout: decoder.decode(output.stdout),
            stderr: decoder.decode(output.stderr),
          };
        },
      };
    },
  };
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
          stdin?: { readonly size: number };
        } = spawnOpts;
        if (options.stdin !== undefined) {
          const BlobCtor = (
            globalThis as unknown as {
              Blob: new (parts: readonly string[]) => { readonly size: number };
            }
          ).Blob;
          asyncOpts.stdin = new BlobCtor([options.stdin]);
        }
        const child = bun.spawn([cmd, ...args], asyncOpts);
        const [exitCode, stdout, stderr] = await raceTimeout(
          Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]),
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
      const spawnOpts = buildOpts(options);
      const child = bun.spawn([cmd, ...args], spawnOpts);
      return {
        pid: (child as unknown as { pid?: number }).pid,
        kill: () => child.kill(),
        unref: () => (child as unknown as { unref?(): void }).unref?.(),
        wait: async () => {
          const [exitCode, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]);
          return { exitCode, stdout, stderr };
        },
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
          resolve({ exitCode: code ?? 1, stdout, stderr });
        });

        if (child.stdin !== null) {
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

    return {
      pid: child.pid,
      kill: (signal?) => child.kill(signal),
      unref: () => child.unref?.(),
      wait: () =>
        new Promise<SubprocessResult>((resolve, reject) => {
          let stdout = "";
          let stderr = "";
          child.stdout?.on("data", chunk => {
            stdout += chunk.toString();
          });
          child.stderr?.on("data", chunk => {
            stderr += chunk.toString();
          });
          child.on("error", reject);
          child.on("close", code => resolve({ exitCode: code ?? 1, stdout, stderr }));
        }),
    };
  },
});

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the subprocess adapter for the current runtime. */
export const resolveSubprocess = (): Subprocess =>
  createDenoSubprocess() ?? createBunSubprocess() ?? createNodeSubprocess();

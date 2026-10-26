// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapters/detect
 *
 * Shared runtime detection via globalThis structural typing.
 *
 * Each helper returns the runtime global if present, or undefined.
 * Capability adapter files use these to build their resolve functions.
 */

// ── Structural types for runtime globals ────────────────────────────────────

/** Minimal Node/Bun process global shape. */
export interface NodeProcess {
  /** Node/Bun standard input stream. */
  readonly stdin: {
    /** True if stdin is a terminal. */
    readonly isTTY: boolean | undefined;
    /** Enable or disable raw mode. */
    setRawMode?(mode: boolean): unknown;
    /** Register an event listener. */
    on(event: string, cb: (...args: readonly unknown[]) => void): unknown;
    /** Register a one-time event listener. */
    once(event: string, cb: (...args: readonly unknown[]) => void): unknown;
    /** Remove an event listener. */
    removeListener(event: string, cb: (...args: readonly unknown[]) => void): unknown;
    /** Resume reading from stdin. */
    resume(): unknown;
    /** Pause reading from stdin. */
    pause(): unknown;
    /** Set character encoding for reads. */
    setEncoding?(encoding: string): unknown;
  };
  /** Node/Bun standard output stream. */
  readonly stdout: {
    /** True if stdout is a terminal. */
    readonly isTTY: boolean | undefined;
    /** Terminal width in columns. */
    readonly columns?: number | undefined;
    /** Terminal height in rows. */
    readonly rows?: number | undefined;
    /** Write text to stdout. */
    write(data: string): boolean;
  };
  /** Node/Bun standard error stream. */
  readonly stderr: {
    /** Write text to stderr. */
    write(data: string): boolean;
  };
  /** Process ID. */
  readonly pid: number;
  /** Command-line arguments. */
  readonly argv: readonly string[];
  /** Environment variables. */
  readonly env: Record<string, string | undefined>;
  /** Current working directory. */
  cwd(): string;
  /** Terminate the process. */
  exit(code?: number): never;
  /** Process uptime in seconds. */
  uptime(): number;
  /** Current memory usage stats. */
  memoryUsage(): { heapUsed: number; heapTotal: number; rss: number };
}

// ── Detection ───────────────────────────────────────────────────────────────

/** Get the process global if running in Node/Bun. */
export const getNodeProcess = (): NodeProcess | undefined =>
  (globalThis as unknown as { process?: NodeProcess }).process;

/** Node built-ins the runtime adapters load on demand. */
export type NodeBuiltinName =
  | "child_process"
  | "dns/promises"
  | "fs/promises"
  | "http"
  | "module"
  | "net"
  | "readline";

/**
 * Loads a Node built-in by name. The specifier is computed so Workers and
 * browser bundlers never resolve it at load time; callers guard by runtime detection.
 */
export const importNodeBuiltin = <T>(name: NodeBuiltinName): Promise<T> =>
  import(/* @vite-ignore */ `node:${name}`) as Promise<T>;

/**
 * Import a Node built-in module with caching.
 *
 * Resolves to null when the module is unavailable on this runtime.
 */
export const importNode = <T>(specifier: `node:${NodeBuiltinName}`): (() => Promise<T | null>) => {
  let cached: T | null | undefined;
  return async (): Promise<T | null> => {
    if (cached !== undefined) return cached;
    try {
      cached = await importNodeBuiltin<T>(specifier.slice("node:".length) as NodeBuiltinName);
      return cached;
    } catch {
      cached = null;
      return null;
    }
  };
};

type RequireFn = (id: string) => unknown;
interface ModuleBuiltin {
  createRequire(url: string): RequireFn;
}

let cachedRequire: RequireFn | null | undefined;

/**
 * Build a require function without code generation. process.getBuiltinModule
 * is synchronous; runtimes without it fall back to the async import, which
 * requireReady awaits.
 */
const initRequire = async (): Promise<void> => {
  if (cachedRequire !== undefined) return;
  const proc = getNodeProcess() as
    | (NodeProcess & { getBuiltinModule?: (id: string) => unknown })
    | undefined;
  if (proc === undefined) {
    cachedRequire = null;
    return;
  }
  try {
    const mod =
      (proc.getBuiltinModule?.("node:module") as ModuleBuiltin | undefined) ??
      (await importNodeBuiltin<ModuleBuiltin>("module"));
    cachedRequire = mod.createRequire(import.meta.url);
  } catch {
    cachedRequire = null;
  }
};

/** Resolves once the require function is ready. Started lazily, never at import time. */
let requireReadyPromise: Promise<void> | undefined;
const requireReady = (): Promise<void> => {
  requireReadyPromise ??= initRequire();
  return requireReadyPromise;
};

/**
 * The shared synchronous require function, or null when unavailable.
 * Starts initialisation on first use; where only the async path exists, call
 * and wait on requireReady first.
 */
export const getRequire = (): RequireFn | null => {
  void requireReady();
  return cachedRequire ?? null;
};

export const requireNode = <T>(module: string): (() => T | null) => {
  let cached: T | null | undefined;
  return (): T | null => {
    if (cached !== undefined) return cached;
    const req = getRequire();
    if (req === null) return null;
    try {
      cached = req(module) as T;
      return cached;
    } catch {
      cached = null;
      return null;
    }
  };
};

/** True once require initialisation has finished, whether it succeeded or not. */
export const isRequireSettled = (): boolean => cachedRequire !== undefined;

export { requireReady };

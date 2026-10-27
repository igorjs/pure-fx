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

/**
 * Import a Node built-in module with caching.
 *
 * Uses Function constructor to avoid static analysis picking up
 * the import as a dependency. Caches the result to avoid repeated
 * dynamic imports.
 */
export const importNode = <T>(module: string): (() => Promise<T | null>) => {
  let cached: T | null | undefined;
  return async (): Promise<T | null> => {
    if (cached !== undefined) return cached;
    try {
      cached = await (Function(`return import("${module}")`)() as Promise<T>);
      return cached;
    } catch {
      cached = null;
      return null;
    }
  };
};

/**
 * Require a Node built-in module synchronously with caching.
 *
 * Uses Function constructor to avoid static analysis. Works in
 * Node and Bun where require is available. Returns null in
 * browsers.
 */
/**
 * Get a working require function in any context (CJS or ESM).
 * In CJS, Function('return require')() works.
 * In ESM, we use dynamic import('node:module').createRequire.
 */
let cachedRequire: ((id: string) => unknown) | null | undefined;

const initRequire = async (): Promise<(id: string) => unknown> => {
  if (cachedRequire !== undefined) return cachedRequire!;
  try {
    cachedRequire = Function("return require")() as (id: string) => unknown;
    return cachedRequire;
  } catch {
    // ESM context
  }
  try {
    const mod = (await Function('return import("node:module")')()) as {
      createRequire(url: string): (id: string) => unknown;
    };
    cachedRequire = mod.createRequire("file:///");
    return cachedRequire;
  } catch {
    cachedRequire = null;
  }
  return cachedRequire!;
};

// Eagerly initialise (the promise settles before any adapter runs)
const requireReady = initRequire();

export const requireNode = <T>(module: string): (() => T | null) => {
  let cached: T | null | undefined;
  return (): T | null => {
    if (cached !== undefined) return cached;
    if (cachedRequire === null || cachedRequire === undefined) {
      cached = null;
      return null;
    }
    try {
      cached = cachedRequire(module) as T;
      return cached;
    } catch {
      cached = null;
      return null;
    }
  };
};

/** Ensure requireNode is ready (call at module init time via top-level await). */
export { requireReady };

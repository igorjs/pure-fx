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

/** Minimal Deno global shape used across capability adapters. */
export interface DenoGlobal {
  readonly stdin: {
    readonly readable: ReadableStream<Uint8Array>;
    isTerminal(): boolean;
    setRaw(mode: boolean): void;
    read(buf: Uint8Array): Promise<number | null>;
  };
  readonly stdout: {
    writeSync(data: Uint8Array): number;
  };
  readonly build: { readonly arch: string; readonly os: string };
  hostname(): string;
  systemMemoryInfo(): { readonly total: number; readonly free: number };
  consoleSize?(): { columns: number; rows: number };
  // Filesystem
  readTextFile?(path: string): Promise<string>;
  writeTextFile?(path: string, data: string, options?: { append?: boolean }): Promise<void>;
  mkdir?(path: string, options?: { recursive?: boolean }): Promise<void>;
  stat?(path: string): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    mtime: Date | null;
  }>;
  remove?(path: string, options?: { recursive?: boolean }): Promise<void>;
  readDir?(path: string): AsyncIterable<{ name: string }>;
  copyFile?(src: string, dest: string): Promise<void>;
  rename?(oldPath: string, newPath: string): Promise<void>;
  makeTempDir?(options?: { prefix?: string }): Promise<string>;
  // DNS
  resolveDns?(hostname: string, type: string): Promise<string[]>;
  // TCP
  connect?(options: { hostname: string; port: number }): Promise<{
    read(buf: Uint8Array): Promise<number | null>;
    write(data: Uint8Array): Promise<number>;
    close(): void;
  }>;
  // Process
  readonly pid: number;
  readonly ppid?: number;
  readonly args: readonly string[];
  cwd(): string;
  exit(code?: number): never;
  memoryUsage?(): { rss: number; heapTotal: number; heapUsed: number; external: number };
  osUptime?(): number;
  osRelease?(): string;
  loadavg?(): readonly [number, number, number];
  networkInterfaces?(): readonly {
    name: string;
    address: string;
    family: "IPv4" | "IPv6";
    mac: string;
    scopeid?: number;
  }[];
  uid?(): number;
  gid?(): number;
  execPath?(): string;
  readonly env?: {
    get?(key: string): string | undefined;
    toObject?(): Record<string, string>;
  };
  // Additional FS
  readFile?(path: string): Promise<Uint8Array>;
  writeFile?(path: string, data: Uint8Array): Promise<void>;
  lstat?(path: string): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    isSymlink: boolean;
    size: number;
    mtime: Date | null;
  }>;
  realPath?(path: string): Promise<string>;
  readLink?(path: string): Promise<string>;
  symlink?(target: string, path: string): Promise<void>;
  link?(oldPath: string, newPath: string): Promise<void>;
  chmod?(path: string, mode: number): Promise<void>;
  chown?(path: string, uid: number, gid: number): Promise<void>;
  truncate?(path: string, len?: number): Promise<void>;
}

/** Minimal Node/Bun process global shape. */
export interface NodeProcess {
  readonly stdin: {
    readonly isTTY: boolean | undefined;
    setRawMode?(mode: boolean): unknown;
    on(event: string, cb: (...args: readonly unknown[]) => void): unknown;
    once(event: string, cb: (...args: readonly unknown[]) => void): unknown;
    removeListener(event: string, cb: (...args: readonly unknown[]) => void): unknown;
    resume(): unknown;
    pause(): unknown;
    setEncoding?(encoding: string): unknown;
  };
  readonly stdout: {
    readonly isTTY: boolean | undefined;
    readonly columns?: number | undefined;
    readonly rows?: number | undefined;
    write(data: string): boolean;
  };
  readonly stderr: {
    write(data: string): boolean;
  };
  readonly pid: number;
  readonly argv: readonly string[];
  readonly env: Record<string, string | undefined>;
  cwd(): string;
  exit(code?: number): never;
  uptime(): number;
  memoryUsage(): { heapUsed: number; heapTotal: number; rss: number };
}

// ── Detection ───────────────────────────────────────────────────────────────

/** Get the Deno global if running in Deno. */
export const getDeno = (): DenoGlobal | undefined =>
  (globalThis as unknown as { Deno?: DenoGlobal }).Deno;

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
 * Node and Bun where require is available. Returns null in Deno
 * and browsers.
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

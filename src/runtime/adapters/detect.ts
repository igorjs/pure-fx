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
  /** Deno standard input handle. */
  readonly stdin: {
    /** Readable byte stream for stdin. */
    readonly readable: ReadableStream<Uint8Array>;
    /** True if stdin is a terminal. */
    isTerminal(): boolean;
    /** Enable or disable raw mode. */
    setRaw(mode: boolean): void;
    /** Read raw bytes into buffer. */
    read(buf: Uint8Array): Promise<number | null>;
  };
  /** Deno standard output handle. */
  readonly stdout: {
    /** Write bytes synchronously. */
    writeSync(data: Uint8Array): number;
  };
  /** Build target info (arch and OS). */
  readonly build: { readonly arch: string; readonly os: string };
  /** System hostname. */
  hostname(): string;
  /** Total and free system memory. */
  systemMemoryInfo(): { readonly total: number; readonly free: number };
  /** Terminal dimensions in columns and rows. */
  consoleSize?(): { columns: number; rows: number };
  // Filesystem
  /** Read file as UTF-8 text. */
  readTextFile?(path: string): Promise<string>;
  /** Write UTF-8 text to file. */
  writeTextFile?(path: string, data: string, options?: { append?: boolean }): Promise<void>;
  /** Create directory recursively. */
  mkdir?(path: string, options?: { recursive?: boolean }): Promise<void>;
  /** Get file or directory metadata. */
  stat?(path: string): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    mtime: Date | null;
  }>;
  /** Remove file or directory. */
  remove?(path: string, options?: { recursive?: boolean }): Promise<void>;
  /** Iterate directory entries. */
  readDir?(path: string): AsyncIterable<{ name: string }>;
  /** Copy a file to a new path. */
  copyFile?(src: string, dest: string): Promise<void>;
  /** Rename or move a file. */
  rename?(oldPath: string, newPath: string): Promise<void>;
  /** Create a temporary directory. */
  makeTempDir?(options?: { prefix?: string }): Promise<string>;
  // DNS
  /** Resolve DNS records by type. */
  resolveDns?(hostname: string, type: string): Promise<string[]>;
  // TCP
  /** Open a TCP connection. */
  connect?(options: { hostname: string; port: number }): Promise<{
    read(buf: Uint8Array): Promise<number | null>;
    write(data: Uint8Array): Promise<number>;
    close(): void;
  }>;
  // Process
  /** Process ID. */
  readonly pid: number;
  /** Parent process ID. */
  readonly ppid?: number;
  /** Command-line arguments. */
  readonly args: readonly string[];
  /** Current working directory. */
  cwd(): string;
  /** Terminate the process. */
  exit(code?: number): never;
  /** Current memory usage stats. */
  memoryUsage?(): { rss: number; heapTotal: number; heapUsed: number; external: number };
  /** OS uptime in seconds. */
  osUptime?(): number;
  /** OS release/version string. */
  osRelease?(): string;
  /** 1, 5, and 15 minute load averages. */
  loadavg?(): readonly [number, number, number];
  /** Available network interfaces. */
  networkInterfaces?(): readonly {
    name: string;
    address: string;
    family: "IPv4" | "IPv6";
    mac: string;
    scopeid?: number;
  }[];
  /** Effective user ID. */
  uid?(): number;
  /** Effective group ID. */
  gid?(): number;
  /** Path to the Deno executable. */
  execPath?(): string;
  /** Environment variable access. */
  readonly env?: {
    /** Get a single environment variable. */
    get?(key: string): string | undefined;
    /** Get all environment variables. */
    toObject?(): Record<string, string>;
  };
  // Additional FS
  /** Read file as raw bytes. */
  readFile?(path: string): Promise<Uint8Array>;
  /** Write raw bytes to file. */
  writeFile?(path: string, data: Uint8Array): Promise<void>;
  /** Stat without following symlinks. */
  lstat?(path: string): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    isSymlink: boolean;
    size: number;
    mtime: Date | null;
  }>;
  /** Resolve canonical absolute path. */
  realPath?(path: string): Promise<string>;
  /** Read target of a symbolic link. */
  readLink?(path: string): Promise<string>;
  /** Create a symbolic link. */
  symlink?(target: string, path: string): Promise<void>;
  /** Create a hard link. */
  link?(oldPath: string, newPath: string): Promise<void>;
  /** Change file permissions. */
  chmod?(path: string, mode: number): Promise<void>;
  /** Change file ownership. */
  chown?(path: string, uid: number, gid: number): Promise<void>;
  /** Truncate file to given length. */
  truncate?(path: string, len?: number): Promise<void>;
}

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

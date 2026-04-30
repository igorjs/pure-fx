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
  readonly args: readonly string[];
  cwd(): string;
  exit(code?: number): never;
  memoryUsage?(): { rss: number; heapTotal: number; heapUsed: number; external: number };
  osUptime?(): number;
  readonly env?: {
    get?(key: string): string | undefined;
    toObject?(): Record<string, string>;
  };
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
export const requireNode = <T>(module: string): (() => T | null) => {
  let cached: T | null | undefined;
  return (): T | null => {
    if (cached !== undefined) return cached;
    try {
      cached = Function(`return require("${module}")`)() as T;
      return cached;
    } catch {
      cached = null;
      return null;
    }
  };
};

/**
 * @module runtime/os
 *
 * Cross-runtime OS information that returns Option instead of throwing.
 *
 * **Why wrap os info instead of importing node:os?**
 * Importing `node:os` binds the module to Node.js. This module uses the
 * OsInfo adapter from runtime/adapters which normalises Deno and Node/Bun
 * OS APIs behind a single interface.
 *
 * **Troubleshooting:**
 * - `hostname()` returns `None` on Deno without `--allow-sys`.
 * - `loadavg()` returns `None` on Windows (not supported by the OS).
 * - `networkInterfaces()` returns `[]` if the runtime can't access
 *   network info (permissions or environment restrictions).
 * - `osRelease()` may return `None` in some restricted environments.
 * - All methods return `Option` or a safe default, never throw.
 */

import { None, type Option, Some } from "../core/option.js";
import { resolveOsInfo } from "./adapters/os-adapter.js";

// ── Cached adapter ──────────────────────────────────────────────────────────

const adapter = resolveOsInfo();

const tryOpt = <T>(fn: () => T | undefined): Option<T> => {
  if (adapter === undefined) return None;
  const val = fn();
  return val !== undefined ? Some(val) : None;
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Cross-runtime OS information.
 *
 * @example
 * ```ts
 * const host = Os.hostname();       // Option<string>
 * const cores = Os.cpuCount();      // Option<number>
 * const arch = Os.arch();           // 'x64' | 'arm64' | ...
 * const tmp = Os.tmpDir();          // '/tmp' or platform equivalent
 * ```
 */
export const Os: {
  /** Get the system hostname. */
  readonly hostname: () => Option<string>;
  /** Get the CPU architecture (e.g. 'x64', 'arm64', 'aarch64'). */
  readonly arch: () => string;
  /** Get the OS platform (e.g. 'linux', 'darwin', 'windows'). */
  readonly platform: () => string;
  /** Get the number of logical CPU cores. */
  readonly cpuCount: () => Option<number>;
  /** Get total system memory in bytes. */
  readonly totalMemory: () => Option<number>;
  /** Get free system memory in bytes. */
  readonly freeMemory: () => Option<number>;
  /** Get the OS temporary directory path. */
  readonly tmpDir: () => string;
  /** Get the current user's home directory. */
  readonly homeDir: () => Option<string>;
  /** Get the system uptime in seconds. */
  readonly uptime: () => Option<number>;
  /** Get the OS release version string (e.g. '6.5.0-35-generic', '14.5'). */
  readonly osRelease: () => Option<string>;
  /** Get 1, 5, and 15 minute load averages. Returns None on Windows. */
  readonly loadavg: () => Option<readonly [number, number, number]>;
  /** Get network interface addresses. */
  readonly networkInterfaces: () => readonly import("./adapters/types.js").NetworkInterface[];
} = {
  hostname: () => tryOpt(() => adapter!.hostname()),
  arch: () => adapter?.arch() ?? "unknown",
  platform: () => adapter?.platform() ?? "unknown",
  cpuCount: () => tryOpt(() => adapter!.cpuCount()),
  totalMemory: () => tryOpt(() => adapter!.totalMemory()),
  freeMemory: () => tryOpt(() => adapter!.freeMemory()),
  tmpDir: () => adapter?.tmpDir() ?? "/tmp",
  homeDir: () => tryOpt(() => adapter!.homeDir()),
  uptime: () => tryOpt(() => adapter!.uptime()),
  osRelease: () => tryOpt(() => adapter!.osRelease?.()),
  loadavg: () => tryOpt(() => adapter!.loadavg?.()),
  networkInterfaces: () => adapter?.networkInterfaces?.() ?? [],
};

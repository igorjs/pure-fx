/**
 * @module runtime/os
 *
 * Cross-runtime OS information that returns Option instead of throwing.
 *
 * **Why wrap os info instead of importing node:os?**
 * Importing `node:os` binds the module to Node.js. This module detects
 * the runtime via globalThis and uses Deno globals or a sync require
 * fallback for Node/Bun. Values that may not be available on all
 * runtimes return Option, so callers handle absence explicitly.
 */

import { None, type Option, Some } from "../core/option.js";

// -- Structural types for runtime APIs ---------------------------------------

/** Structural type for the node:os module (sync access). */
interface NodeOs {
  hostname(): string;
  arch(): string;
  platform(): string;
  cpus(): readonly unknown[];
  totalmem(): number;
  freemem(): number;
  tmpdir(): string;
  homedir(): string;
  uptime(): number;
}

/** Structural type for Deno.build. */
interface DenoBuild {
  readonly arch: string;
  readonly os: string;
}

/** Structural type for Deno.SystemMemoryInfo. */
interface DenoMemoryInfo {
  readonly total: number;
  readonly free: number;
}

/** Structural type for the Deno global with OS-related APIs. */
interface DenoGlobal {
  readonly build: DenoBuild;
  hostname(): string;
  systemMemoryInfo(): DenoMemoryInfo;
}

/** Structural type for globalThis.process. */
interface ProcessGlobal {
  readonly env: Record<string, string | undefined>;
}

/** Structural type for navigator with hardwareConcurrency. */
interface NavigatorGlobal {
  readonly hardwareConcurrency?: number | undefined;
}

// -- Cached node:os access ---------------------------------------------------

/**
 * Try to load node:os synchronously via Function constructor.
 * Works in Node and Bun where require is available. Returns undefined
 * in Deno and browsers. Result is cached after first call.
 */
let nodeOsCached: NodeOs | null | undefined;

const getNodeOs = (): NodeOs | null => {
  if (nodeOsCached !== undefined) return nodeOsCached;
  try {
    // Why Function constructor: avoids static analysis picking up require as
    // a dependency. Works synchronously in Node/Bun, fails gracefully elsewhere.
    nodeOsCached = Function('return require("node:os")')() as NodeOs;
  } catch {
    nodeOsCached = null;
  }
  return nodeOsCached;
};

// -- Runtime detection helpers -----------------------------------------------

const getDeno = (): DenoGlobal | undefined => (globalThis as unknown as { Deno?: DenoGlobal }).Deno;

const getProcess = (): ProcessGlobal | undefined =>
  (globalThis as unknown as { process?: ProcessGlobal }).process;

const getNavigator = (): NavigatorGlobal | undefined =>
  (globalThis as unknown as { navigator?: NavigatorGlobal }).navigator;

// -- Public API --------------------------------------------------------------

/**
 * Cross-runtime OS information.
 *
 * Uses Deno globals when available, falls back to node:os via sync require
 * for Node/Bun, and returns Option.None for values unavailable in the
 * current runtime (browsers, edge workers).
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
} = {
  hostname: (): Option<string> => {
    const deno = getDeno();
    if (deno !== undefined) {
      try {
        return Some(deno.hostname());
      } catch {
        return None;
      }
    }
    const os = getNodeOs();
    if (os !== null) {
      try {
        return Some(os.hostname());
      } catch {
        return None;
      }
    }
    return None;
  },

  arch: (): string => {
    const deno = getDeno();
    if (deno !== undefined) return deno.build.arch;
    const os = getNodeOs();
    if (os !== null) return os.arch();
    return "unknown";
  },

  platform: (): string => {
    const deno = getDeno();
    if (deno !== undefined) return deno.build.os;
    const os = getNodeOs();
    if (os !== null) return os.platform();
    return "unknown";
  },

  cpuCount: (): Option<number> => {
    // Web standard first: navigator.hardwareConcurrency works in browsers,
    // Deno, and some edge runtimes.
    const nav = getNavigator();
    if (nav?.hardwareConcurrency !== undefined) {
      return Some(nav.hardwareConcurrency);
    }
    const os = getNodeOs();
    if (os !== null) {
      try {
        return Some(os.cpus().length);
      } catch {
        return None;
      }
    }
    return None;
  },

  totalMemory: (): Option<number> => {
    const deno = getDeno();
    if (deno !== undefined) {
      try {
        return Some(deno.systemMemoryInfo().total);
      } catch {
        return None;
      }
    }
    const os = getNodeOs();
    if (os !== null) {
      try {
        return Some(os.totalmem());
      } catch {
        return None;
      }
    }
    return None;
  },

  freeMemory: (): Option<number> => {
    const deno = getDeno();
    if (deno !== undefined) {
      try {
        return Some(deno.systemMemoryInfo().free);
      } catch {
        return None;
      }
    }
    const os = getNodeOs();
    if (os !== null) {
      try {
        return Some(os.freemem());
      } catch {
        return None;
      }
    }
    return None;
  },

  tmpDir: (): string => {
    const os = getNodeOs();
    if (os !== null) {
      try {
        return os.tmpdir();
      } catch {
        // Fall through to env/default
      }
    }
    // Environment variable fallback
    const proc = getProcess();
    if (proc !== undefined) {
      const tmp = proc.env["TMPDIR"] ?? proc.env["TMP"] ?? proc.env["TEMP"];
      if (tmp !== undefined) return tmp;
    }
    // Deno has no Deno.tmpdir(), but TMPDIR env is available
    const deno = getDeno();
    if (deno !== undefined) {
      // Deno.env requires --allow-env, so wrap in try/catch
      try {
        const denoEnv = (deno as unknown as { env?: { get?(key: string): string | undefined } })
          .env;
        const tmp = denoEnv?.get?.("TMPDIR") ?? denoEnv?.get?.("TMP");
        if (tmp !== undefined) return tmp;
      } catch {
        // Fall through to default
      }
    }
    return "/tmp";
  },

  homeDir: (): Option<string> => {
    const os = getNodeOs();
    if (os !== null) {
      try {
        return Some(os.homedir());
      } catch {
        return None;
      }
    }
    // Environment variable fallback for Deno/browsers
    const proc = getProcess();
    if (proc !== undefined) {
      const home = proc.env["HOME"] ?? proc.env["USERPROFILE"];
      if (home !== undefined) return Some(home);
    }
    return None;
  },

  uptime: (): Option<number> => {
    const os = getNodeOs();
    if (os !== null) {
      try {
        return Some(os.uptime());
      } catch {
        return None;
      }
    }
    return None;
  },
};

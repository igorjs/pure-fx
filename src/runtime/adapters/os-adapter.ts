/**
 * @module runtime/adapters/os-adapter
 *
 * OS information adapter implementations for Deno and Node/Bun.
 */

import { getDeno, getNodeProcess, requireNode } from "./detect.js";
import type { OsInfo } from "./types.js";

// ── Node structural types ───────────────────────────────────────────────────

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

const getNodeOs = requireNode<NodeOs>("node:os");

// ── Navigator structural type ───────────────────────────────────────────────

interface NavigatorGlobal {
  readonly hardwareConcurrency?: number | undefined;
}

const getNavigator = (): NavigatorGlobal | undefined =>
  (globalThis as unknown as { navigator?: NavigatorGlobal }).navigator;

// ── Deno adapter ────────────────────────────────────────────────────────────

const createDenoOsInfo = (): OsInfo | undefined => {
  const deno = getDeno();
  if (deno === undefined) return undefined;

  const nav = getNavigator();

  return {
    hostname: () => {
      try {
        return deno.hostname();
      } catch {
        return undefined;
      }
    },
    arch: () => deno.build.arch,
    platform: () => deno.build.os,
    cpuCount: () => nav?.hardwareConcurrency,
    totalMemory: () => {
      try {
        return deno.systemMemoryInfo().total;
      } catch {
        return undefined;
      }
    },
    freeMemory: () => {
      try {
        return deno.systemMemoryInfo().free;
      } catch {
        return undefined;
      }
    },
    tmpDir: () => {
      try {
        const denoEnv = (deno as unknown as { env?: { get?(key: string): string | undefined } })
          .env;
        return denoEnv?.get?.("TMPDIR") ?? denoEnv?.get?.("TMP") ?? "/tmp";
      } catch {
        return "/tmp";
      }
    },
    homeDir: () => {
      try {
        const denoEnv = (deno as unknown as { env?: { get?(key: string): string | undefined } })
          .env;
        return denoEnv?.get?.("HOME") ?? denoEnv?.get?.("USERPROFILE");
      } catch {
        return undefined;
      }
    },
    uptime: () => undefined,
  };
};

// ── Node/Bun adapter ────────────────────────────────────────────────────────

const createNodeOsInfo = (): OsInfo | undefined => {
  const os = getNodeOs();
  if (os === null) return undefined;

  const proc = getNodeProcess();
  const nav = getNavigator();

  return {
    hostname: () => {
      try {
        return os.hostname();
      } catch {
        return undefined;
      }
    },
    arch: () => os.arch(),
    platform: () => os.platform(),
    cpuCount: () => {
      if (nav?.hardwareConcurrency !== undefined) return nav.hardwareConcurrency;
      try {
        return os.cpus().length;
      } catch {
        return undefined;
      }
    },
    totalMemory: () => {
      try {
        return os.totalmem();
      } catch {
        return undefined;
      }
    },
    freeMemory: () => {
      try {
        return os.freemem();
      } catch {
        return undefined;
      }
    },
    tmpDir: () => {
      try {
        return os.tmpdir();
      } catch {
        /* */
      }
      if (proc !== undefined) {
        const tmp = proc.env["TMPDIR"] ?? proc.env["TMP"] ?? proc.env["TEMP"];
        if (tmp !== undefined) return tmp;
      }
      return "/tmp";
    },
    homeDir: () => {
      try {
        return os.homedir();
      } catch {
        /* */
      }
      if (proc !== undefined) {
        return proc.env["HOME"] ?? proc.env["USERPROFILE"];
      }
      return undefined;
    },
    uptime: () => {
      try {
        return os.uptime();
      } catch {
        return undefined;
      }
    },
  };
};

// ── Fallback adapter (ESM without node:os, or environments with only env/navigator) ──

const createFallbackOsInfo = (): OsInfo | undefined => {
  const proc = getNodeProcess();
  const nav = getNavigator();
  if (proc === undefined && nav === undefined) return undefined;

  return {
    hostname: () => undefined,
    arch: () => "unknown",
    platform: () => "unknown",
    cpuCount: () => nav?.hardwareConcurrency,
    totalMemory: () => undefined,
    freeMemory: () => undefined,
    tmpDir: () => {
      if (proc !== undefined) {
        const tmp = proc.env["TMPDIR"] ?? proc.env["TMP"] ?? proc.env["TEMP"];
        if (tmp !== undefined) return tmp;
      }
      return "/tmp";
    },
    homeDir: () => {
      if (proc !== undefined) {
        return proc.env["HOME"] ?? proc.env["USERPROFILE"];
      }
      return undefined;
    },
    uptime: () => undefined,
  };
};

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the OS info adapter for the current runtime. */
export const resolveOsInfo = (): OsInfo | undefined =>
  createDenoOsInfo() ?? createNodeOsInfo() ?? createFallbackOsInfo();

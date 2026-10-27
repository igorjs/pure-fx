// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapters/os-adapter
 *
 * OS information adapter implementations for Node/Bun.
 */

import { getNodeProcess, requireNode } from "./detect.js";
import type { NetworkInterface, OsInfo } from "./types.js";

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
  release(): string;
  loadavg(): readonly [number, number, number];
  networkInterfaces(): Record<
    string,
    readonly { address: string; family: string; mac: string; internal: boolean }[]
  >;
}

const getNodeOs = requireNode<NodeOs>("node:os");

// ── Navigator structural type ───────────────────────────────────────────────

interface NavigatorGlobal {
  readonly hardwareConcurrency?: number | undefined;
}

const getNavigator = (): NavigatorGlobal | undefined =>
  (globalThis as unknown as { navigator?: NavigatorGlobal }).navigator;

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
    osRelease: () => {
      try {
        return os.release();
      } catch {
        return undefined;
      }
    },
    loadavg: () => {
      try {
        return os.loadavg();
      } catch {
        return undefined;
      }
    },
    networkInterfaces: (): readonly NetworkInterface[] => {
      try {
        const ifaces = os.networkInterfaces();
        const result: NetworkInterface[] = [];
        for (const [name, addrs] of Object.entries(ifaces)) {
          if (addrs === undefined) continue;
          for (const addr of addrs) {
            result.push({
              name,
              address: addr.address,
              family: addr.family === "IPv6" || addr.family === "IPv6" ? "IPv6" : "IPv4",
              mac: addr.mac,
              internal: addr.internal,
            });
          }
        }
        return result;
      } catch {
        return [];
      }
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
export const resolveOsInfo = (): OsInfo | undefined => createNodeOsInfo() ?? createFallbackOsInfo();

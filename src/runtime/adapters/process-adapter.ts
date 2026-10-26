// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapters/process-adapter
 *
 * Process information adapter implementations for Node/Bun.
 */

import { getNodeProcess } from "./detect.js";
import type { ProcessInfo, ProcessMemory } from "./types.js";

// ── Node/Bun adapter ────────────────────────────────────────────────────────

const createNodeProcessInfo = (): ProcessInfo | undefined => {
  const proc = getNodeProcess();
  if (proc === undefined) return undefined;

  const nodeProc = proc as unknown as {
    ppid?: number;
    getuid?(): number;
    getgid?(): number;
    execPath?: string;
  };

  return {
    cwd: () => proc.cwd(),
    pid: proc.pid,
    ...(nodeProc.ppid !== undefined ? { ppid: nodeProc.ppid } : {}),
    argv: proc.argv.slice(2),
    env: ((key?: string) => {
      if (key === undefined) {
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(proc.env)) {
          if (v !== undefined) result[k] = v;
        }
        return result;
      }
      return proc.env[key];
    }) as ProcessInfo["env"],
    exit: (code?) => proc.exit(code),
    uptime: () => proc.uptime(),
    memoryUsage: (): ProcessMemory => {
      const mem = proc.memoryUsage();
      return { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss };
    },
    ...(nodeProc.getuid ? { uid: (): number | undefined => nodeProc.getuid!() } : {}),
    ...(nodeProc.getgid ? { gid: (): number | undefined => nodeProc.getgid!() } : {}),
    ...(nodeProc.execPath !== undefined ? { execPath: (): string => nodeProc.execPath! } : {}),
  };
};

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the process info adapter for the current runtime. */
export const resolveProcessInfo = (): ProcessInfo | undefined => createNodeProcessInfo();

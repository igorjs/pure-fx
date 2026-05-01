/**
 * @module runtime/adapters/process-adapter
 *
 * Process information adapter implementations for Deno and Node/Bun.
 */

import { getDeno, getNodeProcess } from "./detect.js";
import type { ProcessInfo, ProcessMemory } from "./types.js";

// ── Deno adapter ────────────────────────────────────────────────────────────

const createDenoProcessInfo = (): ProcessInfo | undefined => {
  const deno = getDeno();
  if (deno === undefined) return undefined;

  return {
    cwd: () => deno.cwd(),
    pid: deno.pid,
    ...(deno.ppid !== undefined ? { ppid: deno.ppid } : {}),
    argv: deno.args,
    env: ((key?: string) => {
      try {
        if (key === undefined) return deno.env?.toObject?.() ?? {};
        return deno.env?.get?.(key);
      } catch {
        return key === undefined ? {} : undefined;
      }
    }) as ProcessInfo["env"],
    exit: (code?) => deno.exit(code),
    ...(deno.osUptime
      ? {
          uptime: (): number => {
            try {
              return deno.osUptime!();
            } catch {
              return 0;
            }
          },
        }
      : {}),
    ...(deno.memoryUsage
      ? {
          memoryUsage: (): ProcessMemory => {
            const mem = deno.memoryUsage!();
            return { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss };
          },
        }
      : {}),
    ...(deno.uid
      ? {
          uid: (): number | undefined => {
            try {
              return deno.uid!();
            } catch {
              return undefined;
            }
          },
        }
      : {}),
    ...(deno.gid
      ? {
          gid: (): number | undefined => {
            try {
              return deno.gid!();
            } catch {
              return undefined;
            }
          },
        }
      : {}),
    ...(deno.execPath
      ? {
          execPath: (): string => {
            try {
              return deno.execPath!();
            } catch {
              return "deno";
            }
          },
        }
      : {}),
  };
};

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
export const resolveProcessInfo = (): ProcessInfo | undefined =>
  createDenoProcessInfo() ?? createNodeProcessInfo();

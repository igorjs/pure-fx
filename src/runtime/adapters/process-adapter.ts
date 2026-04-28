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
    argv: deno.args,
    exit: (code?) => deno.exit(code),
    // Deno does not expose process uptime or memory usage via the same API
  };
};

// ── Node/Bun adapter ────────────────────────────────────────────────────────

const createNodeProcessInfo = (): ProcessInfo | undefined => {
  const proc = getNodeProcess();
  if (proc === undefined) return undefined;

  return {
    cwd: () => proc.cwd(),
    pid: proc.pid,
    argv: proc.argv.slice(2),
    exit: (code?) => proc.exit(code),
    uptime: () => proc.uptime(),
    memoryUsage: (): ProcessMemory => {
      const mem = proc.memoryUsage();
      return { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss };
    },
  };
};

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the process info adapter for the current runtime. */
export const resolveProcessInfo = (): ProcessInfo | undefined =>
  createDenoProcessInfo() ?? createNodeProcessInfo();

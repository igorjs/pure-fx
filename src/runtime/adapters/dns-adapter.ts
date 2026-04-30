/**
 * @module runtime/adapters/dns-adapter
 *
 * DNS adapter implementations for Deno and Node/Bun.
 */

import { getDeno, importNode } from "./detect.js";
import type { Dns } from "./types.js";

// ── Node structural types ───────────────────────────────────────────────────

interface NodeDns {
  lookup(hostname: string): Promise<{ address: string; family: number }>;
  resolve(hostname: string, rrtype: string): Promise<string[]>;
}

const getNodeDns = importNode<NodeDns>("node:dns/promises");

// ── Deno adapter ────────────────────────────────────────────────────────────

const createDenoDns = (): Dns | undefined => {
  const deno = getDeno();
  if (deno?.resolveDns === undefined) return undefined;

  return {
    lookup: async hostname => {
      // Try IPv4 first, fall back to IPv6
      try {
        const a = await deno.resolveDns!(hostname, "A");
        if (a.length > 0) return { address: a[0]!, family: 4 };
      } catch {
        // A record lookup failed, try AAAA
      }
      const aaaa = await deno.resolveDns!(hostname, "AAAA");
      if (aaaa.length > 0) return { address: aaaa[0]!, family: 6 };
      throw new Error(`No addresses found for ${hostname}`);
    },
    resolve: (hostname, type) => deno.resolveDns!(hostname, type),
  };
};

// ── Node/Bun adapter ────────────────────────────────────────────────────────

const createNodeDns = async (): Promise<Dns | null> => {
  const dns = await getNodeDns();
  if (dns === null) return null;

  return {
    lookup: async hostname => {
      const result = await dns.lookup(hostname);
      return { address: result.address, family: result.family === 6 ? 6 : 4 };
    },
    resolve: (hostname, type) => dns.resolve(hostname, type),
  };
};

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the DNS adapter for the current runtime. */
export const resolveDns = async (): Promise<Dns | null> => {
  const deno = createDenoDns();
  if (deno !== undefined) return deno;
  return createNodeDns();
};

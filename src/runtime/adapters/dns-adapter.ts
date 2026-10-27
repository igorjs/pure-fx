// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapters/dns-adapter
 *
 * DNS adapter implementations for Node/Bun.
 */

import { importNode } from "./detect.js";
import type { Dns } from "./types.js";

// ── Node structural types ───────────────────────────────────────────────────

interface NodeDns {
  lookup(hostname: string): Promise<{ address: string; family: number }>;
  resolve(hostname: string, rrtype: string): Promise<string[]>;
}

const getNodeDns = importNode<NodeDns>("dns/promises");

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
export const resolveDns = (): Promise<Dns | null> => createNodeDns();

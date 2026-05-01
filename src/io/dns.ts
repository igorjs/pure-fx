// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module io/dns
 *
 * Cross-runtime DNS resolution returning Task instead of throwing.
 *
 * **Why wrap DNS?**
 * DNS resolution is inherently platform-specific with no web standard
 * equivalent. This module uses the Dns adapter from runtime/adapters
 * which normalises Deno and Node/Bun DNS APIs behind a single interface.
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import { Err, Ok } from "../core/result.js";
import { resolveDns } from "../runtime/adapters/dns-adapter.js";
import type { Dns as DnsAdapter } from "../runtime/adapters/types.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** DNS resolution failed. */
export const DnsError: ErrTypeConstructor<"DnsError", string> = ErrType("DnsError");

// ── DNS record ──────────────────────────────────────────────────────────────

/** A resolved DNS address with IP family. */
export interface DnsRecord {
  readonly address: string;
  readonly family: 4 | 6;
}

/** DNS record type for resolution queries. */
export type DnsType = "A" | "AAAA" | "CNAME" | "MX" | "TXT";

// ── Helpers ─────────────────────────────────────────────────────────────────

const toErr = (e: unknown, meta?: Record<string, unknown>): ErrType<"DnsError", string> =>
  DnsError(e instanceof Error ? e.message : String(e), meta);

const NO_DNS = "DNS resolution is not available in this runtime";

let cachedAdapter: DnsAdapter | null | undefined;

const getAdapter = async (): Promise<DnsAdapter | null> => {
  if (cachedAdapter !== undefined) return cachedAdapter;
  cachedAdapter = await resolveDns();
  return cachedAdapter;
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Cross-runtime DNS resolution.
 *
 * @example
 * ```ts
 * const record = await Dns.lookup('example.com').run();
 * const mx = await Dns.resolve('example.com', 'MX').run();
 * ```
 */
export const Dns: {
  /** Resolve a hostname to an address and IP family. */
  readonly lookup: (hostname: string) => TaskLike<DnsRecord, ErrType<"DnsError">>;
  /** Resolve DNS records of a specific type. */
  readonly resolve: (
    hostname: string,
    type?: DnsType,
  ) => TaskLike<readonly string[], ErrType<"DnsError">>;
} = {
  lookup: (hostname: string): TaskLike<DnsRecord, ErrType<"DnsError">> =>
    makeTask(async () => {
      const adapter = await getAdapter();
      if (adapter === null) return Err(DnsError(NO_DNS));
      try {
        return Ok(await adapter.lookup(hostname));
      } catch (e) {
        return Err(toErr(e, { hostname }));
      }
    }),

  resolve: (hostname: string, type?: DnsType): TaskLike<readonly string[], ErrType<"DnsError">> =>
    makeTask(async () => {
      const adapter = await getAdapter();
      if (adapter === null) return Err(DnsError(NO_DNS));
      try {
        return Ok(await adapter.resolve(hostname, type ?? "A"));
      } catch (e) {
        return Err(toErr(e, { hostname, type }));
      }
    }),
};

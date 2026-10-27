// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapter/origin
 *
 * Builds the origin that adapters use for `request.url`.
 */

/** Wrap an IPv6 literal in brackets so it forms a valid URL authority. */
const toUrlHost = (hostname: string): string =>
  hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;

/** The `http://host:port` origin for a bound hostname and port. */
export const buildOrigin = (hostname: string, port: number): string =>
  `http://${toUrlHost(hostname)}:${port}`;

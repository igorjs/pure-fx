// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapter/listen-error
 *
 * Shared marker for adapters that fail to bind their port, so the server
 * can map the failure to a typed `ListenError` without importing adapters.
 */

/** Value of `Error.name` on errors raised when a server cannot start listening. */
export const LISTEN_ERROR_NAME = "ListenError";

/** Wrap a bind failure (for example EADDRINUSE) in an Error the server recognises. */
export const toListenError = (port: number, cause: unknown): Error => {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const error = new Error(`Failed to listen on port ${port}: ${detail}`, { cause });
  error.name = LISTEN_ERROR_NAME;
  return error;
};

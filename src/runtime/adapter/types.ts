// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module runtime/adapter/types
 *
 * Re-exports the {@link ServerAdapter} and {@link ListenOptions} interfaces
 * so adapter implementations can import from a shorter path without pulling
 * in the entire server module.
 */

export type { ListenOptions, ServerAdapter } from "../../server.js";

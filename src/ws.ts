// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module ws
 *
 * WebSocket support for the Server module.
 *
 * **Why a separate module instead of baking into Server?**
 * WebSocket upgrade is a different protocol flow from HTTP request/response.
 * Keeping it separate avoids bloating the Server for users who don't need
 * WebSockets. The `upgradeHandler` produces a function that can be used
 * alongside Server's `.fetch` handler.
 *
 * This module provides the type-safe handler interface. Actual WebSocket
 * upgrade depends on the runtime (Bun, Deno, Node), so the runtime adapter
 * must wire it in.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * A WebSocket connection with typed send/close operations.
 */
export interface WebSocketConnection<T = string> {
  /** Send a message to the client. */
  readonly send: (data: T) => void;
  /** Close the connection with an optional code and reason. */
  readonly close: (code?: number, reason?: string) => void;
  /** The URL that initiated the WebSocket upgrade. */
  readonly url: string;
}

/**
 * Event handlers for a WebSocket route.
 *
 * @example
 * ```ts
 * const chatHandler: WebSocketHandler<string> = {
 *   onOpen: (ws) => ws.send('Welcome!'),
 *   onMessage: (ws, data) => broadcast(data),
 *   onClose: (ws, code, reason) => log('closed', { code }),
 *   onError: (ws, error) => log('error', { error }),
 * };
 * ```
 */
export interface WebSocketHandler<T = string> {
  /** Called when a new connection is opened. */
  readonly onOpen?: (ws: WebSocketConnection<T>) => void;
  /** Called when a message is received from the client. */
  readonly onMessage?: (ws: WebSocketConnection<T>, data: T) => void;
  /** Called when the connection is closed. */
  readonly onClose?: (ws: WebSocketConnection<T>, code: number, reason: string) => void;
  /** Called when an error occurs on the connection. */
  readonly onError?: (ws: WebSocketConnection<T>, error: unknown) => void;
}

/** A WebSocket route definition mapping a URL pattern to a handler. */
export interface WebSocketRoute<T = string> {
  /** The URL pattern to match for this route. */
  readonly pattern: string;
  /** The event handlers for connections matching this pattern. */
  readonly handler: WebSocketHandler<T>;
}

/** Result of a WebSocket upgrade attempt. */
export interface UpgradeResult {
  /** Whether the request was upgraded to WebSocket. */
  readonly upgraded: boolean;
  /** The upgrade response (if the runtime supports returning one). */
  readonly response?: Response;
}

// ── Router ──────────────────────────────────────────────────────────────────

/**
 * A WebSocket router that holds route definitions.
 *
 * @example
 * ```ts
 * const ws = WebSocket.router()
 *   .route('/chat', {
 *     onOpen: ws => ws.send('Connected'),
 *     onMessage: (ws, msg) => ws.send(`Echo: ${msg}`),
 *   })
 *   .route('/notifications', {
 *     onOpen: ws => subscribe(ws),
 *   });
 *
 * // Get route definitions for the runtime adapter
 * ws.routes;
 * ```
 */
export interface WebSocketRouter {
  /** Add a WebSocket route. */
  readonly route: (pattern: string, handler: WebSocketHandler) => WebSocketRouter;
  /** All registered routes. */
  readonly routes: readonly WebSocketRoute[];
  /** Find a handler for the given path. */
  readonly match: (path: string) => WebSocketHandler | undefined;
}

// ── Implementation ──────────────────────────────────────────────────────────

const createRouter = (routes: readonly WebSocketRoute[]): WebSocketRouter =>
  Object.freeze({
    route: (pattern: string, handler: WebSocketHandler): WebSocketRouter =>
      createRouter([...routes, { pattern, handler }]),

    routes,

    match: (path: string): WebSocketHandler | undefined => {
      for (const route of routes) {
        if (route.pattern === path) return route.handler;
      }
      return undefined;
    },
  });

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * WebSocket routing and handler definitions.
 *
 * The router holds type-safe handler definitions. Actual WebSocket
 * upgrade is runtime-specific: Bun uses `server.upgrade()`, Deno uses
 * `Deno.upgradeWebSocket()`, Node uses a ws library. The runtime adapter
 * reads the router's routes and wires them into the server.
 *
 * @example
 * ```ts
 * const ws = WebSocket.router()
 *   .route('/chat', {
 *     onOpen: conn => conn.send('Welcome!'),
 *     onMessage: (conn, msg) => conn.send(`Echo: ${msg}`),
 *     onClose: () => log.info('disconnected'),
 *   });
 * ```
 */
export const WebSocket: {
  /** Create a new WebSocket router for registering route handlers. */
  readonly router: () => WebSocketRouter;
} = {
  router: () => createRouter([]),
};

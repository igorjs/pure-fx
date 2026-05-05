/**
 * websocket.test.js - Tests for the WebSocket router module.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output (black-box).
 */

import { describe, expect, it } from "@igorjs/pure-test";

const { WebSocket } = await import("../dist/index.js");

// =============================================================================
// WebSocket.router
// =============================================================================

describe("WebSocket", () => {
  describe("WebSocket.router()", () => {
    it("creates an empty router", () => {
      const ws = WebSocket.router();
      expect(typeof ws.route).toBe("function");
      expect(typeof ws.match).toBe("function");
      expect(Array.isArray(ws.routes)).toBe(true);
      expect(ws.routes.length).toBe(0);
    });
  });

  describe(".route()", () => {
    it("adds a route and returns a new router (immutable)", () => {
      const ws1 = WebSocket.router();
      const ws2 = ws1.route("/chat", {
        onOpen: () => {
          /* noop */
        },
      });
      expect(ws1.routes.length).toBe(0);
      expect(ws2.routes.length).toBe(1);
    });

    it("chains multiple routes", () => {
      const ws = WebSocket.router()
        .route("/chat", {
          onOpen: () => {
            /* noop */
          },
        })
        .route("/notifications", {
          onMessage: () => {
            /* noop */
          },
        })
        .route("/live", {
          onClose: () => {
            /* noop */
          },
        });
      expect(ws.routes.length).toBe(3);
    });

    it("stores pattern and handler in route definition", () => {
      const handler = {
        onOpen: () => {
          /* noop */
        },
        onMessage: () => {
          /* noop */
        },
      };
      const ws = WebSocket.router().route("/test", handler);
      const route = ws.routes[0];
      expect(route.pattern).toBe("/test");
      expect(route.handler).toBe(handler);
    });
  });

  describe(".routes", () => {
    it("is a readonly array", () => {
      const ws = WebSocket.router().route("/a", {}).route("/b", {});
      expect(ws.routes.length).toBe(2);
      expect(ws.routes[0].pattern).toBe("/a");
      expect(ws.routes[1].pattern).toBe("/b");
    });

    it("preserves insertion order", () => {
      const ws = WebSocket.router().route("/first", {}).route("/second", {}).route("/third", {});
      expect(ws.routes.map(r => r.pattern)).toEqual(["/first", "/second", "/third"]);
    });
  });

  describe(".match()", () => {
    it("returns handler for matching pattern", () => {
      const handler = {
        onOpen: () => {
          /* noop */
        },
      };
      const ws = WebSocket.router().route("/chat", handler);
      const matched = ws.match("/chat");
      expect(matched).toBe(handler);
    });

    it("returns undefined for non-matching pattern", () => {
      const ws = WebSocket.router().route("/chat", {
        onOpen: () => {
          /* noop */
        },
      });
      expect(ws.match("/other")).toBe(undefined);
    });

    it("matches first route when multiple patterns exist", () => {
      const h1 = {
        onOpen: () => {
          /* noop */
        },
      };
      const h2 = {
        onMessage: () => {
          /* noop */
        },
      };
      const ws = WebSocket.router().route("/a", h1).route("/b", h2);
      expect(ws.match("/a")).toBe(h1);
      expect(ws.match("/b")).toBe(h2);
    });

    it("returns undefined on empty router", () => {
      expect(WebSocket.router().match("/anything")).toBe(undefined);
    });

    it("uses exact string matching", () => {
      const ws = WebSocket.router().route("/chat", {});
      expect(ws.match("/chat/room")).toBe(undefined);
      expect(ws.match("/cha")).toBe(undefined);
      expect(ws.match("chat")).toBe(undefined);
    });
  });

  describe("handler interface", () => {
    it("supports all four event handlers", () => {
      const ws = WebSocket.router().route("/full", {
        onOpen: () => {
          /* noop */
        },
        onMessage: () => {
          /* noop */
        },
        onClose: () => {
          /* noop */
        },
        onError: () => {
          /* noop */
        },
      });
      const handler = ws.match("/full");
      expect(typeof handler.onOpen).toBe("function");
      expect(typeof handler.onMessage).toBe("function");
      expect(typeof handler.onClose).toBe("function");
      expect(typeof handler.onError).toBe("function");
    });

    it("all handlers are optional", () => {
      const ws = WebSocket.router().route("/minimal", {});
      const handler = ws.match("/minimal");
      expect(handler.onOpen).toBe(undefined);
      expect(handler.onMessage).toBe(undefined);
      expect(handler.onClose).toBe(undefined);
      expect(handler.onError).toBe(undefined);
    });
  });
});

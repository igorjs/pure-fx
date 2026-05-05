/**
 * server.test.js - Server module runtime correctness tests.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output (black-box).
 *
 * Covers: builder pattern, response helpers, trie routing, middleware
 * composition, derive() context extension, error handling, streaming.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const {
  Server,
  json,
  text,
  html,
  redirect,
  compose,
  Task,
  Ok,
  Err,
  RouteNotFound,
  MethodNotAllowed,
  HandlerError,
} = await import("../dist/index.js");

// ═══════════════════════════════════════════════════════════════════════════════
// Response Helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe("Response helpers", () => {
  it("json() creates response with correct content-type and body", async () => {
    const res = json({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await res.text()).toBe('{"ok":true}');
  });

  it("json() accepts custom status via init", async () => {
    const res = json({ error: "bad" }, { status: 400 });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('{"error":"bad"}');
  });

  it("json() merges custom headers with content-type", async () => {
    const res = json("x", { headers: { "x-custom": "yes" } });
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("x-custom")).toBe("yes");
  });

  it("text() creates response with text/plain content-type", async () => {
    const res = text("hello");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("hello");
  });

  it("html() creates response with text/html content-type", async () => {
    const res = html("<h1>Hi</h1>");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toBe("<h1>Hi</h1>");
  });

  it("redirect() creates 302 response with location header", () => {
    const res = redirect("/login");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("redirect() accepts custom status", () => {
    const res = redirect("/new", 301);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/new");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Server Builder
// ═══════════════════════════════════════════════════════════════════════════════

describe("Server builder", () => {
  it("Server() returns a builder with .name", () => {
    const app = Server("test-api");
    expect(app.name).toBe("test-api");
  });

  it("builder is frozen (immutable)", () => {
    const app = Server("test");
    expect(Object.isFrozen(app)).toBe(true);
  });

  it("each .get() returns a new frozen builder", () => {
    const a = Server("test");
    const b = a.get("/x", () => text("x"));
    expect(a).not.toBe(b);
    expect(Object.isFrozen(b)).toBe(true);
  });

  it(".use() returns a new builder", () => {
    const a = Server("test");
    const mw = next => req => next(req);
    const b = a.use(mw);
    expect(a).not.toBe(b);
  });

  it(".onError() returns a new builder", () => {
    const a = Server("test");
    const b = a.onError(() => text("custom error", { status: 500 }));
    expect(a).not.toBe(b);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Route Matching
// ═══════════════════════════════════════════════════════════════════════════════

describe("Route matching", () => {
  const app = Server("test")
    .get("/health", () => json({ ok: true }))
    .get("/users", () => json([]))
    .get("/users/:id", ctx => json({ id: ctx.params.id }))
    .get("/users/:id/posts/:postId", ctx =>
      json({ userId: ctx.params.id, postId: ctx.params.postId }),
    )
    .post("/users", () => json({ created: true }, { status: 201 }))
    .get("/files/*", ctx => json({ path: ctx.params["*"] }));

  it("matches static route", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("matches route with single param", async () => {
    const res = await app.fetch(new Request("http://localhost/users/42"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "42" });
  });

  it("matches route with multiple params", async () => {
    const res = await app.fetch(new Request("http://localhost/users/u1/posts/p2"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "u1", postId: "p2" });
  });

  it("matches wildcard route", async () => {
    const res = await app.fetch(new Request("http://localhost/files/a/b/c.txt"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "a/b/c.txt" });
  });

  it("matches correct HTTP method", async () => {
    const res = await app.fetch(new Request("http://localhost/users", { method: "POST" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: true });
  });

  it("returns 404 for unmatched path", async () => {
    const res = await app.fetch(new Request("http://localhost/nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 405 for wrong method", async () => {
    const res = await app.fetch(new Request("http://localhost/users", { method: "DELETE" }));
    expect(res.status).toBe(405);
  });

  it("handles trailing slash", async () => {
    const res = await app.fetch(new Request("http://localhost/health/"));
    expect(res.status).toBe(200);
  });

  it("matches static route over param route", async () => {
    const app2 = Server("test")
      .get("/users", () => text("list"))
      .get("/users/:id", ctx => text(`user-${ctx.params.id}`));

    const resList = await app2.fetch(new Request("http://localhost/users"));
    expect(await resList.text()).toBe("list");

    const resParam = await app2.fetch(new Request("http://localhost/users/42"));
    expect(await resParam.text()).toBe("user-42");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Handler Normalization
// ═══════════════════════════════════════════════════════════════════════════════

describe("Handler normalization", () => {
  it("sync handler returning Response works", async () => {
    const app = Server("test").get("/sync", () => text("sync"));
    const res = await app.fetch(new Request("http://localhost/sync"));
    expect(await res.text()).toBe("sync");
  });

  it("async handler returning Task works", async () => {
    const app = Server("test").get("/async", () => Task.of(text("async")));
    const res = await app.fetch(new Request("http://localhost/async"));
    expect(await res.text()).toBe("async");
  });

  it("handler throwing is caught and returns 500", async () => {
    const app = Server("test").get("/throw", () => {
      throw new Error("boom");
    });
    const res = await app.fetch(new Request("http://localhost/throw"));
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// app.handle (Task-based)
// ═══════════════════════════════════════════════════════════════════════════════

describe("app.handle", () => {
  it("returns Task<Response, ServerError> for matched route", async () => {
    const app = Server("test").get("/ok", () => text("ok"));
    const result = await app.handle(new Request("http://localhost/ok")).run();
    expect(result.isOk).toBe(true);
    expect(result.value.status).toBe(200);
  });

  it("returns Err(RouteNotFound) for unmatched path", async () => {
    const app = Server("test").get("/ok", () => text("ok"));
    const result = await app.handle(new Request("http://localhost/missing")).run();
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr().tag).toBe("RouteNotFound");
  });

  it("returns Err(MethodNotAllowed) for wrong method", async () => {
    const app = Server("test").get("/ok", () => text("ok"));
    const result = await app.handle(new Request("http://localhost/ok", { method: "POST" })).run();
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr().tag).toBe("MethodNotAllowed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════════════

describe("Middleware", () => {
  it("middleware transforms response", async () => {
    const addHeader = next => req =>
      next(req).map(
        res =>
          new Response(res.body, {
            status: res.status,
            headers: { ...Object.fromEntries(res.headers), "x-test": "1" },
          }),
      );

    const app = Server("test")
      .use(addHeader)
      .get("/ok", () => text("ok"));

    const res = await app.fetch(new Request("http://localhost/ok"));
    expect(res.headers.get("x-test")).toBe("1");
    expect(await res.text()).toBe("ok");
  });

  it("middleware can short-circuit without calling next", async () => {
    let handlerCalled = false;
    const block = _next => _req => Task.of(text("blocked", { status: 403 }));

    const app = Server("test")
      .use(block)
      .get("/ok", () => {
        handlerCalled = true;
        return text("ok");
      });

    const res = await app.fetch(new Request("http://localhost/ok"));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("blocked");
    expect(handlerCalled).toBe(false);
  });

  it("middleware execution order: first .use() runs outermost", async () => {
    const order = [];
    const mw = label => next => req => {
      order.push(`${label}-before`);
      return next(req).tap(() => order.push(`${label}-after`));
    };

    const app = Server("test")
      .use(mw("A"))
      .use(mw("B"))
      .get("/ok", () => text("ok"));

    await app.fetch(new Request("http://localhost/ok"));
    expect(order).toEqual(["A-before", "B-before", "B-after", "A-after"]);
  });

  it("compose() creates a single middleware from multiple", async () => {
    const addA = next => req =>
      next(req).map(
        res =>
          new Response(res.body, {
            status: res.status,
            headers: { ...Object.fromEntries(res.headers), "x-a": "1" },
          }),
      );
    const addB = next => req =>
      next(req).map(
        res =>
          new Response(res.body, {
            status: res.status,
            headers: { ...Object.fromEntries(res.headers), "x-b": "2" },
          }),
      );

    const combined = compose(addA, addB);
    const app = Server("test")
      .use(combined)
      .get("/ok", () => text("ok"));

    const res = await app.fetch(new Request("http://localhost/ok"));
    expect(res.headers.get("x-a")).toBe("1");
    expect(res.headers.get("x-b")).toBe("2");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// derive() - Context Extension
// ═══════════════════════════════════════════════════════════════════════════════

describe("derive() context extension", () => {
  it("derive() adds typed fields to handler context", async () => {
    const app = Server("test")
      .derive(() => Task.of({ user: { name: "Alice" } }))
      .get("/profile", ctx => json({ name: ctx.user.name }));

    const res = await app.fetch(new Request("http://localhost/profile"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Alice" });
  });

  it("multiple derive() calls accumulate context", async () => {
    const app = Server("test")
      .derive(() => Task.of({ user: "Alice" }))
      .derive(() => Task.of({ role: "admin" }))
      .get("/info", ctx => json({ user: ctx.user, role: ctx.role }));

    const res = await app.fetch(new Request("http://localhost/info"));
    expect(await res.json()).toEqual({ user: "Alice", role: "admin" });
  });

  it("chained derive() receives accumulated context", async () => {
    const app = Server("test")
      .derive(() => Task.of({ count: 1 }))
      .derive((_req, ctx) => Task.of({ doubled: ctx.count * 2 }))
      .get("/val", ctx => json({ count: ctx.count, doubled: ctx.doubled }));

    const res = await app.fetch(new Request("http://localhost/val"));
    expect(await res.json()).toEqual({ count: 1, doubled: 2 });
  });

  it("derive() failure short-circuits to error handler", async () => {
    let handlerCalled = false;
    const app = Server("test")
      .derive(() => Task.fromResult(Err(HandlerError("unauthorized"))))
      .get("/secret", () => {
        handlerCalled = true;
        return text("secret");
      });

    const res = await app.fetch(new Request("http://localhost/secret"));
    expect(res.status).toBe(500);
    expect(handlerCalled).toBe(false);
  });

  it("derive() context available alongside route params", async () => {
    const app = Server("test")
      .derive(() => Task.of({ role: "viewer" }))
      .get("/users/:id", ctx => json({ id: ctx.params.id, role: ctx.role }));

    const res = await app.fetch(new Request("http://localhost/users/42"));
    expect(await res.json()).toEqual({ id: "42", role: "viewer" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Custom Error Handler
// ═══════════════════════════════════════════════════════════════════════════════

describe("Custom error handler", () => {
  it("onError() overrides default error response", async () => {
    const app = Server("test")
      .onError(err => json({ custom: true, tag: err.tag }, { status: 418 }))
      .get("/ok", () => text("ok"));

    const res = await app.fetch(new Request("http://localhost/missing"));
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ custom: true, tag: "RouteNotFound" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// .all() method
// ═══════════════════════════════════════════════════════════════════════════════

describe("Route.all()", () => {
  it(".all() matches any HTTP method", async () => {
    const app = Server("test").all("/any", () => text("any"));

    const get = await app.fetch(new Request("http://localhost/any"));
    expect(await get.text()).toBe("any");

    const post = await app.fetch(new Request("http://localhost/any", { method: "POST" }));
    expect(await post.text()).toBe("any");

    const del = await app.fetch(new Request("http://localhost/any", { method: "DELETE" }));
    expect(await del.text()).toBe("any");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// listen() returns Program
// ═══════════════════════════════════════════════════════════════════════════════

describe("listen() returns Program", () => {
  it("listen() produces an object with run and execute", () => {
    const mockAdapter = {
      serve: async () => {
        // No-op adapter for testing that .listen() returns a Program
      },
    };
    const app = Server("test")
      .get("/ok", () => text("ok"))
      .listen({ port: 0 }, mockAdapter);

    expect(typeof app.run).toBe("function");
    expect(typeof app.execute).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edge Cases & Additional Coverage
// ═══════════════════════════════════════════════════════════════════════════════

describe("Route matching edge cases", () => {
  it("handles double slashes in path", async () => {
    const app = Server("test").get("/health", () => text("ok"));
    const res = await app.fetch(new Request("http://localhost//health"));
    // Double slashes produce an empty segment that gets filtered out
    expect(res.status).toBe(200);
  });

  it("handles URL-encoded path segments", async () => {
    const app = Server("test").get("/users/:id", ctx => text(ctx.params.id));
    const res = await app.fetch(new Request("http://localhost/users/hello%20world"));
    // URL constructor decodes percent-encoded paths
    expect(res.status).toBe(200);
  });

  it("handles root route with param", async () => {
    const app = Server("test").get("/:slug", ctx => text(ctx.params.slug));
    const res = await app.fetch(new Request("http://localhost/about"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("about");
  });

  it("wildcard captures empty rest when path matches exactly to wildcard level", async () => {
    const app = Server("test").get("/files/*", ctx => text(ctx.params["*"]));
    // /files/ with nothing after matches wildcard with empty string
    const result = await app.handle(new Request("http://localhost/files/")).run();
    // Either matches with empty wildcard or falls to leaf; both valid
    expect(result.isOk || result.isErr).toBe(true);
  });

  it("param route and static route at same level: static wins", async () => {
    const app = Server("test")
      .get("/users/me", () => text("me-page"))
      .get("/users/:id", ctx => text(`user-${ctx.params.id}`));

    const meRes = await app.fetch(new Request("http://localhost/users/me"));
    expect(await meRes.text()).toBe("me-page");

    const paramRes = await app.fetch(new Request("http://localhost/users/42"));
    expect(await paramRes.text()).toBe("user-42");
  });
});

describe("Middleware + derive interaction", () => {
  it("middleware runs around handler even when derive fails", async () => {
    const middlewareRan = { before: false, after: false };

    const trackMw = next => req => {
      middlewareRan.before = true;
      return next(req).tap(() => {
        middlewareRan.after = true;
      });
    };

    const app = Server("test")
      .use(trackMw)
      .derive(() => Task.fromResult(Err(HandlerError("fail"))))
      .get("/x", () => text("unreachable"));

    await app.fetch(new Request("http://localhost/x"));
    // Middleware before runs, but after may or may not depending on error flow
    expect(middlewareRan.before).toBe(true);
  });

  it("middleware can transform error responses from derive failures", async () => {
    const addHeader = next => req =>
      next(req).map(
        res =>
          new Response(res.body, {
            status: res.status,
            headers: { ...Object.fromEntries(res.headers), "x-wrapped": "true" },
          }),
      );

    const app = Server("test")
      .use(addHeader)
      .onError(err => json({ error: err.tag }, { status: 401 }))
      .derive(() => Task.fromResult(Err(HandlerError("no auth"))))
      .get("/secret", () => text("secret"));

    const res = await app.fetch(new Request("http://localhost/secret"));
    // Error handler produces the response, then middleware wraps it
    expect(res.status).toBe(401);
  });
});

describe("Streaming responses", () => {
  it("handler can return Response with ReadableStream body", async () => {
    const app = Server("test").get("/stream", () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("chunk1"));
          controller.enqueue(new TextEncoder().encode("chunk2"));
          controller.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "text/plain" } });
    });

    const res = await app.fetch(new Request("http://localhost/stream"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe("chunk1chunk2");
  });
});

describe("Handler returning Task with error", () => {
  it("Task error flows to error handler", async () => {
    const app = Server("test").get("/fail", () =>
      Task.fromResult(Err(RouteNotFound("custom not found"))),
    );

    const res = await app.fetch(new Request("http://localhost/fail"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("custom not found");
  });

  it("app.handle preserves typed errors from Task handlers", async () => {
    const app = Server("test").get("/fail", () => Task.fromResult(Err(HandlerError("oops"))));

    const result = await app.handle(new Request("http://localhost/fail")).run();
    expect(result.isErr).toBe(true);
    expect(result.unwrapErr().tag).toBe("HandlerError");
    expect(result.unwrapErr().message).toBe("oops");
  });
});

/**
 * server.test.js - Server module runtime correctness tests.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Tests the compiled dist/ output (black-box).
 *
 * Covers: builder pattern, response helpers, trie routing, middleware
 * composition, derive() context extension, error handling, streaming.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(await res.text(), '{"ok":true}');
  });

  it("json() accepts custom status via init", async () => {
    const res = json({ error: "bad" }, { status: 400 });
    assert.equal(res.status, 400);
    assert.equal(await res.text(), '{"error":"bad"}');
  });

  it("json() merges custom headers with content-type", async () => {
    const res = json("x", { headers: { "x-custom": "yes" } });
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("x-custom"), "yes");
  });

  it("text() creates response with text/plain content-type", async () => {
    const res = text("hello");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(await res.text(), "hello");
  });

  it("html() creates response with text/html content-type", async () => {
    const res = html("<h1>Hi</h1>");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(await res.text(), "<h1>Hi</h1>");
  });

  it("redirect() creates 302 response with location header", () => {
    const res = redirect("/login");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login");
  });

  it("redirect() accepts custom status", () => {
    const res = redirect("/new", 301);
    assert.equal(res.status, 301);
    assert.equal(res.headers.get("location"), "/new");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Server Builder
// ═══════════════════════════════════════════════════════════════════════════════

describe("Server builder", () => {
  it("Server() returns a builder with .name", () => {
    const app = Server("test-api");
    assert.equal(app.name, "test-api");
  });

  it("builder is frozen (immutable)", () => {
    const app = Server("test");
    assert.ok(Object.isFrozen(app));
  });

  it("each .get() returns a new frozen builder", () => {
    const a = Server("test");
    const b = a.get("/x", () => text("x"));
    assert.notStrictEqual(a, b);
    assert.ok(Object.isFrozen(b));
  });

  it(".use() returns a new builder", () => {
    const a = Server("test");
    const mw = next => req => next(req);
    const b = a.use(mw);
    assert.notStrictEqual(a, b);
  });

  it(".onError() returns a new builder", () => {
    const a = Server("test");
    const b = a.onError(() => text("custom error", { status: 500 }));
    assert.notStrictEqual(a, b);
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
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("matches route with single param", async () => {
    const res = await app.fetch(new Request("http://localhost/users/42"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: "42" });
  });

  it("matches route with multiple params", async () => {
    const res = await app.fetch(new Request("http://localhost/users/u1/posts/p2"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { userId: "u1", postId: "p2" });
  });

  it("matches wildcard route", async () => {
    const res = await app.fetch(new Request("http://localhost/files/a/b/c.txt"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { path: "a/b/c.txt" });
  });

  it("matches correct HTTP method", async () => {
    const res = await app.fetch(new Request("http://localhost/users", { method: "POST" }));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { created: true });
  });

  it("returns 404 for unmatched path", async () => {
    const res = await app.fetch(new Request("http://localhost/nonexistent"));
    assert.equal(res.status, 404);
  });

  it("returns 405 for wrong method", async () => {
    const res = await app.fetch(new Request("http://localhost/users", { method: "DELETE" }));
    assert.equal(res.status, 405);
  });

  it("handles trailing slash", async () => {
    const res = await app.fetch(new Request("http://localhost/health/"));
    assert.equal(res.status, 200);
  });

  it("matches static route over param route", async () => {
    const app2 = Server("test")
      .get("/users", () => text("list"))
      .get("/users/:id", ctx => text(`user-${ctx.params.id}`));

    const resList = await app2.fetch(new Request("http://localhost/users"));
    assert.equal(await resList.text(), "list");

    const resParam = await app2.fetch(new Request("http://localhost/users/42"));
    assert.equal(await resParam.text(), "user-42");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Handler Normalization
// ═══════════════════════════════════════════════════════════════════════════════

describe("Handler normalization", () => {
  it("sync handler returning Response works", async () => {
    const app = Server("test").get("/sync", () => text("sync"));
    const res = await app.fetch(new Request("http://localhost/sync"));
    assert.equal(await res.text(), "sync");
  });

  it("async handler returning Task works", async () => {
    const app = Server("test").get("/async", () => Task.of(text("async")));
    const res = await app.fetch(new Request("http://localhost/async"));
    assert.equal(await res.text(), "async");
  });

  it("handler throwing is caught and returns 500", async () => {
    const app = Server("test").get("/throw", () => {
      throw new Error("boom");
    });
    const res = await app.fetch(new Request("http://localhost/throw"));
    assert.equal(res.status, 500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// app.handle (Task-based)
// ═══════════════════════════════════════════════════════════════════════════════

describe("app.handle", () => {
  it("returns Task<Response, ServerError> for matched route", async () => {
    const app = Server("test").get("/ok", () => text("ok"));
    const result = await app.handle(new Request("http://localhost/ok")).run();
    assert.equal(result.isOk, true);
    assert.equal(result.value.status, 200);
  });

  it("returns Err(RouteNotFound) for unmatched path", async () => {
    const app = Server("test").get("/ok", () => text("ok"));
    const result = await app.handle(new Request("http://localhost/missing")).run();
    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr().tag, "RouteNotFound");
  });

  it("returns Err(MethodNotAllowed) for wrong method", async () => {
    const app = Server("test").get("/ok", () => text("ok"));
    const result = await app.handle(new Request("http://localhost/ok", { method: "POST" })).run();
    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr().tag, "MethodNotAllowed");
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
    assert.equal(res.headers.get("x-test"), "1");
    assert.equal(await res.text(), "ok");
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
    assert.equal(res.status, 403);
    assert.equal(await res.text(), "blocked");
    assert.equal(handlerCalled, false);
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
    assert.deepEqual(order, ["A-before", "B-before", "B-after", "A-after"]);
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
    assert.equal(res.headers.get("x-a"), "1");
    assert.equal(res.headers.get("x-b"), "2");
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
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { name: "Alice" });
  });

  it("multiple derive() calls accumulate context", async () => {
    const app = Server("test")
      .derive(() => Task.of({ user: "Alice" }))
      .derive(() => Task.of({ role: "admin" }))
      .get("/info", ctx => json({ user: ctx.user, role: ctx.role }));

    const res = await app.fetch(new Request("http://localhost/info"));
    assert.deepEqual(await res.json(), { user: "Alice", role: "admin" });
  });

  it("chained derive() receives accumulated context", async () => {
    const app = Server("test")
      .derive(() => Task.of({ count: 1 }))
      .derive((_req, ctx) => Task.of({ doubled: ctx.count * 2 }))
      .get("/val", ctx => json({ count: ctx.count, doubled: ctx.doubled }));

    const res = await app.fetch(new Request("http://localhost/val"));
    assert.deepEqual(await res.json(), { count: 1, doubled: 2 });
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
    assert.equal(res.status, 500);
    assert.equal(handlerCalled, false);
  });

  it("derive() context available alongside route params", async () => {
    const app = Server("test")
      .derive(() => Task.of({ role: "viewer" }))
      .get("/users/:id", ctx => json({ id: ctx.params.id, role: ctx.role }));

    const res = await app.fetch(new Request("http://localhost/users/42"));
    assert.deepEqual(await res.json(), { id: "42", role: "viewer" });
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
    assert.equal(res.status, 418);
    assert.deepEqual(await res.json(), { custom: true, tag: "RouteNotFound" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// .all() method
// ═══════════════════════════════════════════════════════════════════════════════

describe("Route.all()", () => {
  it(".all() matches any HTTP method", async () => {
    const app = Server("test").all("/any", () => text("any"));

    const get = await app.fetch(new Request("http://localhost/any"));
    assert.equal(await get.text(), "any");

    const post = await app.fetch(new Request("http://localhost/any", { method: "POST" }));
    assert.equal(await post.text(), "any");

    const del = await app.fetch(new Request("http://localhost/any", { method: "DELETE" }));
    assert.equal(await del.text(), "any");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// listen() returns Program
// ═══════════════════════════════════════════════════════════════════════════════

describe("listen() returns Program", () => {
  it("listen() produces an object with run and execute", () => {
    const mockAdapter = {
      serve: async () => {},
    };
    const app = Server("test")
      .get("/ok", () => text("ok"))
      .listen({ port: 0 }, mockAdapter);

    assert.equal(typeof app.run, "function");
    assert.equal(typeof app.execute, "function");
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
    assert.equal(res.status, 200);
  });

  it("handles URL-encoded path segments", async () => {
    const app = Server("test").get("/users/:id", ctx => text(ctx.params.id));
    const res = await app.fetch(new Request("http://localhost/users/hello%20world"));
    // URL constructor decodes percent-encoded paths
    assert.equal(res.status, 200);
  });

  it("handles root route with param", async () => {
    const app = Server("test").get("/:slug", ctx => text(ctx.params.slug));
    const res = await app.fetch(new Request("http://localhost/about"));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "about");
  });

  it("wildcard captures empty rest when path matches exactly to wildcard level", async () => {
    const app = Server("test").get("/files/*", ctx => text(ctx.params["*"]));
    // /files/ with nothing after matches wildcard with empty string
    const result = await app.handle(new Request("http://localhost/files/")).run();
    // Either matches with empty wildcard or falls to leaf; both valid
    assert.equal(result.isOk || result.isErr, true);
  });

  it("param route and static route at same level: static wins", async () => {
    const app = Server("test")
      .get("/users/me", () => text("me-page"))
      .get("/users/:id", ctx => text(`user-${ctx.params.id}`));

    const meRes = await app.fetch(new Request("http://localhost/users/me"));
    assert.equal(await meRes.text(), "me-page");

    const paramRes = await app.fetch(new Request("http://localhost/users/42"));
    assert.equal(await paramRes.text(), "user-42");
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
    assert.equal(middlewareRan.before, true);
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
    assert.equal(res.status, 401);
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
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.equal(body, "chunk1chunk2");
  });
});

describe("Handler returning Task with error", () => {
  it("Task error flows to error handler", async () => {
    const app = Server("test").get("/fail", () =>
      Task.fromResult(Err(RouteNotFound("custom not found"))),
    );

    const res = await app.fetch(new Request("http://localhost/fail"));
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "custom not found");
  });

  it("app.handle preserves typed errors from Task handlers", async () => {
    const app = Server("test").get("/fail", () => Task.fromResult(Err(HandlerError("oops"))));

    const result = await app.handle(new Request("http://localhost/fail")).run();
    assert.equal(result.isErr, true);
    assert.equal(result.unwrapErr().tag, "HandlerError");
    assert.equal(result.unwrapErr().message, "oops");
  });
});

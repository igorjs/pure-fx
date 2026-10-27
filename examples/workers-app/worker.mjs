// SPDX-License-Identifier: Apache-2.0
/**
 * Web-standard Cloudflare Worker: an in-memory items API built on Server and Schema.
 *
 * Uses no Node built-ins, so it runs without any compatibility flag.
 * Run: npx wrangler dev examples/workers-app/worker.mjs --var GREETING:hello
 */

import { ErrType, Ok, Result, Schema, Server, Task, json } from "@igorjs/pure-fx";
import { toWorkersHandler, workersEnv } from "@igorjs/pure-fx/runtime/adapter/workers";

// ── Typed errors ────────────────────────────────────────────────────────────

const ValidationFailed = ErrType("ValidationFailed", "VALIDATION_FAILED");
const ItemNotFound = ErrType("ItemNotFound", "ITEM_NOT_FOUND");

const STATUS_BY_TAG = { ValidationFailed: 400, ItemNotFound: 404 };

const errorResponse = error =>
  json(
    { error: { tag: error.tag, code: error.code, message: error.message } },
    { status: STATUS_BY_TAG[error.tag] ?? 500 },
  );

/** Turn a Task<Response, AppError> into the Task<Response, never> the server expects. */
const respond = task =>
  Task(async () => {
    const result = await task.run();
    return Ok(result.match({ Ok: response => response, Err: errorResponse }));
  });

// ── Input schema ────────────────────────────────────────────────────────────

const CreateItem = Schema.object({
  name: Schema.string.refine(s => s.trim().length > 0, "non-empty name"),
});

const parseBody = req =>
  Task.fromPromise(
    () => req.json(),
    () => ValidationFailed("body: request body is not valid JSON"),
  ).flatMap(raw =>
    Task.fromResult(
      CreateItem.parse(raw).mapErr(e =>
        ValidationFailed(`${e.path.join(".") || "body"}: expected ${e.expected}, got ${e.received}`),
      ),
    ),
  );

// ── App ─────────────────────────────────────────────────────────────────────

// Module state lives as long as the Worker isolate, so it is a per-isolate cache, not durable storage.
const items = new Map();
let nextId = 1;

const app = Server("items-worker")
  .get("/items", () => json([...items.values()]))
  .get("/items/:id", ctx =>
    respond(
      Task.fromResult(
        Result.fromNullable(items.get(ctx.params.id), () =>
          ItemNotFound(`item ${ctx.params.id} does not exist`),
        ),
      )
        .map(item => json(item)),
    ),
  )
  .post("/items", ctx =>
    respond(
      parseBody(ctx.req).map(input => {
        const item = { id: String(nextId++), ...input };
        items.set(item.id, item);
        return json(item, { status: 201 });
      }),
    ),
  )
  .get("/greeting", ctx => json({ greeting: workersEnv(ctx.req).GREETING ?? null }));

export default toWorkersHandler(app);

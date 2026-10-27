// SPDX-License-Identifier: Apache-2.0
/**
 * In-memory notes API built on Server, Schema, Result and Task.
 *
 * Run: node examples/rest-api/server.mjs   (or: bun examples/rest-api/server.mjs)
 * Env: PORT picks the port; by default a free port is chosen.
 */

import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { ErrType, Ok, Result, Schema, Server, Task, json } from "@igorjs/pure-fx";
import { bunAdapter } from "@igorjs/pure-fx/runtime/adapter/bun";
import { nodeAdapter } from "@igorjs/pure-fx/runtime/adapter/node";

// ── Typed errors ────────────────────────────────────────────────────────────

const ValidationFailed = ErrType("ValidationFailed", "VALIDATION_FAILED");
const NoteNotFound = ErrType("NoteNotFound", "NOTE_NOT_FOUND");

const STATUS_BY_TAG = { ValidationFailed: 400, NoteNotFound: 404 };

const errorResponse = error =>
  json(
    { error: { tag: error.tag, code: error.code, message: error.message } },
    { status: STATUS_BY_TAG[error.tag] ?? 500 },
  );

// ── Input schemas ───────────────────────────────────────────────────────────

const title = Schema.string.refine(s => s.trim().length > 0, "non-empty title");

const CreateNote = Schema.object({ title, body: Schema.string.default("") });
const UpdateNote = Schema.object({ title: title.optional(), body: Schema.string.optional() });

/** Validate unknown input against a schema, reporting the offending field path. */
const validate = (schema, input) =>
  schema
    .parse(input)
    .mapErr(e =>
      ValidationFailed(`${e.path.join(".") || "body"}: expected ${e.expected}, got ${e.received}`),
    );

/** Read the request body as JSON, as a Task so a malformed body is a typed failure. */
const readJson = req =>
  Task.fromPromise(
    () => req.json(),
    () => ValidationFailed("body: request body is not valid JSON"),
  );

const parseBody = (req, schema) => readJson(req).flatMap(raw => Task.fromResult(validate(schema, raw)));

// ── Handlers ────────────────────────────────────────────────────────────────

/** Turn a Task<Response, AppError> into the Task<Response, never> the server expects. */
const respond = task =>
  Task(async () => {
    const result = await task.run();
    return Ok(result.match({ Ok: response => response, Err: errorResponse }));
  });

/**
 * Build the notes app. Every call owns its own store, so apps never share data.
 * @returns {import("@igorjs/pure-fx").ServerBuilder}
 */
export const createApp = () => {
  const notes = new Map();
  let nextId = 1;

  const find = id =>
    Result.fromNullable(notes.get(id), () => NoteNotFound(`note ${id} does not exist`));

  return Server("notes-api")
    .get("/notes", () => json([...notes.values()]))
    .get("/notes/:id", ctx => respond(Task.fromResult(find(ctx.params.id)).map(note => json(note))))
    .post("/notes", ctx =>
      respond(
        parseBody(ctx.req, CreateNote).map(input => {
          const note = { id: String(nextId++), ...input };
          notes.set(note.id, note);
          return json(note, { status: 201 });
        }),
      ),
    )
    .patch("/notes/:id", ctx =>
      respond(
        Task.fromResult(find(ctx.params.id)).flatMap(current =>
          parseBody(ctx.req, UpdateNote).map(changes => {
            const updated = { ...current };
            if (changes.title !== undefined) updated.title = changes.title;
            if (changes.body !== undefined) updated.body = changes.body;
            notes.set(updated.id, updated);
            return json(updated);
          }),
        ),
      ),
    )
    .delete("/notes/:id", ctx =>
      respond(
        Task.fromResult(find(ctx.params.id)).map(note => {
          notes.delete(note.id);
          return new Response(null, { status: 204 });
        }),
      ),
    );
};

// ── Startup ─────────────────────────────────────────────────────────────────

/** Ask the OS for a free port; the adapter does not report the port it bound. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = process.env.PORT ? Number(process.env.PORT) : await freePort();
  const adapter = globalThis.Bun ? bunAdapter : nodeAdapter;
  console.log(`listening on port ${port}`);
  await createApp().listen({ port, hostname: "127.0.0.1" }, adapter).run();
}

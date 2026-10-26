# REST API example

A small in-memory notes API that shows how the pieces of pure-fx fit together:

- `Server` for routing (`GET`, `POST`, `PATCH`, `DELETE` with typed `:id` params).
- `Schema` to validate request bodies, with the failing field path in the error message.
- `ErrType` for typed errors (`ValidationFailed` maps to 400, `NoteNotFound` maps to 404).
- `Result` for lookups (`Result.fromNullable`) and `Task` for the async body read and the handler pipelines.

`createApp()` is exported and builds a fresh store on every call. The server only starts
listening when the file is run directly.

## Run

Build the library first, because the example imports `@igorjs/pure-fx` from the local `dist/`
through the package self-reference. No install step is needed inside this folder.

```sh
pnpm run build
node examples/rest-api/server.mjs
bun examples/rest-api/server.mjs
```

The server prints `listening on port <n>`. Set `PORT=3000` to pick the port, otherwise a free
port is chosen.

## Try it

```sh
BASE=http://127.0.0.1:3000

curl -i -X POST $BASE/notes -H 'content-type: application/json' -d '{"title":"first"}'
curl $BASE/notes
curl $BASE/notes/1
curl -X PATCH $BASE/notes/1 -H 'content-type: application/json' -d '{"body":"hello"}'
curl -i -X DELETE $BASE/notes/1

# Typed errors
curl -i $BASE/notes/99                                                      # 404 NOTE_NOT_FOUND
curl -i -X POST $BASE/notes -H 'content-type: application/json' -d '{"title":5}'  # 400 VALIDATION_FAILED
```

Error bodies look like `{"error":{"tag":"NoteNotFound","code":"NOTE_NOT_FOUND","message":"..."}}`.

## Test

```sh
pnpm run test:examples
```

This starts the example on Node and on Bun, runs CRUD and invalid input requests against each,
and stops it. A missing runtime is skipped locally and fails the run with `--ci` or `CI=1`.

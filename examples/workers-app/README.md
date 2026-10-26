# Workers app example

A web-standard Cloudflare Worker with an in-memory items store, built with `Server` and exported
through `toWorkersHandler`:

- `GET /items` lists items, `GET /items/:id` returns one.
- `POST /items` creates an item from JSON validated with `Schema`.
- An unknown id gives a typed 404 body: `{"error":{"tag":"ItemNotFound","code":"ITEM_NOT_FOUND","message":"..."}}`.
- `GET /greeting` reads the `GREETING` binding through `workersEnv`.

The worker uses no Node built-ins, so it needs no compatibility flags (no `nodejs_compat`).
The store lives in the isolate, so it is a cache and not durable storage.

## Run

Build the library, then start the worker with `wrangler dev`. A `wrangler.toml` is not required.

```sh
pnpm run build
npx wrangler dev examples/workers-app/worker.mjs --compatibility-date 2024-01-01 --var GREETING:hello
curl -i -X POST localhost:8787/items -H 'content-type: application/json' -d '{"name":"first"}'
curl localhost:8787/items
curl -i localhost:8787/items/99
curl localhost:8787/greeting
```

## Test

```sh
pnpm run test:examples
```

The `workers` lane loads the worker in a fresh Miniflare instance without `nodejs_compat`, with
`GREETING` bound, and checks the list, create, error and env routes. It rewrites the package
imports to the local `dist/` in a temporary copy. A missing Miniflare is skipped locally and fails
the run with `--ci` or `CI=1`.

# Runtime

HTTP server, program lifecycle, logging, configuration, and cross-runtime utilities.

## Server

Production-grade HTTP server with typed routing, middleware, and runtime adapters.

```ts
import { Server, json, text, html } from '@igorjs/pure-ts'
import { nodeAdapter } from '@igorjs/pure-ts/runtime/adapter/node'

const app = Server.create()
  .get('/health', () => json({ status: 'ok' }))
  .get('/users/:id', ctx => {
    const { id } = ctx.params; // typed from route pattern
    return json({ id });
  })
  .post('/users', async ctx => {
    const body = await ctx.body.json();
    return json(body, { status: 201 });
  });

// Start with runtime adapter
await app.listen(nodeAdapter, { port: 3000 });
```

Adapters: `nodeAdapter`, `denoAdapter`, `bunAdapter`, `lambdaAdapter`

## Program

Effect system for CLI entry points with signal handling and graceful shutdown.

```ts
import { Program } from '@igorjs/pure-ts'

Program.create()
  .setup(async () => {
    // initialization
    return { db: await connectDb() };
  })
  .run(async ({ db }) => {
    // main logic
    await processQueue(db);
  })
  .teardown(async ({ db }) => {
    await db.close();
  })
  .execute(); // handles SIGTERM/SIGINT, returns exit code
```

## Logger

Structured logging with levels and JSON output.

```ts
import { Logger } from '@igorjs/pure-ts'

const log = Logger.create({ level: 'info', json: true });
log.info('server started', { port: 3000 });
log.error('request failed', { path: '/api', status: 500 });
```

## Config

Environment variable validation via Schema.

```ts
import { Config, Schema } from '@igorjs/pure-ts'

const config = Config.from({
  PORT: Schema.string.transform(Number),
  DATABASE_URL: Schema.string,
  DEBUG: Schema.boolean.default(false),
}).load();
// Result<{ PORT: number, DATABASE_URL: string, DEBUG: boolean }, SchemaError>
```

## Os / Process / Path

Cross-runtime OS info, process control, and path utilities.

```ts
import { Os, Process, Path, Eol } from '@igorjs/pure-ts'

Os.hostname();    // Option<string>
Os.platform();    // 'darwin' | 'linux' | 'win32' | ...
Os.tmpDir();      // '/tmp'
Os.homeDir();     // Option<string>

Process.cwd();    // Result<string, ProcessError>
Process.pid();    // Option<number>
Process.argv();   // readonly string[]
Process.parseArgs({ port: Schema.string.transform(Number) });
// Result<{ port: number }, SchemaError>

Path.join('src', 'index.ts');   // 'src/index.ts'
Path.resolve('..', 'file.ts'); // absolute path
Path.parse('/home/user/file.ts');
// { root: '/', dir: '/home/user', base: 'file.ts', ext: '.ts', name: 'file' }

Eol.normalize('line1\r\nline2'); // 'line1\nline2'
```

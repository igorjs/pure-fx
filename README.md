# Pure FX

[![CI](https://github.com/igorjs/pure-fx/actions/workflows/ci.yml/badge.svg)](https://github.com/igorjs/pure-fx/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@igorjs/pure-fx?color=blue)](https://www.npmjs.com/package/@igorjs/pure-fx)
[![npm downloads](https://img.shields.io/npm/dm/@igorjs/pure-fx)](https://www.npmjs.com/package/@igorjs/pure-fx)
[![JSR](https://jsr.io/badges/@igorjs/pure-fx)](https://jsr.io/@igorjs/pure-fx)
[![JSR Score](https://jsr.io/badges/@igorjs/pure-fx/score)](https://jsr.io/@igorjs/pure-fx)
[![License](https://img.shields.io/npm/l/@igorjs/pure-fx)](https://github.com/igorjs/pure-fx/blob/main/LICENSE)
[![Tests](https://img.shields.io/badge/tests-1462_passing-brightgreen)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)]()

Functional application framework for TypeScript. Zero dependencies.

> **Note:** This project is in beta. APIs may change between minor versions until 1.0.

Errors are values, not exceptions. Data is immutable, enforced at runtime. Async is lazy and composable.

![Node.js](https://img.shields.io/badge/Node.js_22+-339933?logo=nodedotjs&logoColor=white)
![Deno](https://img.shields.io/badge/Deno_2.0+-000000?logo=deno&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/CF_Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Chromium-4285F4?logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript_5.5+-3178C6?logo=typescript&logoColor=white)

## Install

```bash
npm install @igorjs/pure-fx
```

Also available on [JSR](https://jsr.io/@igorjs/pure-fx):

```bash
npx jsr add @igorjs/pure-fx
```

## Quick Example

```ts
import { Ok, Err, pipe, Task, Schema, File, Valid, Invalid } from '@igorjs/pure-fx'

// Errors as values, not exceptions
const parse = (s: string) => {
  const n = Number(s);
  return Number.isNaN(n) ? Err('not a number') : Ok(n);
};

pipe(parse('42'), r => r.map(n => n * 2)); // Ok(84)

// Lazy async with Result
const data = await Task.fromPromise(() => fetch('/api'), String)
  .map(r => r.json())
  .timeout(5000, () => 'timed out')
  .run(); // Result<unknown, string>

// Validate unknown input
const User = Schema.object({ name: Schema.string, age: Schema.number });
User.parse(untrustedData); // Result<{ name: string; age: number }, SchemaError>

// Accumulate ALL validation errors (not just the first)
const validateName = (s: string) => s ? Valid(s) : Invalid('name required');
const validateAge = (n: number) => n > 0 ? Valid(n) : Invalid('must be positive');
validateName('').zip(validateAge(-1)); // Invalid(['name required', 'must be positive'])

// Read a file (works on Node, Deno, Bun)
const content = await File.read('./config.json').run();
```

## Modules

| Layer | Primitives | Docs |
|-------|------------|------|
| **Core** | `Result`, `Option`, `Validation`, `pipe`, `flow`, `Match`, `Eq`, `Ord`, `State`, `Lens`, `Prism`, `Iso`, `Traversal`, `LensOptional` | [docs/core.md](docs/core.md) |
| **Data** | `Record`, `List`, `NonEmptyList`, `HashMap`, `Schema`, `Codec`, `ADT`, `StableVec` | [docs/data.md](docs/data.md) |
| **Types** | `ErrType`, `Type`, `Duration`, `Cron` | [docs/types.md](docs/types.md) |
| **Async** | `Task`, `Stream`, `Lazy`, `Env`, `Timer`, `Retry`, `CircuitBreaker`, `Semaphore`, `Mutex`, `RateLimiter`, `Cache`, `Channel`, `StateMachine`, `EventEmitter`, `Pool`, `Queue`, `CronRunner` | [docs/async.md](docs/async.md) |
| **IO** | `File`, `Command`, `Json`, `Crypto`, `Encoding`, `Compression`, `Clone`, `Url`, `Client`, `Terminal`, `WebSocket`, `Dns`, `Net`, `FFI` | [docs/io.md](docs/io.md) |
| **Runtime** | `Server`, `Program`, `Logger`, `Config`, `Os`, `Process`, `Path`, `Eol`, `Platform` | [docs/runtime.md](docs/runtime.md) |

[Full documentation with examples](docs/index.md)

## Runtime Compatibility

Most modules are pure TypeScript and work everywhere. Runtime-dependent modules adapt automatically:

| Module | Node 22+ | Node 25+ | Deno 2+ | Bun | Workers | Browser |
|--------|----------|----------|---------|-----|---------|---------|
| Core, Data, Async, Types | Yes | Yes | Yes | Yes | Yes | Yes |
| `Crypto` (full Web Crypto) | Yes | Yes | Yes | Yes | Yes | Yes |
| `Compression` | Yes | Yes | Yes | Yes | Partial | Partial |
| `File`, `Command`, `Terminal` | Yes | Yes | Yes | Yes | No | No |
| `Process`, `Os`, `Path` | Yes | Yes | Yes | Yes | No | No |
| `Dns`, `Net` | Yes | Yes | Yes | Yes | No | No |
| `FFI` | No | Yes (`--allow-ffi`) | Yes (`--allow-ffi`) | Yes | No | No |
| `Server` | Yes | Yes | Yes | Yes | Yes (adapter) | No |

## Troubleshooting

### Compression hangs on older Deno versions

Pure FX uses `Blob.stream().pipeThrough()` for compression, which requires Deno 1.38+. If compression operations hang, update Deno.

### FFI not available

FFI requires native library loading capabilities:
- **Deno**: Run with `--allow-ffi`
- **Bun**: Works out of the box
- **Node 25+**: Run with `--allow-ffi` (experimental)
- **Node 22-24**: Not available. `FFI.open()` returns `Err(FfiError("..."))`. Use `FFI.isAvailable()` to check.

### Os/Process return None for some values

Some OS APIs are permission-gated on Deno (e.g. `hostname`, `env`). Run with `--allow-sys` and `--allow-env`, or use `deno run --allow-all`.

On Windows, `Process.uid()` and `Process.gid()` return `None` (POSIX-only APIs).

### File operations return Err

All file operations return `Result` or `Task` instead of throwing. Check the error:

```ts
const result = await File.read('./missing.txt').run();
if (result.isErr) {
  console.log(result.error.tag);     // "FileError"
  console.log(result.error.message); // "ENOENT: no such file..."
}
```

### Deno requires version 2.0+

Pure FX uses Deno 2.0+ APIs. Deno 1.x is not supported. Compression requires Deno 1.38+ for `CompressionStream`, but all other modules require Deno 2.0+.

### Modules return Err in Workers/Browser

Runtime-dependent modules (`File`, `Command`, `Process`, etc.) gracefully return `Err` or `None` in environments that don't support them. They never throw.

## Subpath Imports

```ts
// Import everything
import { Ok, Task, Schema } from '@igorjs/pure-fx'

// Or import specific modules for smaller bundles
import { Ok, Err, pipe } from '@igorjs/pure-fx/core'
import { Schema, HashMap } from '@igorjs/pure-fx/data'
import { Task, Stream } from '@igorjs/pure-fx/async'
import { File, Command, FFI } from '@igorjs/pure-fx/io'
```

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## License

[Apache-2.0](LICENSE)

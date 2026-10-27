# Pure FX

[![CI](https://github.com/igorjs/pure-fx/actions/workflows/ci.yml/badge.svg)](https://github.com/igorjs/pure-fx/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@igorjs/pure-fx?color=blue)](https://www.npmjs.com/package/@igorjs/pure-fx)
[![npm downloads](https://img.shields.io/npm/dm/@igorjs/pure-fx)](https://www.npmjs.com/package/@igorjs/pure-fx)
[![JSR](https://jsr.io/badges/@igorjs/pure-fx)](https://jsr.io/@igorjs/pure-fx)
[![License](https://img.shields.io/npm/l/@igorjs/pure-fx)](https://github.com/igorjs/pure-fx/blob/main/LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)]()

Functional application framework for TypeScript. Zero dependencies.

> **Note:** This project is in beta. APIs may change between minor versions until 1.0.

Errors are values, not exceptions. Data is immutable, enforced at runtime. Async is lazy and composable.

Runs on Node.js 22+, Bun, Cloudflare Workers, and Chromium.

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

// Read a file (works on Node, Bun)
const content = await File.read('./config.json').run();
```

## Examples

- [REST API](examples/rest-api): Server, Schema and typed errors on Node and Bun.
- [Workers app](examples/workers-app): a web-standard Worker, tested in Miniflare.
- [CLI](examples/cli): Program with explicit exit codes, tested on Node and Bun.

## Modules

| Layer | Primitives | Docs |
|-------|------------|------|
| **Core** | `Result`, `Option`, `Validation`, `pipe`, `flow`, `Match`, `Eq`, `Ord`, `State`, `Lens`, `Prism`, `Iso`, `Traversal`, `LensOptional` | [docs/core.md](docs/core.md) |
| **Data** | `Record`, `List`, `NonEmptyList`, `HashMap`, `Immutable`, `Schema`, `Codec`, `ADT`, `StableVec` | [docs/data.md](docs/data.md) |
| **Types** | `TypeDef` (+ `Str`, `Num`, `Int`, `UInt`, `Bool`, `Bytes`, `Nil`, `DateTime`, `Vec`, `Pair`, `Tuple`, `Dict`, `Struct`, `ListOf`, `MapOf`, `Maybe`, `Either`), `ErrType`, `Type`, `Duration`, `Cron` | [docs/types.md](docs/types.md) |
| **Async** | `Task`, `Stream`, `Lazy`, `Env`, `Timer`, `Retry`, `CircuitBreaker`, `Semaphore`, `Mutex`, `RateLimiter`, `Cache`, `Channel`, `StateMachine`, `EventEmitter`, `Pool`, `Queue`, `CronRunner` | [docs/async.md](docs/async.md) |
| **IO** | `File`, `Command`, `Json`, `Crypto`, `Encoding`, `Compression`, `Clone`, `Url`, `Client`, `Terminal`, `WebSocket`, `Dns`, `Net`, `FFI` | [docs/io.md](docs/io.md) |
| **Runtime** | `Server`, `Program`, `Logger`, `Config`, `Os`, `Process`, `Path`, `Eol`, `Platform` | [docs/runtime.md](docs/runtime.md) |

[Full documentation with examples](docs/index.md)

## Runtime Compatibility

Most modules are pure TypeScript and work everywhere. Runtime-dependent modules adapt automatically:

| Module | Node 22+ | Node 25+ | Bun | Workers | Browser |
|--------|----------|----------|-----|---------|---------|
| Core, Data, Async, Types | Yes | Yes | Yes | Yes | Yes |
| `Crypto` (full Web Crypto) | Yes | Yes | Yes | Yes | Yes |
| `Compression` | Yes | Yes | Yes | Partial | Partial |
| `File`, `Command`, `Terminal` | Yes | Yes | Yes | No | No |
| `Process`, `Os`, `Path` | Yes | Yes | Yes | No | No |
| `Dns`, `Net` | Yes | Yes | Yes | No | No |
| `FFI` | No | Yes (`--allow-ffi`) | Yes | No | No |
| `Server` | Yes | Yes | Yes | Yes (adapter) | No |

## Troubleshooting

### FFI not available

FFI requires native library loading capabilities:
- **Bun**: Works out of the box
- **Node 25+**: Run with `--allow-ffi` (experimental)
- **Node 22-24**: Not available. `FFI.open()` returns `Err(FFIError("..."))`. Use `FFI.isAvailable()` to check.

### Os/Process return None for some values

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

## How It Compares

| | Pure FX | Effect | fp-ts / Effect-ts |
|---|---------|--------|-------------------|
| **Philosophy** | Thin, opt-in primitives | Comprehensive runtime with fibers, layers, services | Category-theory encodings (HKT, typeclasses) |
| **Dependencies** | Zero | ~10 internal packages | Several (`fp-ts` ecosystem) |
| **Learning curve** | Familiar JS idioms (`Result`, `Option`, `pipe`) | Steep: generators, layers, services, scopes | Steep: HKT, Kind, typeclass instances |
| **Bundle size** | Small, tree-shakeable subpaths | Large (full runtime) | Medium |
| **Error handling** | `Result<T, E>` and `Task<T, E>` | Typed errors via `Effect<A, E, R>` | `Either<E, A>`, `TaskEither` |
| **Async** | `Task` (lazy Promise wrapper) | Fiber-based with structured concurrency | `TaskEither`, `ReaderTaskEither` |
| **Runtime support** | Node, Bun, Workers, Browser | Node (primary), limited Deno/Bun | Node (primary) |
| **IO** | Built-in File, Command, Server, Crypto, FFI | Via services and layers | BYO (no IO primitives) |

**Choose Pure FX when** you want typed errors and immutable data without adopting a framework. It adds `Result`, `Task`, `Schema`, and IO adapters on top of plain TypeScript: no generators, no layers, no HKT. If your code already uses `pipe` and explicit error returns, Pure FX fits in without reshaping your architecture.

**Choose Effect when** you need structured concurrency, dependency injection via layers, or a full application runtime with fibers, scopes, and managed services.

**Choose fp-ts when** you want strict category-theory abstractions and are comfortable with HKT-based typeclass hierarchies.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and how to submit changes.

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## License

[Apache-2.0](LICENSE)

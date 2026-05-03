# Pure FX Documentation

Functional application framework for TypeScript. Zero dependencies. Errors as values. Immutability at runtime.

## Modules

| Module | Description | Doc |
|--------|-------------|-----|
| **Core** | Result, Option, Validation, pipe, flow, Match, Eq, Ord, State, Lens, Prism, Traversal, Iso, LensOptional | [core.md](core.md) |
| **Data** | Record, List, NonEmptyList, HashMap, Schema, Codec, ADT, StableVec | [data.md](data.md) |
| **Types** | ErrType, Duration, Cron, Type (nominal) | [types.md](types.md) |
| **Async** | Task, Stream, Lazy, Env, Channel, Timer, Retry, CircuitBreaker, Semaphore, Mutex, RateLimiter, Cache, StateMachine, EventEmitter, Pool, Queue, CronRunner | [async.md](async.md) |
| **IO** | File, Command, Json, Crypto, Encoding, Compression, Clone, Url, Dns, Net, Client, Terminal, WebSocket, FFI | [io.md](io.md) |
| **Runtime** | Server, Program, Logger, Config, Os, Process, Path, Eol, Platform | [runtime.md](runtime.md) |

## Quick Start

```bash
npm install @igorjs/pure-fx
```

```ts
import { Ok, Err, pipe, Task, Schema, File } from '@igorjs/pure-fx'

// Or import specific modules for smaller bundles:
import { Ok, Err, pipe } from '@igorjs/pure-fx/core'
import { Schema, HashMap } from '@igorjs/pure-fx/data'
import { Task } from '@igorjs/pure-fx/async'
import { File, FFI } from '@igorjs/pure-fx/io'
```

## Principles

1. **Errors are values**: `Result<T, E>` instead of try/catch. Every fallible operation returns its error in the type.
2. **Immutability at runtime**: Records and Lists are deep-frozen. Mutations throw TypeError.
3. **Lazy async**: Task and Stream describe computations. Nothing runs until `.run()`.
4. **Zero dependencies**: Everything is built from scratch. No node_modules to audit.
5. **Multi-runtime**: CI-tested on Node.js 22+, Deno, Bun, Cloudflare Workers, and Chromium.
6. **Batteries included**: Full Web Crypto, FFI, Compression, DNS, TCP, subprocess, and more.

## Runtime Compatibility

CI-tested on 8 environments:

| Runtime | Unit Tests | Integration Tests |
|---------|-----------|-------------------|
| Node.js 22 | 1462 | 337 (runtime + web) |
| Node.js 24 | - | 337 |
| Node.js 25 | - | 337 (with `--allow-ffi`) |
| Deno 2+ | - | 337 |
| Bun | - | 337 |
| CF Workers (miniflare) | - | 249 (web) |
| Chromium (Playwright) | - | 249 (web) |

Pure and web modules work everywhere. Runtime-dependent modules (File, Command, Os, Process, FFI) detect the runtime via `globalThis` and return `Err`/`None` in restricted environments. They never throw.

## Building

```bash
pnpm run lint          # Biome lint + format
pnpm run check         # Type check (tsgo)
pnpm run build         # Build to dist/
pnpm test              # Unit tests (node --test)
pnpm run test:types    # Type tests (compile-time safety)
node scripts/release.mjs minor  # Bump, changelog, tag, push, GitHub release
```

---

Next: [Core](core.md)

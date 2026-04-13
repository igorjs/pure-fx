# Pure TS Documentation

Functional application framework for TypeScript. Zero dependencies. Errors as values. Immutability at runtime.

## Modules

| Module | Description | Doc |
|--------|-------------|-----|
| **Core** | Result, Option, pipe, flow, Match, Eq, Ord, State, Lens, Iso | [core.md](core.md) |
| **Data** | Record, List, NonEmptyList, Schema, Codec, ADT | [data.md](data.md) |
| **Async** | Task, Stream, Lazy, Env, Timer, Retry, CircuitBreaker, concurrency | [async.md](async.md) |
| **IO** | File, Command, Json, Crypto, Encoding, Compression, Url, Dns, Net | [io.md](io.md) |
| **Runtime** | Server, Program, Logger, Config, Os, Process, Path | [runtime.md](runtime.md) |
| **Types** | ErrType, Duration, Cron, Type (nominal) | [types.md](types.md) |
| **StateMachine** | Type-safe FSM with compile-time transitions | [state-machine.md](state-machine.md) |

## Quick Start

```bash
npm install @igorjs/pure-ts
```

```ts
import { Ok, Err, pipe, Task, Schema, File } from '@igorjs/pure-ts'

// Or import specific modules for smaller bundles:
import { Ok, Err, pipe } from '@igorjs/pure-ts/core'
import { Schema } from '@igorjs/pure-ts/data'
import { Task } from '@igorjs/pure-ts/async'
```

## Principles

1. **Errors are values**: `Result<T, E>` instead of try/catch. Every fallible operation returns its error in the type.
2. **Immutability at runtime**: Records and Lists are deep-frozen. Mutations throw TypeError.
3. **Lazy async**: Task and Stream describe computations. Nothing runs until `.run()`.
4. **Zero dependencies**: Everything is built from scratch. No node_modules to audit.
5. **Multi-runtime**: Runs on Node.js 22+, Deno, Bun, Cloudflare Workers, and browsers.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-05-25

### Added
- **`Immutable` protocol** for value types: a global-registry `Symbol` brand (`IMMUTABLE`), the `Immutable<TMut>` and `Producible<TMut>` interfaces, and an `Immutable` helper namespace (`Immutable.is` / `Immutable.equals` / `Immutable.produce`). `ImmutableRecord`, `ImmutableList`, `ImmutableHashMap`, `NonEmptyList`, and `DateTimeValue` all implement it.
- **Copy-on-write `produce`** on `ImmutableList`, `ImmutableHashMap`, and `NonEmptyList` (Record already had it). Drafts are revocable: a draft captured out of the recipe throws on later use. `NonEmptyList.produce` throws if the recipe empties the list.
- `ImmutableHashMap` gains `toMutable()` (fresh `Map`).
- `DateTime` runtime type: a Temporal-aware instant backed by `DateTimeValue` (epoch nanoseconds), accepting an ISO string, epoch millis, a `Date`, a `Temporal.Instant`/`ZonedDateTime`, or an existing `DateTimeValue`; with `toDate`/`toISO`/`toEpochMillis`/`toTemporal(): Option`, `equals`/`compare`, `eq`/`ord`, and copy-on-write modifiers `plus`/`minus`/`withEpochMillis`/`withEpochNanos`. Zero-dependency: Temporal is feature-detected, no polyfill.
- `Struct({ ... })` composer: heterogeneous object validation over named TypeDefs → `ImmutableRecord`.
- `ListOf(T)` → `ImmutableList` and `MapOf(K, V)` → `ImmutableHashMap` composers (the immutable-collection counterparts of `Vec`/`Dict`).

### Changed
- **BREAKING:** the `$immutable` string marker is removed from all immutable types. Use `Immutable.is(value)` (or `isImmutable(value)`).
- **BREAKING:** `.equals(other)` on `Record`/`List`/`HashMap`/`NonEmptyList`/`DateTimeValue` is widened to accept `unknown` (non-immutable / different-kind operands return `false`).

### Fixed
- `Record`/`List`/`Struct` now compose with nested pure-fx immutables (e.g. `Struct({ tags: ListOf(Tag) })`); the deep-freeze and lazy-wrap paths treat existing immutables and class instances as opaque leaves. `isImmutable` now correctly recognises `ImmutableList`.

## [0.1.0] - 2026-03-15

### Added
- Result (`Ok`, `Err`) and Option (`Some`, `None`) with pattern matching
- `Result.fromNullable`, `Result.partition`, `Option.partition`
- `.is()` tagged protocol for runtime type checking on all tagged types
- Validation (`Valid`, `Invalid`) with error-accumulating `zip`/`ap`
- HashMap backed by HAMT with structural sharing
- NonEmptyList with guaranteed non-empty operations
- StableVec dense index-stable collection
- Immutable Record and List with runtime enforcement (`DeepReadonly`)
- ADT algebraic data type constructor
- Schema with refinements (email, uuid, int, range, date, enum, discriminatedUnion, lazy, intersection)
- Codec for bidirectional encoding/decoding
- Lens, LensOptional, Prism, Traversal, Iso optics
- Eq and Ord composable typeclasses with `sortByOrd`, `uniqBy`, `groupBy`
- Match exhaustive pattern matcher
- Duration and Cron typed primitives with `Duration.format()` for human-readable output
- State monad
- Stream with backpressure, ReadableStream bridge, window, groupBy, scan, merge, debounce, throttle, distinctUntilChanged
- Lazy deferred evaluation with `Symbol.dispose`
- `pipe`, `flow`, `compose` function composition utilities
- Env reader-style dependency injection
- Task for lazy, composable async with traverse, sequence, ap, memoize, timeout, retry, race, allSettled
- Retry policies and CircuitBreaker
- Semaphore, Mutex, RateLimiter (token bucket)
- Cache with TTL and LRU eviction
- Channel for async producer-consumer patterns
- Pool resource pool with idle timeout and health checks
- Queue async job queue with priorities and concurrency
- CronRunner for cron-scheduled tasks
- EventEmitter with typed per-event type safety
- StateMachine with compile-time transition validation
- HTTP server with builder pattern, typed middleware, composable `.serve()` for concurrent servers
- Program entrypoint with `Program.run` and `Program.all`
- ErrType tagged errors with auto-derived codes and cause chains
- Logger with silent mode and custom logger support
- Config typed configuration reader
- File IO (read, write, append, stat, copy, rename, remove, symlink, link, chmod, chown, truncate, realPath, readLink, lstat, readBytes, writeBytes)
- Command execution and `Command.spawn` for background processes
- Process (env, ppid, uid, gid, execPath, stdin)
- Os (arch, platform, cpuCount, tmpDir, homeDir, osRelease, loadavg, networkInterfaces)
- Path and Eol cross-platform utilities
- Platform detection (Node, Deno, Bun, Browser, Workers)
- Dns and Net (TCP client) modules
- Terminal and WebSocket adapters
- Web standard wrappers (Crypto with full Web Crypto API, Url, Encoding, Compression, Clone, Timer)
- FFI module for cross-runtime native library loading (Deno, Bun, Node 25+)
- Json type-safe serialization
- Client HTTP client
- Subpath exports for tree-shaking
- Cross-runtime support (Node 22+, Deno 2+, Bun)
- Comprehensive test suite (unit, integration, type, bundle-size tests)

[0.1.0]: https://github.com/igorjs/pure-fx/releases/tag/v0.1.0

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.10.0] - 2026-04-30

### Added
- `Validation<T, E>` for error-accumulating validation (zip/ap collect all errors)
- `HashMap<K, V>` backed by HAMT with structural sharing
- `FFI` module for cross-runtime native library loading (Deno, Bun, Node 25+)
- Full Web Crypto API coverage: HMAC, AES-GCM/CBC, ECDSA, RSA-PSS/OAEP, PBKDF2, HKDF, ECDH, key management
- `Process.ppid`, `Process.uid()`, `Process.gid()`, `Process.execPath()`
- `Os.osRelease()`, `Os.loadavg()`, `Os.networkInterfaces()`
- `File.readBytes`, `File.writeBytes`, `File.symlink`, `File.link`, `File.chmod`, `File.chown`, `File.truncate`, `File.realPath`, `File.readLink`, `File.lstat`
- `Crypto.randomInt(min, max)`, `Crypto.hashHex()`
- Comprehensive integration test suite (249 web + 113 runtime assertions)
- Cross-runtime integration tests on Node 22/24/25, Deno 2+, Bun
- `--yes` flag for non-interactive release script
- Pre-commit hook for SPDX license headers
- Pre-push hook for lint, check, build, test
- CLA/DCO bot with auto-commit to CONTRIBUTORS.md
- Auto-labeling for PRs (size, type, CLA/DCO status)
- Issue and PR templates
- CODEOWNERS, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, NOTICE

### Fixed
- Deno `memoryUsage()`, `osUptime()`, and `env` not wired in process adapter
- Deno DNS lookup only querying IPv4 (now falls back to IPv6)
- Compression deadlock on Deno (use `Blob.stream().pipeThrough()`)
- `requireNode` failing in ESM contexts (use `createRequire` from `node:module`)
- HashMap cognitive complexity lint error (extract `trieSetLeaf`)
- HashMap empty singleton using `any` type (use `never`)

## [0.9.0] - 2026-04-28

### Added
- `Process.env()` for cross-runtime environment variable access
- `Command.spawn` for fire-and-forget background processes

### Fixed
- `Json.stringify` rejecting `null` as replacer parameter

## [0.8.1] - 2026-04-28

### Fixed
- `Deno.consoleSize` ENOTTY error in CI

## [0.8.0] - 2026-04-28

### Added
- Terminal, WebSocket, and adapter layer tests
- Runtime adapter layer extraction

## [0.7.0] - 2026-04-13

### Added
- StableVec dense index-stable collection
- Documentation for all modules

## [0.6.0] - 2026-04-13

### Added
- Pool resource pool with idle timeout and health checks
- Queue async job queue with concurrency control

## [0.5.0] - 2026-04-13

### Added
- CronRunner for cron-scheduled tasks
- EventEmitter with typed event maps
- StateMachine with compile-time transitions

## [0.4.0] - 2026-04-13

### Added
- Cache with TTL and LRU eviction
- Channel for async producer-consumer patterns
- RateLimiter with token bucket algorithm

## [0.3.0] - 2026-04-08

### Added
- HTTP server with builder pattern (Hono-inspired)
- Tier 2 multi-runtime modules (Command, Os, Process, Path)
- Tier 3 modules (Dns, Net, Stream.fromReadable)
- Web standard wrappers (Crypto, Url, Encoding, Compression, Clone, Timer)
- Program.all for concurrent execution
- Eq, Ord, Match, NonEmptyList, Codec, Lens, Prism, Traversal
- Duration, Cron typed primitives
- State monad
- Stream with backpressure and ReadableStream bridge
- Retry policies and CircuitBreaker
- Semaphore, Mutex, RateLimiter
- Lazy deferred evaluation with Symbol.dispose
- Env reader-style dependency injection
- Schema refinements (email, uuid, int, range, etc.)
- ADT algebraic data type constructor

[0.10.0]: https://github.com/igorjs/pure-fx/releases/tag/v0.10.0
[0.9.0]: https://github.com/igorjs/pure-fx/releases/tag/v0.9.0
[0.8.1]: https://github.com/igorjs/pure-fx/releases/tag/v0.8.1
[0.8.0]: https://github.com/igorjs/pure-fx/releases/tag/v0.8.0
[0.7.0]: https://github.com/igorjs/pure-fx/releases/tag/v0.7.0
[0.6.0]: https://github.com/igorjs/pure-fx/releases/tag/v0.6.0
[0.5.0]: https://github.com/igorjs/pure-fx/releases/tag/v0.5.0
[0.4.0]: https://github.com/igorjs/pure-fx/releases/tag/v0.4.0
[0.3.0]: https://github.com/igorjs/pure-fx/releases/tag/v0.3.0

/**
 * @module @igorjs/pure-fx
 *
 * Pure FX: a functional application framework for TypeScript.
 * Zero dependencies. Errors as values. Immutability enforced at runtime.
 *
 * Core:
 *   Result<T, E>  / Option<T>         - monads for errors and optionality
 *   pipe / flow / Match               - composition and pattern matching
 *   Eq<T> / Ord<T> / State<S, A>     - typeclasses and state monad
 *   Lens / Prism / Traversal          - optics for immutable updates
 *
 * Data:
 *   Record / List / NonEmptyList      - immutable data structures
 *   Schema / Codec                    - validation and bidirectional encoding
 *   Type<Name, Base> / ErrType        - nominal types and structured errors
 *   Duration / Cron                   - typed time primitives
 *
 * Async:
 *   Task<T, E> / Stream<T, E>        - lazy async computation, sequences, ReadableStream bridge
 *   Lazy<T> / Env<R, T, E>           - deferred evaluation and dependency injection
 *   Retry / CircuitBreaker            - resilience policies
 *   Semaphore / Mutex / RateLimiter   - concurrency control
 *   Queue<T> / CronRunner             - job queue and cron-scheduled tasks
 *   Cache<K, V> / Channel<T>         - caching and async communication
 *   Pool<T>                           - generic resource pool with idle timeout and health checks
 *   Timer                             - sleep, interval, delay, deadline
 *
 * IO:
 *   Json / File                       - safe parse, read, write returning Result/Task
 *   Crypto / Encoding / Clone         - web standard crypto, encoding, cloning
 *   Compression / Url                 - web standard compression and URL parsing
 *   Client                            - HTTP client on Task with typed errors
 *   WebSocket                         - typed handler routing
 *   Command                           - cross-runtime subprocess execution
 *   Dns / Net                         - cross-runtime DNS resolution and TCP client
 *
 * Runtime:
 *   Server / Program                  - HTTP server with typed middleware
 *   Logger / Config                   - structured logging and env validation
 *   Path / Eol / Platform             - cross-platform IO
 *   Os / Process                      - cross-runtime OS and process info
 *   node / deno / bun / lambda        - runtime adapters
 */

import type { Option, OptionMatcher } from "./core/option.js";
import type { Result, ResultMatcher } from "./core/result.js";

export { None, Option, type OptionMatcher, Some } from "./core/option.js";
export { Err, Ok, Result, type ResultMatcher, tryCatch } from "./core/result.js";

/**
 * Universal pattern match for {@link Result} and {@link Option}.
 *
 * Standalone alias so callers who prefer bare imports over namespace access
 * can write `match(value, arms)` instead of `Result.match(value, arms)`.
 *
 * @example
 * ```ts
 * match(Ok(42), { Ok: v => v * 2, Err: () => 0 })   // 84
 * match(Some('hi'), { Some: s => s.length, None: () => 0 })  // 2
 * ```
 */
/** Pattern match on a Result or Option, handling each variant. */
export function match<T, E, U>(value: Result<T, E>, matcher: ResultMatcher<T, E, U>): U;
export function match<T, U>(value: Option<T>, matcher: OptionMatcher<T, U>): U;
export function match(value: { match(m: object): unknown }, matcher: object): unknown {
  return value.match(matcher);
}
export { Cache, type CacheInstance, type CacheOptions } from "./async/cache.js";
export { Channel } from "./async/channel.js";
export {
  CircuitBreaker,
  type CircuitBreakerInstance,
  type CircuitBreakerPolicy,
  CircuitOpen,
  type CircuitState,
} from "./async/circuit-breaker.js";
export {
  CronRunner,
  type CronRunnerInstance,
  type CronRunnerOptions,
} from "./async/cron-runner.js";
export { Env } from "./async/env.js";
export { EventEmitter, type EventEmitterInstance } from "./async/event-emitter.js";
export { Lazy } from "./async/lazy.js";
export {
  Pool,
  PoolError,
  type PooledResource,
  type PoolInstance,
  type PoolOptions,
} from "./async/pool.js";
export { type Job, Queue, type QueueInstance, type QueueOptions } from "./async/queue.js";
export {
  RateLimited,
  RateLimiter,
  type RateLimiterInstance,
  type RateLimiterPolicy,
} from "./async/rate-limiter.js";
export { Retry, type RetryPolicy } from "./async/retry.js";
export { Mutex, type MutexInstance, Semaphore, type SemaphoreInstance } from "./async/semaphore.js";
export { InvalidTransition, StateMachine } from "./async/state-machine.js";
export { Stream } from "./async/stream.js";
export { Task } from "./async/task.js";
export { TimeoutError, Timer } from "./async/timer.js";
export {
  Client,
  type ClientError,
  type ClientInstance,
  type ClientOptions,
  type ClientResponse,
  HttpError,
  NetworkError,
  ParseError,
} from "./client.js";
export { Eq } from "./core/eq.js";
export { Iso, Lens, LensOptional, Prism, Traversal } from "./core/lens.js";
export { Match } from "./core/match.js";
export { Ord } from "./core/ord.js";
export { flow, pipe } from "./core/pipe.js";
export { State } from "./core/state.js";
export { ADT } from "./data/adt.js";
export { Codec, type CodecType } from "./data/codec.js";
export { isImmutable, List, Record } from "./data/constructors.js";
/** Recursively marks all properties as readonly. */
export type { DeepReadonly } from "./data/internals.js";
/** An immutable array with functional methods. */
export type { ImmutableList, ListMethods } from "./data/list.js";
export { NonEmptyList } from "./data/non-empty-list.js";
/** An immutable object with type-safe update methods. */
export type { ImmutableRecord, RecordMethods } from "./data/record.js";
export { Schema, type SchemaError, type SchemaType } from "./data/schema.js";
export { Clone, CloneError } from "./io/clone.js";
export { Compression, CompressionError } from "./io/compression.js";
export { Crypto, CryptoError } from "./io/crypto.js";
export { Dns, DnsError, type DnsRecord } from "./io/dns.js";
export { Encoding, EncodingError } from "./io/encoding.js";
export { File, FileError, type FileStat } from "./io/file.js";
export { Json, JsonError } from "./io/json.js";
export { Net, NetError, type TcpConnection } from "./io/net.js";
export { Command, CommandError, type CommandOptions, type CommandResult } from "./io/subprocess.js";
export { Url, UrlError } from "./io/url.js";
export { Program } from "./program.js";
export { Config } from "./runtime/config.js";
export { Logger } from "./runtime/logger.js";
export { Os } from "./runtime/os.js";
export { Eol, Path, type PathParts, Platform } from "./runtime/platform.js";
export { Process, ProcessError } from "./runtime/process.js";
export {
  BodyReadError,
  type Context,
  compose,
  type ExtractParams,
  type Handler,
  HandlerError,
  type HttpMethod,
  html,
  json,
  type ListenOptions,
  MethodNotAllowed,
  type Middleware,
  type Params,
  type RouteDefinition,
  RouteNotFound,
  redirect,
  Server,
  type ServerAdapter,
  type ServerBuilder,
  type ServerError,
  type TypedMiddleware,
  text,
} from "./server.js";
export { Cron, type CronExpression } from "./types/cron.js";
export { Duration } from "./types/duration.js";
export { ErrType, type ErrTypeConstructor } from "./types/error.js";
/** Phantom-branded nominal type for compile-time domain safety. */
export type { Type } from "./types/nominal.js";
export {
  WebSocket,
  type WebSocketConnection,
  type WebSocketHandler,
  type WebSocketRouter,
} from "./ws.js";

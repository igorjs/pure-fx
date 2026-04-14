/**
 * @module async
 *
 * Lazy async computation, sequences, resilience, concurrency, and scheduling.
 *
 * Task, Stream, Retry, CircuitBreaker, Semaphore, Mutex, RateLimiter,
 * Cache, Channel, StateMachine, EventEmitter, Pool, Queue, CronRunner.
 *
 * @example
 * ```ts
 * import { Task, Stream, Retry } from '@igorjs/pure-ts/async'
 *
 * const result = await Task.of(42).map(n => n * 2).run();
 * ```
 */
/** In-memory cache with TTL and optional LRU eviction. */
export { Cache, type CacheInstance, type CacheOptions } from "./cache.js";
/** Async communication channel for producer-consumer patterns. */
export { Channel } from "./channel.js";
/** Circuit breaker resilience pattern for failing-fast on repeated errors. */
export {
  CircuitBreaker,
  type CircuitBreakerInstance,
  type CircuitBreakerPolicy,
  CircuitOpen,
  type CircuitState,
} from "./circuit-breaker.js";
/** Cron-scheduled task runner with typed job callbacks. */
export { CronRunner, type CronRunnerInstance, type CronRunnerOptions } from "./cron-runner.js";
/** Reader-style dependency injection for async computations. */
export { Env } from "./env.js";
/** Type-safe event emitter with typed event maps. */
export { EventEmitter, type EventEmitterInstance } from "./event-emitter.js";
/** Deferred evaluation that computes a value at most once. */
export { Lazy } from "./lazy.js";
/** Generic resource pool with idle timeout and health checks. */
export {
  Pool,
  PoolError,
  type PooledResource,
  type PoolInstance,
  type PoolOptions,
} from "./pool.js";
/** Async job queue with concurrency control. */
export { type Job, Queue, type QueueInstance, type QueueOptions } from "./queue.js";
/** Token-bucket rate limiter for throttling operations. */
export {
  RateLimited,
  RateLimiter,
  type RateLimiterInstance,
  type RateLimiterPolicy,
} from "./rate-limiter.js";
/** Configurable retry policy with backoff strategies. */
export { Retry, type RetryPolicy } from "./retry.js";
/** Semaphore and mutex primitives for concurrency control. */
export { Mutex, type MutexInstance, Semaphore, type SemaphoreInstance } from "./semaphore.js";
/** Typed finite state machine with validated transitions. */
export { InvalidTransition, StateMachine } from "./state-machine.js";
/** Lazy async sequence with backpressure and ReadableStream bridge. */
export { Stream } from "./stream.js";
/** Lazy, composable async computation that returns Result on run. */
export { Task } from "./task.js";
/** Timer utilities for sleep, interval, delay, and deadline. */
export { TimeoutError, Timer } from "./timer.js";

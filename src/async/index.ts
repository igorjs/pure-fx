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
 * import { Task, Stream, Retry } from '@igorjs/pure-fx/async'
 *
 * const result = await Task.of(42).map(n => n * 2).run();
 * ```
 */
export { Cache, type CacheInstance, type CacheOptions } from "./cache.js";
export { Channel } from "./channel.js";
export {
  CircuitBreaker,
  type CircuitBreakerInstance,
  type CircuitBreakerPolicy,
  CircuitOpen,
  type CircuitState,
} from "./circuit-breaker.js";
export { CronRunner, type CronRunnerInstance, type CronRunnerOptions } from "./cron-runner.js";
export { Env } from "./env.js";
export { EventEmitter, type EventEmitterInstance } from "./event-emitter.js";
export { Lazy } from "./lazy.js";
export {
  Pool,
  PoolError,
  type PooledResource,
  type PoolInstance,
  type PoolOptions,
} from "./pool.js";
export { type Job, Queue, type QueueInstance, type QueueOptions } from "./queue.js";
export {
  RateLimited,
  RateLimiter,
  type RateLimiterInstance,
  type RateLimiterPolicy,
} from "./rate-limiter.js";
export { Retry, type RetryPolicy } from "./retry.js";
export { Mutex, type MutexInstance, Semaphore, type SemaphoreInstance } from "./semaphore.js";
export { InvalidTransition, StateMachine } from "./state-machine.js";
export { Stream } from "./stream.js";
export { Task } from "./task.js";
export { TimeoutError, Timer } from "./timer.js";

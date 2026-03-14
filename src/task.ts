// ═══════════════════════════════════════════════════════════════════════════════
// Task<T, E>
// ═══════════════════════════════════════════════════════════════════════════════

import type { Result } from './result.js';
import { Ok, Err, ErrImpl, collectResults } from './result.js';

/**
 * Composable async computation that produces `Result<T, E>`.
 *
 * A Task is a lazy description of an async operation. It does not execute
 * until `.run()` is called. This lets you build complex async pipelines
 * that compose before any side effects happen.
 *
 * @example
 * ```ts
 * const fetchUser = new Task<User, ApiError>(async () => {
 *   const res = await fetch('/api/user');
 *   if (!res.ok) return Err({ code: res.status });
 *   return Ok(await res.json());
 * });
 *
 * const pipeline = fetchUser
 *   .map(user => user.name)
 *   .flatMap(name => validateName(name))
 *   .mapErr(e => `Failed: ${e.code}`);
 *
 * const result = await pipeline.run(); // Result<string, string>
 * ```
 */
export class Task<T, E> {
  constructor(private readonly _run: () => Promise<Result<T, E>>) {}

  /** Execute the task. Returns a Promise of Result. */
  run(): Promise<Result<T, E>> {
    return this._run();
  }

  /** Transform the success value. Does not execute yet. */
  map<U>(fn: (value: T) => U): Task<U, E> {
    return new Task(async () => {
      const r = await this._run();
      return r.isOk ? Ok(fn(r.value)) : r as unknown as Result<U, E>;
    });
  }

  /** Transform the error value. Does not execute yet. */
  mapErr<F>(fn: (error: E) => F): Task<T, F> {
    return new Task(async () => {
      const r = await this._run();
      return r.isErr ? Err(fn((r as ErrImpl<T, E>).error)) : r as unknown as Result<T, F>;
    });
  }

  /** Chain into another async operation on success. Short-circuits on error. */
  flatMap<U>(fn: (value: T) => Task<U, E>): Task<U, E> {
    return new Task(async () => {
      const r = await this._run();
      if (r.isErr) return r as unknown as Result<U, E>;
      return fn(r.value).run();
    });
  }

  /** Run a side-effect on the success value without altering the Task. */
  tap(fn: (value: T) => void): Task<T, E> {
    return new Task(async () => {
      const r = await this._run();
      if (r.isOk) fn(r.value);
      return r;
    });
  }

  /** Run a side-effect on the error without altering the Task. */
  tapErr(fn: (error: E) => void): Task<T, E> {
    return new Task(async () => {
      const r = await this._run();
      if (r.isErr) fn((r as ErrImpl<T, E>).error);
      return r;
    });
  }

  /** Provide a fallback value on error. Returns `Task<T, never>`. */
  unwrapOr(fallback: T): Task<T, never> {
    return new Task(async () => {
      const r = await this._run();
      return Ok(r.isOk ? r.value : fallback);
    });
  }

  /** Run and extract the value, or use `fallback` on error. Convenience for fire-and-forget. */
  async runGetOr(fallback: T): Promise<T> {
    const r = await this._run();
    return r.isOk ? r.value : fallback;
  }

  /** Run both tasks in parallel, combine results into a tuple. */
  zip<U>(other: Task<U, E>): Task<[T, U], E> {
    return new Task(async () => {
      const [a, b] = await Promise.all([this._run(), other._run()]);
      if (a.isErr) return a as unknown as Result<[T, U], E>;
      if (b.isErr) return b as unknown as Result<[T, U], E>;
      return Ok([a.value, b.value] as [T, U]);
    });
  }

  /**
   * Create a Task from a plain value. Always succeeds.
   *
   * @example
   * ```ts
   * const task = Task.of(42); // Task<number, never>
   * ```
   */
  static of<T>(value: T): Task<T, never> {
    return new Task(async () => Ok(value));
  }

  /**
   * Create a Task from an existing Result.
   *
   * @example
   * ```ts
   * Task.fromResult(Ok(42)).run(); // Promise<Ok(42)>
   * ```
   */
  static fromResult<T, E>(result: Result<T, E>): Task<T, E> {
    return new Task(async () => result);
  }

  /**
   * Create a Task from a Promise, catching rejections.
   *
   * Provide `onError` to map the rejection to a typed error.
   *
   * @example
   * ```ts
   * Task.fromPromise(() => fetch('/api'), e => String(e));
   * ```
   */
  static fromPromise<T, E = unknown>(
    promise: () => Promise<T>,
    onError?: (e: unknown) => E,
  ): Task<T, E> {
    return new Task(async () => {
      try { return Ok(await promise()); }
      catch (e) { return Err(onError ? onError(e) : e as E); }
    });
  }

  /**
   * Run all tasks in parallel, collect results. Short-circuits on first error.
   *
   * @example
   * ```ts
   * const result = await Task.all([Task.of(1), Task.of(2)]).run();
   * result.unwrap(); // [1, 2]
   * ```
   */
  static all<T, E>(tasks: readonly Task<T, E>[]): Task<readonly T[], E> {
    return new Task(async () => {
      const results = await Promise.all(tasks.map(t => t.run()));
      return collectResults(results);
    });
  }
}

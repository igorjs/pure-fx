// SPDX-License-Identifier: Apache-2.0
/**
 * async-new.test.js - Tests for new async modules: Stream, Retry, CircuitBreaker,
 * Semaphore, Mutex, RateLimiter, Cache, Channel, Env, EventEmitter.
 *
 * Uses @igorjs/pure-test.
 * Tests the compiled dist/ output, not the source.
 */

import { describe, expect, it } from "@igorjs/pure-test";

const {
  Stream,
  Retry,
  CircuitBreaker,
  CircuitOpen,
  Semaphore,
  Mutex,
  RateLimiter,
  RateLimited,
  Cache,
  Channel,
  Env,
  Ok,
  Err,
  Some,
  None,
  Duration,
  Task,
  StateMachine,
  InvalidTransition,
  EventEmitter,
  Pool,
  PoolError,
  Queue,
  CronRunner,
  Cron,
} = await import("../dist/index.js");

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Create a minimal Task-like from an async function returning Result. */
const mkTask = fn => ({ run: fn });

// =============================================================================
// 1. Stream
// =============================================================================

describe("Stream", () => {
  describe("Stream.of", () => {
    it("creates a stream from values and collect returns Ok array", async () => {
      const result = await Stream.of(1, 2, 3).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 2, 3]);
    });

    it("handles a single value", async () => {
      const result = await Stream.of(42).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([42]);
    });

    it("handles no values (empty variadic)", async () => {
      const result = await Stream.of().collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });
  });

  describe("Stream.fromArray", () => {
    it("creates a stream from an array", async () => {
      const result = await Stream.fromArray([10, 20, 30]).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([10, 20, 30]);
    });

    it("handles empty array", async () => {
      const result = await Stream.fromArray([]).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });
  });

  describe("Stream.empty", () => {
    it("collect returns Ok([])", async () => {
      const result = await Stream.empty().collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });
  });

  describe("Stream.unfold", () => {
    it("generates a finite sequence and terminates on None", async () => {
      const result = await Stream.unfold(0, n => (n < 5 ? Some([n, n + 1]) : None))
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([0, 1, 2, 3, 4]);
    });

    it("produces empty stream when seed immediately returns None", async () => {
      const result = await Stream.unfold(0, () => None)
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });
  });

  describe(".map", () => {
    it("transforms each value", async () => {
      const result = await Stream.of(1, 2, 3)
        .map(n => n * 10)
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([10, 20, 30]);
    });
  });

  describe(".filter", () => {
    it("keeps matching values", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5)
        .filter(n => n % 2 === 0)
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([2, 4]);
    });

    it("returns empty when nothing matches", async () => {
      const result = await Stream.of(1, 3, 5)
        .filter(n => n % 2 === 0)
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });
  });

  describe(".take", () => {
    it("limits count to n values", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5).take(3).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 2, 3]);
    });

    it("returns all values when n exceeds stream length", async () => {
      const result = await Stream.of(1, 2).take(10).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 2]);
    });

    it("returns empty when taking 0", async () => {
      const result = await Stream.of(1, 2, 3).take(0).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });
  });

  describe(".drop", () => {
    it("skips first n values", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5).drop(2).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([3, 4, 5]);
    });

    it("returns empty when dropping more than available", async () => {
      const result = await Stream.of(1, 2).drop(10).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });

    it("returns all when dropping 0", async () => {
      const result = await Stream.of(1, 2, 3).drop(0).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 2, 3]);
    });
  });

  describe(".takeWhile", () => {
    it("stops on first false predicate", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5)
        .takeWhile(n => n < 4)
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 2, 3]);
    });

    it("returns all when predicate never fails", async () => {
      const result = await Stream.of(1, 2, 3)
        .takeWhile(() => true)
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 2, 3]);
    });

    it("returns empty when predicate fails immediately", async () => {
      const result = await Stream.of(1, 2, 3)
        .takeWhile(() => false)
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });
  });

  describe(".chunk", () => {
    it("groups into fixed-size chunks", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5, 6).chunk(2).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);
    });

    it("handles remainder when stream length is not divisible by chunk size", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5).chunk(3).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([
        [1, 2, 3],
        [4, 5],
      ]);
    });

    it("handles chunk size larger than stream", async () => {
      const result = await Stream.of(1, 2).chunk(10).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([[1, 2]]);
    });
  });

  describe(".tap", () => {
    it("runs side effect without changing values", async () => {
      const tapped = [];
      const result = await Stream.of(1, 2, 3)
        .tap(v => tapped.push(v))
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 2, 3]);
      expect(tapped).toEqual([1, 2, 3]);
    });
  });

  describe(".mapErr", () => {
    it("transforms error values in the stream", async () => {
      const errStream = Stream(async function* () {
        yield Ok(1);
        yield Err("oops");
      });
      const result = await errStream
        .mapErr(e => `wrapped: ${e}`)
        .collect()
        .run();
      expect(result.isErr).toBe(true);
      expect(result.unwrapErr()).toBe("wrapped: oops");
    });
  });

  describe(".flatMap", () => {
    it("flattens nested streams", async () => {
      const result = await Stream.of(1, 2, 3)
        .flatMap(n => Stream.of(n, n * 10))
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 10, 2, 20, 3, 30]);
    });

    it("handles empty inner streams", async () => {
      const result = await Stream.of(1, 2, 3)
        .flatMap(() => Stream.empty())
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });
  });

  describe(".concat", () => {
    it("concatenates two streams sequentially", async () => {
      const a = Stream.of(1, 2);
      const b = Stream.of(3, 4);
      const result = await a.concat(b).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 2, 3, 4]);
    });

    it("concatenates with empty stream", async () => {
      const result = await Stream.of(1, 2).concat(Stream.empty()).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 2]);
    });
  });

  describe(".zip", () => {
    it("pairs elements 1:1", async () => {
      const result = await Stream.of(1, 2, 3)
        .zip(Stream.of("a", "b", "c"))
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ]);
    });

    it("stops at shorter stream (left shorter)", async () => {
      const result = await Stream.of(1, 2)
        .zip(Stream.of("a", "b", "c"))
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([
        [1, "a"],
        [2, "b"],
      ]);
    });

    it("stops at shorter stream (right shorter)", async () => {
      const result = await Stream.of(1, 2, 3).zip(Stream.of("a")).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([[1, "a"]]);
    });
  });

  describe(".window", () => {
    it("produces sliding windows with correct overlap", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5).window(3).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([
        [1, 2, 3],
        [2, 3, 4],
        [3, 4, 5],
      ]);
    });

    it("returns empty when stream is shorter than window size", async () => {
      const result = await Stream.of(1, 2).window(5).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([]);
    });

    it("window of 1 returns each element individually", async () => {
      const result = await Stream.of(1, 2, 3).window(1).collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([[1], [2], [3]]);
    });
  });

  describe(".scan", () => {
    it("produces intermediate accumulated values", async () => {
      const result = await Stream.of(1, 2, 3, 4)
        .scan((acc, v) => acc + v, 0)
        .collect()
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual([1, 3, 6, 10]);
    });
  });

  describe(".groupBy", () => {
    it("collects into keyed record", async () => {
      const result = await Stream.of(
        { type: "fruit", name: "apple" },
        { type: "veggie", name: "carrot" },
        { type: "fruit", name: "banana" },
        { type: "veggie", name: "pea" },
      )
        .groupBy(item => item.type)
        .run();
      expect(result.isOk).toBe(true);
      const groups = result.unwrap();
      expect(groups.fruit).toEqual([
        { type: "fruit", name: "apple" },
        { type: "fruit", name: "banana" },
      ]);
      expect(groups.veggie).toEqual([
        { type: "veggie", name: "carrot" },
        { type: "veggie", name: "pea" },
      ]);
    });
  });

  describe(".collect", () => {
    it("gathers all values into array", async () => {
      const result = await Stream.of("a", "b", "c").collect().run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual(["a", "b", "c"]);
    });

    it("short-circuits on error", async () => {
      const s = Stream(async function* () {
        yield Ok(1);
        yield Err("fail");
        yield Ok(3);
      });
      const result = await s.collect().run();
      expect(result.isErr).toBe(true);
      expect(result.unwrapErr()).toBe("fail");
    });
  });

  describe(".forEach", () => {
    it("runs side effect on each value", async () => {
      const values = [];
      const result = await Stream.of(1, 2, 3)
        .forEach(v => {
          values.push(v);
        })
        .run();
      expect(result.isOk).toBe(true);
      expect(values).toEqual([1, 2, 3]);
    });

    it("short-circuits on error", async () => {
      const values = [];
      const s = Stream(async function* () {
        yield Ok(1);
        yield Err("stop");
        yield Ok(3);
      });
      const result = await s
        .forEach(v => {
          values.push(v);
        })
        .run();
      expect(result.isErr).toBe(true);
      expect(values).toEqual([1]);
    });
  });

  describe(".reduce", () => {
    it("folds to a single value", async () => {
      const result = await Stream.of(1, 2, 3, 4)
        .reduce((acc, v) => acc + v, 0)
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe(10);
    });

    it("returns init for empty stream", async () => {
      const result = await Stream.empty()
        .reduce((acc, v) => acc + v, 42)
        .run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe(42);
    });
  });

  describe(".first", () => {
    it("returns Some(first element) for non-empty stream", async () => {
      const result = await Stream.of(10, 20, 30).first().run();
      expect(result.isOk).toBe(true);
      const opt = result.unwrap();
      expect(opt.isSome).toBe(true);
      expect(opt.unwrap()).toBe(10);
    });

    it("returns None for empty stream", async () => {
      const result = await Stream.empty().first().run();
      expect(result.isOk).toBe(true);
      const opt = result.unwrap();
      expect(opt.isNone).toBe(true);
    });
  });
});

// =============================================================================
// 2. Retry
// =============================================================================

describe("Retry", () => {
  describe("Retry.policy() builder", () => {
    it("builds a policy with maxAttempts, delay, exponentialBackoff, jitter", () => {
      const policy = Retry.policy()
        .maxAttempts(5)
        .exponentialBackoff(Duration.milliseconds(10))
        .jitter()
        .build();

      expect(policy.maxAttempts).toBe(5);
      expect(policy.backoff).toBe("exponential");
      expect(policy.jitter).toBe(true);
    });

    it("defaults to 3 maxAttempts, fixed backoff, no jitter", () => {
      const policy = Retry.policy().build();
      expect(policy.maxAttempts).toBe(3);
      expect(policy.backoff).toBe("fixed");
      expect(policy.jitter).toBe(false);
    });
  });

  describe("Retry.fixed", () => {
    it("creates a fixed policy with specified attempts and delay", () => {
      const policy = Retry.fixed(4, Duration.milliseconds(50));
      expect(policy.maxAttempts).toBe(4);
      expect(policy.backoff).toBe("fixed");
      expect(policy.jitter).toBe(false);
    });
  });

  describe("Retry.exponential", () => {
    it("creates an exponential policy", () => {
      const policy = Retry.exponential(3, Duration.milliseconds(10));
      expect(policy.maxAttempts).toBe(3);
      expect(policy.backoff).toBe("exponential");
    });
  });

  describe("Retry.apply", () => {
    it("retries on failure and succeeds when task eventually succeeds", async () => {
      let attempts = 0;
      const flaky = mkTask(async () => {
        attempts++;
        if (attempts < 3) return Err("not yet");
        return Ok("done");
      });

      const policy = Retry.fixed(5, Duration.milliseconds(1));
      const result = await Retry.apply(policy, flaky).run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe("done");
      expect(attempts).toBe(3);
    });

    it("stops after maxAttempts and returns last error", async () => {
      let attempts = 0;
      const failing = mkTask(async () => {
        attempts++;
        return Err(`fail-${attempts}`);
      });

      const policy = Retry.fixed(3, Duration.milliseconds(1));
      const result = await Retry.apply(policy, failing).run();
      expect(result.isErr).toBe(true);
      expect(result.unwrapErr()).toBe("fail-3");
      expect(attempts).toBe(3);
    });

    it("does not retry when first attempt succeeds", async () => {
      let attempts = 0;
      const ok = mkTask(async () => {
        attempts++;
        return Ok("first try");
      });

      const policy = Retry.fixed(5, Duration.milliseconds(1));
      const result = await Retry.apply(policy, ok).run();
      expect(result.isOk).toBe(true);
      expect(attempts).toBe(1);
    });
  });

  describe("Retry.withPolicy", () => {
    it("curried version works the same as apply", async () => {
      let attempts = 0;
      const flaky = mkTask(async () => {
        attempts++;
        if (attempts < 2) return Err("not yet");
        return Ok("ok");
      });

      const policy = Retry.fixed(3, Duration.milliseconds(1));
      const withRetry = Retry.withPolicy(policy);
      const result = await withRetry(flaky).run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe("ok");
      expect(attempts).toBe(2);
    });
  });
});

// =============================================================================
// 3. CircuitBreaker
// =============================================================================

describe("CircuitBreaker", () => {
  it("starts in closed state", () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 3,
      successThreshold: 1,
      timeout: Duration.milliseconds(50),
    });
    expect(cb.state()).toBe("closed");
  });

  it("transitions to open after failureThreshold failures", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 2,
      successThreshold: 1,
      timeout: Duration.milliseconds(50),
    });

    const failing = mkTask(async () => Err("fail"));

    await cb.protect(failing).run();
    expect(cb.state()).toBe("closed");

    await cb.protect(failing).run();
    expect(cb.state()).toBe("open");
  });

  it("rejects requests when open with CircuitOpen error", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 1,
      successThreshold: 1,
      timeout: Duration.milliseconds(100),
    });

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    expect(cb.state()).toBe("open");

    const succeeding = mkTask(async () => Ok("should not run"));
    const result = await cb.protect(succeeding).run();
    expect(result.isErr).toBe(true);
    expect(CircuitOpen.is(result.unwrapErr())).toBe(true);
    expect(result.unwrapErr().tag).toBe("CircuitOpen");
  });

  it("transitions to half-open after timeout", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 1,
      successThreshold: 1,
      timeout: Duration.milliseconds(30),
    });

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    expect(cb.state()).toBe("open");

    await sleep(50);
    expect(cb.state()).toBe("half-open");
  });

  it("closes after successThreshold successes in half-open", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 1,
      successThreshold: 2,
      timeout: Duration.milliseconds(30),
    });

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    expect(cb.state()).toBe("open");

    await sleep(50);
    // Now half-open: two successes needed
    const succeeding = mkTask(async () => Ok("ok"));
    await cb.protect(succeeding).run();
    // After one success, still half-open (need 2)
    // state() itself also checks for transition, but internal state tracks successCount
    await cb.protect(succeeding).run();
    expect(cb.state()).toBe("closed");
  });

  it("reopens on failure in half-open", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 1,
      successThreshold: 2,
      timeout: Duration.milliseconds(30),
    });

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    expect(cb.state()).toBe("open");

    await sleep(50);
    expect(cb.state()).toBe("half-open");

    // Fail in half-open -> reopens
    await cb.protect(failing).run();
    expect(cb.state()).toBe("open");
  });

  it(".reset() returns to closed", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 1,
      successThreshold: 1,
      timeout: Duration.milliseconds(1000),
    });

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    expect(cb.state()).toBe("open");

    cb.reset();
    expect(cb.state()).toBe("closed");

    // After reset, requests pass through again
    const succeeding = mkTask(async () => Ok("ok"));
    const result = await cb.protect(succeeding).run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toBe("ok");
  });

  it(".state() reflects current state accurately", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 2,
      successThreshold: 1,
      timeout: Duration.milliseconds(30),
    });

    expect(cb.state()).toBe("closed");

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    expect(cb.state()).toBe("closed");

    await cb.protect(failing).run();
    expect(cb.state()).toBe("open");

    await sleep(50);
    expect(cb.state()).toBe("half-open");

    const succeeding = mkTask(async () => Ok("ok"));
    await cb.protect(succeeding).run();
    expect(cb.state()).toBe("closed");
  });
});

// =============================================================================
// 4. Semaphore / Mutex
// =============================================================================

describe("Semaphore", () => {
  it("allows n concurrent tasks", async () => {
    const sem = Semaphore.create(2);
    expect(sem.available()).toBe(2);
    expect(sem.pending()).toBe(0);

    const r1 = await sem.acquire();
    expect(sem.available()).toBe(1);
    const r2 = await sem.acquire();
    expect(sem.available()).toBe(0);

    r1();
    expect(sem.available()).toBe(1);
    r2();
    expect(sem.available()).toBe(2);
  });

  it("blocks the n+1th acquire until a permit is released", async () => {
    const sem = Semaphore.create(1);
    const order = [];

    const r1 = await sem.acquire();
    order.push("acquired-1");

    // Second acquire should block
    const p2 = sem.acquire().then(release => {
      order.push("acquired-2");
      return release;
    });

    // Let microtasks settle
    await sleep(5);
    expect(order.length).toBe(1);
    expect(sem.pending()).toBe(1);

    // Release first permit
    r1();
    const r2 = await p2;
    expect(order.length).toBe(2);
    expect(order).toEqual(["acquired-1", "acquired-2"]);
    r2();
  });

  describe(".wrap", () => {
    it("acquires before run and releases after completion", async () => {
      const sem = Semaphore.create(1);
      let running = 0;
      let maxRunning = 0;

      const tasks = Array.from({ length: 3 }, (_, i) =>
        sem.wrap(
          mkTask(async () => {
            running++;
            if (running > maxRunning) maxRunning = running;
            await sleep(10);
            running--;
            return Ok(i);
          }),
        ),
      );

      await Promise.all(tasks.map(t => t.run()));
      expect(maxRunning).toBe(1);
      expect(sem.available()).toBe(1);
    });

    it("releases permit even when task returns Err", async () => {
      const sem = Semaphore.create(1);
      const failing = sem.wrap(mkTask(async () => Err("boom")));
      const result = await failing.run();
      expect(result.isErr).toBe(true);
      expect(sem.available()).toBe(1);
    });
  });

  it(".available() and .pending() reflect state", async () => {
    const sem = Semaphore.create(2);
    expect(sem.available()).toBe(2);
    expect(sem.pending()).toBe(0);

    const r1 = await sem.acquire();
    expect(sem.available()).toBe(1);
    expect(sem.pending()).toBe(0);

    const r2 = await sem.acquire();
    expect(sem.available()).toBe(0);
    expect(sem.pending()).toBe(0);

    // Third acquire will pend
    const p3 = sem.acquire();
    // Let event loop tick
    await sleep(1);
    expect(sem.pending()).toBe(1);

    r1();
    await p3;
    expect(sem.pending()).toBe(0);
    r2();
  });
});

describe("Mutex", () => {
  it("only allows 1 concurrent task", async () => {
    const mutex = Mutex.create();
    expect(mutex.isLocked()).toBe(false);

    const r1 = await mutex.acquire();
    expect(mutex.isLocked()).toBe(true);

    r1();
    expect(mutex.isLocked()).toBe(false);
  });

  it(".isLocked() reflects state correctly", async () => {
    const mutex = Mutex.create();
    expect(mutex.isLocked()).toBe(false);

    const release = await mutex.acquire();
    expect(mutex.isLocked()).toBe(true);

    release();
    expect(mutex.isLocked()).toBe(false);
  });

  it(".wrap ensures mutual exclusion", async () => {
    const mutex = Mutex.create();
    let running = 0;
    let maxRunning = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      mutex.wrap(
        mkTask(async () => {
          running++;
          if (running > maxRunning) maxRunning = running;
          await sleep(5);
          running--;
          return Ok(i);
        }),
      ),
    );

    await Promise.all(tasks.map(t => t.run()));
    expect(maxRunning).toBe(1);
    expect(mutex.isLocked()).toBe(false);
  });
});

// =============================================================================
// 5. RateLimiter
// =============================================================================

describe("RateLimiter", () => {
  describe("tryAcquire", () => {
    it("succeeds while tokens are available", () => {
      const limiter = RateLimiter.create({
        capacity: 3,
        refillRate: 1,
        refillInterval: Duration.seconds(10),
      });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
    });

    it("fails when tokens are exhausted", () => {
      const limiter = RateLimiter.create({
        capacity: 2,
        refillRate: 1,
        refillInterval: Duration.seconds(10),
      });

      limiter.tryAcquire();
      limiter.tryAcquire();
      expect(limiter.tryAcquire()).toBe(false);
    });
  });

  it("tokens refill after interval", async () => {
    const limiter = RateLimiter.create({
      capacity: 2,
      refillRate: 2,
      refillInterval: Duration.milliseconds(30),
    });

    // Exhaust tokens
    limiter.tryAcquire();
    limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);

    // Wait for refill
    await sleep(50);
    expect(limiter.tryAcquire()).toBe(true);
  });

  describe(".wrap", () => {
    it("runs task when tokens available", async () => {
      const limiter = RateLimiter.create({
        capacity: 5,
        refillRate: 1,
        refillInterval: Duration.seconds(10),
      });

      const task = mkTask(async () => Ok("ok"));
      const result = await limiter.wrap(task).run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe("ok");
    });

    it("returns RateLimited error when tokens exhausted", async () => {
      const limiter = RateLimiter.create({
        capacity: 1,
        refillRate: 1,
        refillInterval: Duration.seconds(10),
      });

      const task = mkTask(async () => Ok("ok"));
      // First call uses the token
      await limiter.wrap(task).run();

      // Second call should be rate limited
      const result = await limiter.wrap(task).run();
      expect(result.isErr).toBe(true);
      expect(RateLimited.is(result.unwrapErr())).toBe(true);
      expect(result.unwrapErr().tag).toBe("RateLimited");
    });
  });

  it(".reset() restores full capacity", () => {
    const limiter = RateLimiter.create({
      capacity: 3,
      refillRate: 1,
      refillInterval: Duration.seconds(10),
    });

    limiter.tryAcquire();
    limiter.tryAcquire();
    limiter.tryAcquire();
    expect(limiter.tokens()).toBe(0);

    limiter.reset();
    expect(limiter.tokens()).toBe(3);
  });
});

// =============================================================================
// 6. Cache
// =============================================================================

describe("Cache", () => {
  describe(".set / .get", () => {
    it("stores and retrieves values", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      cache.set("key", "value");
      const result = cache.get("key");
      expect(result.isSome).toBe(true);
      expect(result.unwrap()).toBe("value");
    });

    it("returns None for missing keys", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      const result = cache.get("missing");
      expect(result.isNone).toBe(true);
    });
  });

  describe("TTL expiration", () => {
    it("expired entries return None", async () => {
      const cache = Cache.create({ ttl: Duration.milliseconds(30) });
      cache.set("key", "value");

      expect(cache.get("key").isSome).toBe(true);

      await sleep(50);
      expect(cache.get("key").isNone).toBe(true);
    });
  });

  describe("LRU eviction", () => {
    it("evicts oldest when maxSize exceeded", () => {
      const cache = Cache.create({
        ttl: Duration.seconds(10),
        maxSize: 2,
      });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3); // This should evict "a"

      expect(cache.get("a").isNone).toBe(true);
      expect(cache.get("b").isSome).toBe(true);
      expect(cache.get("c").isSome).toBe(true);
    });

    it("accessing a key moves it to most-recent (avoids eviction)", () => {
      const cache = Cache.create({
        ttl: Duration.seconds(10),
        maxSize: 2,
      });

      cache.set("a", 1);
      cache.set("b", 2);

      // Access "a" to make it most recently used
      cache.get("a");

      // Insert "c": should evict "b" (least recently used), not "a"
      cache.set("c", 3);

      expect(cache.get("a").isSome).toBe(true);
      expect(cache.get("b").isNone).toBe(true);
      expect(cache.get("c").isSome).toBe(true);
    });
  });

  describe(".has", () => {
    it("returns true for present keys", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      cache.set("key", "value");
      expect(cache.has("key")).toBe(true);
    });

    it("returns false for missing keys", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      expect(cache.has("missing")).toBe(false);
    });

    it("returns false for expired keys", async () => {
      const cache = Cache.create({ ttl: Duration.milliseconds(30) });
      cache.set("key", "value");
      await sleep(50);
      expect(cache.has("key")).toBe(false);
    });
  });

  describe(".delete", () => {
    it("removes an entry", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      cache.set("key", "value");
      expect(cache.delete("key")).toBe(true);
      expect(cache.get("key").isNone).toBe(true);
    });

    it("returns false when deleting non-existent key", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      expect(cache.delete("missing")).toBe(false);
    });
  });

  describe(".clear", () => {
    it("empties the cache", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get("a").isNone).toBe(true);
    });
  });

  describe(".size", () => {
    it("counts non-expired entries", async () => {
      const cache = Cache.create({ ttl: Duration.milliseconds(30) });
      cache.set("a", 1);
      cache.set("b", 2);
      expect(cache.size()).toBe(2);

      await sleep(50);
      expect(cache.size()).toBe(0);
    });
  });

  describe(".getOrElse", () => {
    it("returns cached value on hit", async () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      cache.set("key", "cached");

      let taskRan = false;
      const task = mkTask(async () => {
        taskRan = true;
        return Ok("computed");
      });

      const result = await cache.getOrElse("key", task).run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe("cached");
      expect(taskRan).toBe(false);
    });

    it("runs task on miss and caches the result", async () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });

      const task = mkTask(async () => Ok("computed"));
      const result = await cache.getOrElse("key", task).run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe("computed");

      // Value should now be cached
      expect(cache.get("key").unwrap()).toBe("computed");
    });

    it("does not cache on task error", async () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });

      const task = mkTask(async () => Err("fail"));
      const result = await cache.getOrElse("key", task).run();
      expect(result.isErr).toBe(true);
      expect(cache.has("key")).toBe(false);
    });
  });

  describe(".setWithTTL", () => {
    it("uses custom TTL for the entry", async () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });

      // Set with a short custom TTL
      cache.setWithTTL("short", "value", Duration.milliseconds(30));
      expect(cache.get("short").isSome).toBe(true);

      await sleep(50);
      expect(cache.get("short").isNone).toBe(true);
    });
  });
});

// =============================================================================
// 7. Channel
// =============================================================================

describe("Channel", () => {
  describe("bounded", () => {
    it("send/receive basic flow", async () => {
      const ch = Channel.bounded(10);
      await ch.send(1);
      await ch.send(2);
      await ch.send(3);
      ch.close();

      const received = [];
      for await (const v of ch.receive()) {
        received.push(v);
      }
      expect(received).toEqual([1, 2, 3]);
    });

    it("send blocks when buffer is full", async () => {
      const ch = Channel.bounded(1);
      const order = [];

      // First send buffers immediately
      await ch.send(1);
      order.push("sent-1");
      expect(ch.size()).toBe(1);

      // Second send should block until receiver drains
      const sendPromise = ch.send(2).then(ok => {
        order.push("sent-2");
        return ok;
      });

      // Let microtasks run, send-2 should still be blocked
      await sleep(5);
      expect(order.length).toBe(1);

      // Now consume one value to unblock
      const iter = ch.receive()[Symbol.asyncIterator]();
      const first = await iter.next();
      expect(first.value).toBe(1);

      await sendPromise;
      expect(order.length).toBe(2);

      // Clean up
      ch.close();
    });
  });

  describe("close", () => {
    it("subsequent sends return false", async () => {
      const ch = Channel.bounded(10);
      ch.close();
      const result = await ch.send(42);
      expect(result).toBe(false);
    });

    it("receivers get done", async () => {
      const ch = Channel.bounded(10);
      await ch.send(1);
      ch.close();

      const received = [];
      for await (const v of ch.receive()) {
        received.push(v);
      }
      expect(received).toEqual([1]);
    });

    it("waiting receivers resolve done on close", async () => {
      const ch = Channel.bounded(10);
      const iter = ch.receive()[Symbol.asyncIterator]();

      // Start waiting for a value
      const nextPromise = iter.next();

      // Close the channel
      ch.close();

      const result = await nextPromise;
      expect(result.done).toBe(true);
    });
  });

  describe("unbounded", () => {
    it("never blocks on send", async () => {
      const ch = Channel.unbounded();

      // Send many values rapidly without blocking
      for (let i = 0; i < 100; i++) {
        const ok = await ch.send(i);
        expect(ok).toBe(true);
      }

      ch.close();

      const received = [];
      for await (const v of ch.receive()) {
        received.push(v);
      }
      expect(received.length).toBe(100);
      expect(received[0]).toBe(0);
      expect(received[99]).toBe(99);
    });
  });

  describe(".isClosed / .size", () => {
    it(".isClosed reflects state", () => {
      const ch = Channel.bounded(10);
      expect(ch.isClosed()).toBe(false);
      ch.close();
      expect(ch.isClosed()).toBe(true);
    });

    it(".size reflects buffered count", async () => {
      const ch = Channel.bounded(10);
      expect(ch.size()).toBe(0);
      await ch.send(1);
      expect(ch.size()).toBe(1);
      await ch.send(2);
      expect(ch.size()).toBe(2);
    });
  });
});

describe("Channel rendezvous and iterator return", () => {
  it("capacity 0 send resolves only when a receiver takes the value", async () => {
    // Arrange
    const ch = Channel.bounded(0);
    let sent = false;
    const sendP = ch.send(1).then(ok => {
      sent = true;
      return ok;
    });
    await sleep(0);
    const it = ch.receive()[Symbol.asyncIterator]();

    // Act
    const sentBefore = sent;
    const got = await Promise.race([it.next(), sleep(50).then(() => "hung")]);

    // Assert
    expect(sentBefore).toBe(false);
    expect(got === "hung").toBe(false);
    expect(got.value).toBe(1);
    expect(await sendP).toBe(true);
  });

  it("capacity 0 receive waits for a sender", async () => {
    // Arrange
    const ch = Channel.bounded(0);
    const it = ch.receive()[Symbol.asyncIterator]();
    const nextP = it.next();

    // Act
    const ok = await ch.send(7);
    const got = await nextP;

    // Assert
    expect(ok).toBe(true);
    expect(got.value).toBe(7);
    expect(ch.size()).toBe(0);
  });

  it("iterator return() detaches a pending receiver", async () => {
    // Arrange
    const ch = Channel.bounded(4);
    const it = ch.receive()[Symbol.asyncIterator]();
    const pending = it.next();

    // Act
    const ret = await it.return();
    const pendingResult = await Promise.race([pending, sleep(50).then(() => "hung")]);
    await ch.send(5);

    // Assert
    expect(ret.done).toBe(true);
    expect(pendingResult === "hung").toBe(false);
    expect(pendingResult.done).toBe(true);
    expect(ch.size()).toBe(1);
  });

  it("break in for await exits the loop and leaves the channel usable", async () => {
    // Arrange
    const ch = Channel.bounded(4);
    await ch.send(1);
    await ch.send(2);
    const seen = [];

    // Act
    for await (const v of ch.receive()) {
      seen.push(v);
      break;
    }
    await ch.send(3);

    // Assert
    expect(seen).toEqual([1]);
    expect(ch.size()).toBe(2);
  });
});

// =============================================================================
// 8. Env
// =============================================================================

describe("Env", () => {
  describe("Env.of", () => {
    it("wraps a value and ignores the environment", async () => {
      const env = Env.of(42);
      const result = await env.run({ anything: true });
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe(42);
    });

    it("works with any environment type", async () => {
      const env = Env.of("hello");
      const result = await env.run(null);
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe("hello");
    });
  });

  describe("Env.access", () => {
    it("returns the environment as the produced value", async () => {
      const env = Env.access();
      const result = await env.run({ db: "postgres", port: 5432 });
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toEqual({ db: "postgres", port: 5432 });
    });
  });

  describe(".map", () => {
    it("transforms the produced value", async () => {
      const env = Env.of(10).map(n => n * 3);
      const result = await env.run({});
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe(30);
    });

    it("does not transform errors", async () => {
      const env = Env.from(async () => Err("fail")).map(() => "should not run");
      const result = await env.run({});
      expect(result.isErr).toBe(true);
      expect(result.unwrapErr()).toBe("fail");
    });
  });

  describe(".flatMap", () => {
    it("chains computations with the same environment", async () => {
      const getPort = Env.access().map(env => env.port);
      const getHost = Env.access().map(env => env.host);

      const combined = getPort.flatMap(port => getHost.map(host => `${host}:${port}`));

      const result = await combined.run({ host: "localhost", port: 8080 });
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe("localhost:8080");
    });

    it("short-circuits on error", async () => {
      let secondRan = false;
      const failing = Env.from(async () => Err("oops"));
      const chained = failing.flatMap(() => {
        secondRan = true;
        return Env.of("never");
      });

      const result = await chained.run({});
      expect(result.isErr).toBe(true);
      expect(secondRan).toBe(false);
    });
  });

  describe(".provide", () => {
    it("narrows the environment by transforming outer to inner", async () => {
      // Inner env expects { db: string }
      const inner = Env.access().map(env => env.db);

      // Provide transforms { config: { database: string } } -> { db: string }
      const outer = inner.provide(env => ({ db: env.config.database }));

      const result = await outer.run({ config: { database: "mydb" } });
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe("mydb");
    });
  });

  describe(".provideAll", () => {
    it("converts to a Task-like by supplying the full environment", async () => {
      const env = Env.access().map(e => e.name);
      const taskLike = env.provideAll({ name: "Alice" });

      // taskLike has .run() that takes no arguments
      const result = await taskLike.run();
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe("Alice");
    });
  });

  describe(".tap", () => {
    it("runs side effect without changing result", async () => {
      let sideEffect = null;
      const env = Env.of("value").tap(v => {
        sideEffect = v;
      });

      const result = await env.run({});
      expect(result.isOk).toBe(true);
      expect(result.unwrap()).toBe("value");
      expect(sideEffect).toBe("value");
    });

    it("does not run side effect on error", async () => {
      let sideEffect = null;
      const env = Env.from(async () => Err("fail")).tap(v => {
        sideEffect = v;
      });

      const result = await env.run({});
      expect(result.isErr).toBe(true);
      expect(sideEffect).toBe(null);
    });
  });
});

// =============================================================================
// 10. Stream reactive operators
// =============================================================================

// Helper: create an async iterable from timed steps (for debounce tests)
const timedSource = steps => {
  let i = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          while (i < steps.length) {
            const step = steps[i++];
            if (step.delay > 0) {
              await sleep(step.delay);
            }
            if (step.value !== null) {
              return { value: step.value, done: false };
            }
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
};

describe("Stream.debounce", () => {
  it("emits only the last value after a burst", async () => {
    // Source emits 1, 2, 3 rapidly (no delay between them), then stops.
    // Debounce of 50ms should only emit the last value (3).
    const s = Stream(() => {
      let i = 0;
      const values = [Ok(1), Ok(2), Ok(3)];
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (i < values.length) {
                return { value: values[i++], done: false };
              }
              return { value: undefined, done: true };
            },
          };
        },
      };
    }).debounce(50);

    const result = await s.collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([3]);
  });

  it("emits multiple values when there are pauses between bursts", async () => {
    // Emit 1, 2 rapidly, then wait, then emit 3, 4 rapidly.
    // Debounce of 30ms should emit 2 (end of first burst) and 4 (end of second burst).
    const s = Stream(() => {
      return timedSource([
        { value: Ok(1), delay: 0 },
        { value: Ok(2), delay: 0 },
        { value: null, delay: 80 }, // pause
        { value: Ok(3), delay: 0 },
        { value: Ok(4), delay: 0 },
      ]);
    }).debounce(30);

    const result = await s.collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([2, 4]);
  });

  it("handles empty stream", async () => {
    const result = await Stream.empty().debounce(50).collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("handles single value", async () => {
    const result = await Stream.of(42).debounce(30).collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([42]);
  });
});

describe("Stream.throttle", () => {
  it("lets the first value through immediately", async () => {
    const result = await Stream.of(1, 2, 3).throttle(1000).collect().run();
    expect(result.isOk).toBe(true);
    // Only the first value passes because the others arrive within the same ms window
    expect(result.unwrap().length > 0).toBe(true);
    expect(result.unwrap()[0]).toBe(1);
  });

  it("drops values within the throttle window", async () => {
    // All values are emitted synchronously, so only the first passes a 100ms throttle
    const result = await Stream.of(1, 2, 3, 4, 5).throttle(100).collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([1]);
  });

  it("emits values that arrive after the window expires", async () => {
    // Create a stream with delays: value, pause, value
    const s = Stream(() => {
      const steps = [
        { value: Ok(1), delay: 0 },
        { value: Ok(2), delay: 60 },
        { value: Ok(3), delay: 60 },
      ];
      let i = 0;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (i >= steps.length) {
                return { value: undefined, done: true };
              }
              const step = steps[i++];
              if (step.delay > 0) {
                await sleep(step.delay);
              }
              return { value: step.value, done: false };
            },
          };
        },
      };
    }).throttle(50);

    const result = await s.collect().run();
    expect(result.isOk).toBe(true);
    // First value passes, second arrives after 60ms (> 50ms window), third arrives after another 60ms
    expect(result.unwrap()).toEqual([1, 2, 3]);
  });

  it("handles empty stream", async () => {
    const result = await Stream.empty().throttle(100).collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("passes errors through without throttling", async () => {
    const s = Stream(() => {
      let i = 0;
      const values = [Ok(1), Err("oops")];
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (i < values.length) {
                return { value: values[i++], done: false };
              }
              return { value: undefined, done: true };
            },
          };
        },
      };
    }).throttle(1000);

    const result = await s.collect().run();
    // collect() short-circuits on first Err
    expect(result.isErr).toBe(true);
  });
});

describe("Stream.distinctUntilChanged", () => {
  it("removes consecutive duplicates with default equality", async () => {
    const result = await Stream.of(1, 1, 2, 2, 3, 3, 1).distinctUntilChanged().collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([1, 2, 3, 1]);
  });

  it("passes all values when no consecutive duplicates exist", async () => {
    const result = await Stream.of(1, 2, 3, 4).distinctUntilChanged().collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([1, 2, 3, 4]);
  });

  it("handles single-element stream", async () => {
    const result = await Stream.of(42).distinctUntilChanged().collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([42]);
  });

  it("handles empty stream", async () => {
    const result = await Stream.empty().distinctUntilChanged().collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("uses custom equality function", async () => {
    // Compare objects by their 'id' field
    const items = [
      { id: 1, name: "a" },
      { id: 1, name: "b" },
      { id: 2, name: "c" },
      { id: 2, name: "d" },
      { id: 3, name: "e" },
    ];
    const result = await Stream.fromArray(items)
      .distinctUntilChanged((a, b) => a.id === b.id)
      .collect()
      .run();
    expect(result.isOk).toBe(true);
    const values = result.unwrap();
    expect(values.length).toBe(3);
    expect(values[0].name).toBe("a");
    expect(values[1].name).toBe("c");
    expect(values[2].name).toBe("e");
  });

  it("handles all identical values", async () => {
    const result = await Stream.of(5, 5, 5, 5).distinctUntilChanged().collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([5]);
  });
});

describe("Stream.merge", () => {
  it("combines values from multiple streams", async () => {
    const a = Stream.of(1, 2, 3);
    const b = Stream.of(4, 5, 6);
    const result = await Stream.merge(a, b).collect().run();
    expect(result.isOk).toBe(true);
    const values = result.unwrap();
    // All values should be present (order may vary due to concurrency)
    expect(values.length).toBe(6);
    expect(values.includes(1)).toBe(true);
    expect(values.includes(2)).toBe(true);
    expect(values.includes(3)).toBe(true);
    expect(values.includes(4)).toBe(true);
    expect(values.includes(5)).toBe(true);
    expect(values.includes(6)).toBe(true);
  });

  it("handles single stream", async () => {
    const result = await Stream.merge(Stream.of(1, 2, 3))
      .collect()
      .run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([1, 2, 3]);
  });

  it("handles empty streams", async () => {
    const result = await Stream.merge(Stream.empty(), Stream.empty()).collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });

  it("handles mix of empty and non-empty streams", async () => {
    const result = await Stream.merge(Stream.empty(), Stream.of(1, 2), Stream.empty())
      .collect()
      .run();
    expect(result.isOk).toBe(true);
    const values = result.unwrap();
    expect(values.length).toBe(2);
    expect(values.includes(1)).toBe(true);
    expect(values.includes(2)).toBe(true);
  });

  it("interleaves streams with different speeds", async () => {
    // Stream a emits immediately, stream b emits with delays
    const a = Stream.of(1, 2);
    const b = Stream(() => {
      let i = 0;
      const values = [Ok(10), Ok(20)];
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (i >= values.length) {
                return { value: undefined, done: true };
              }
              await sleep(20);
              return { value: values[i++], done: false };
            },
          };
        },
      };
    });

    const result = await Stream.merge(a, b).collect().run();
    expect(result.isOk).toBe(true);
    const values = result.unwrap();
    expect(values.length).toBe(4);
    expect(values.includes(1)).toBe(true);
    expect(values.includes(2)).toBe(true);
    expect(values.includes(10)).toBe(true);
    expect(values.includes(20)).toBe(true);
  });

  it("bounds how far sources are read ahead of a slow consumer", async () => {
    // Arrange
    const SOURCE_LENGTH = 1000;
    const SOURCES = 2;
    const SETTLE_MS = 20;
    // One buffered value per source plus one refill per consumed value.
    const MAX_READ_AHEAD = SOURCES * 2;
    const reads = [0, 0];
    const counting = idx =>
      Stream(() => ({
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (reads[idx] >= SOURCE_LENGTH) return { value: undefined, done: true };
              reads[idx]++;
              return { value: Ok(reads[idx]), done: false };
            },
            async return() {
              return { value: undefined, done: true };
            },
          };
        },
      }));
    const iter = Stream.merge(counting(0), counting(1)).run()[Symbol.asyncIterator]();
    // Act
    await iter.next();
    await iter.next();
    await new Promise(resolve => setTimeout(resolve, SETTLE_MS));
    const readsAfterTwo = reads[0] + reads[1];
    await iter.return();
    // Assert
    expect(readsAfterTwo).toBeLessThanOrEqual(MAX_READ_AHEAD);
  });

  it("handles zero streams (no arguments)", async () => {
    const result = await Stream.merge().collect().run();
    expect(result.isOk).toBe(true);
    expect(result.unwrap()).toEqual([]);
  });
});

// =============================================================================
// 10. StateMachine
// =============================================================================

describe("StateMachine", () => {
  const machine = StateMachine({
    initial: "idle",
    states: { idle: {}, loading: {}, success: {}, error: {} },
    transitions: {
      idle: { FETCH: "loading" },
      loading: { RESOLVE: "success", REJECT: "error" },
      success: { RESET: "idle" },
      error: { RETRY: "loading", RESET: "idle" },
    },
  });

  it("initial: returns the initial state", () => {
    expect(machine.initial).toBe("idle");
  });

  it("states: returns frozen array of state names", () => {
    expect(machine.states).toEqual(["idle", "loading", "success", "error"]);
    expect(() => {
      machine.states[0] = "x";
    }).toThrow();
  });

  it("events: returns valid events for a state", () => {
    expect(machine.events("idle")).toEqual(["FETCH"]);
    expect(machine.events("loading")).toEqual(["RESOLVE", "REJECT"]);
  });

  it("events: returns empty for state with no transitions", () => {
    expect(machine.events("nonexistent")).toEqual([]);
  });

  it("transition: valid transition returns [nextState, ctx]", () => {
    const [next, ctx] = machine.transition("idle", undefined, "FETCH");
    expect(next).toBe("loading");
    expect(ctx).toBe(undefined);
  });

  it("transition: chained transitions", () => {
    const [s1] = machine.transition("idle", undefined, "FETCH");
    const [s2] = machine.transition(s1, undefined, "RESOLVE");
    expect(s2).toBe("success");
  });

  it("send: valid transition returns Ok", () => {
    const result = machine.send("idle", undefined, "FETCH");
    expect(result.isOk).toBe(true);
    expect(result.value[0]).toBe("loading");
  });

  it("send: invalid event returns Err(InvalidTransition)", () => {
    const result = machine.send("idle", undefined, "RESOLVE");
    expect(result.isErr).toBe(true);
    expect(result.error.tag).toBe("InvalidTransition");
  });

  it("send: invalid state returns Err", () => {
    const result = machine.send("nonexistent", undefined, "FETCH");
    expect(result.isErr).toBe(true);
  });

  it("canTransition: returns true for valid", () => {
    expect(machine.canTransition("idle", "FETCH")).toBe(true);
  });

  it("canTransition: returns false for invalid", () => {
    expect(machine.canTransition("idle", "RESOLVE")).toBe(false);
  });

  it("machine object is frozen", () => {
    expect(() => {
      machine.initial = "x";
    }).toThrow();
  });
});

describe("StateMachine with guards and actions", () => {
  it("guard blocks transition", () => {
    const m = StateMachine({
      initial: "locked",
      states: { locked: {}, unlocked: {} },
      transitions: {
        locked: { UNLOCK: { target: "unlocked", guard: ctx => ctx.hasKey } },
        unlocked: { LOCK: "locked" },
      },
    });
    const blocked = m.send("locked", { hasKey: false }, "UNLOCK");
    expect(blocked.isErr).toBe(true);
    expect(blocked.error.message.includes("Guard")).toBe(true);

    const allowed = m.send("locked", { hasKey: true }, "UNLOCK");
    expect(allowed.isOk).toBe(true);
    expect(allowed.value[0]).toBe("unlocked");
  });

  it("action transforms context", () => {
    const m = StateMachine({
      initial: "idle",
      states: { idle: {}, active: {} },
      transitions: {
        idle: { START: { target: "active", action: ctx => ({ ...ctx, count: ctx.count + 1 }) } },
        active: { STOP: "idle" },
      },
    });
    const result = m.send("idle", { count: 0 }, "START");
    expect(result.isOk).toBe(true);
    expect(result.value[1].count).toBe(1);
  });

  it("entry/exit hooks fire in correct order", () => {
    const log = [];
    const m = StateMachine({
      initial: "a",
      states: {
        a: {
          onExit: ctx => {
            log.push("exit-a");
            return ctx;
          },
        },
        b: {
          onEntry: ctx => {
            log.push("enter-b");
            return ctx;
          },
        },
      },
      transitions: {
        a: {
          GO: {
            target: "b",
            action: ctx => {
              log.push("action");
              return ctx;
            },
          },
        },
        b: { BACK: "a" },
      },
    });
    m.send("a", undefined, "GO");
    expect(log).toEqual(["exit-a", "action", "enter-b"]);
  });
});

// =============================================================================
// EventEmitter
// =============================================================================

describe("EventEmitter", () => {
  it("on + emit: handler receives typed payload", () => {
    const emitter = EventEmitter.create();
    const received = [];
    emitter.on("data", payload => {
      received.push(payload);
    });
    emitter.emit("data", { id: "u1", name: "Alice" });
    expect(received).toEqual([{ id: "u1", name: "Alice" }]);
  });

  it("multiple handlers on same event", () => {
    const emitter = EventEmitter.create();
    const log = [];
    emitter.on("ping", () => {
      log.push("a");
    });
    emitter.on("ping", () => {
      log.push("b");
    });
    emitter.emit("ping", undefined);
    expect(log).toEqual(["a", "b"]);
  });

  it("off removes specific handler", () => {
    const emitter = EventEmitter.create();
    const log = [];
    const handlerA = () => {
      log.push("a");
    };
    const handlerB = () => {
      log.push("b");
    };
    emitter.on("evt", handlerA);
    emitter.on("evt", handlerB);
    emitter.off("evt", handlerA);
    emitter.emit("evt", undefined);
    expect(log).toEqual(["b"]);
  });

  it("once fires handler only once", () => {
    const emitter = EventEmitter.create();
    let count = 0;
    emitter.once("tick", () => {
      count++;
    });
    emitter.emit("tick", undefined);
    emitter.emit("tick", undefined);
    emitter.emit("tick", undefined);
    expect(count).toBe(1);
  });

  it("emit with no handlers does not throw", () => {
    const emitter = EventEmitter.create();
    expect(() => {
      emitter.emit("nope", undefined);
    }).not.toThrow();
  });

  it("removeAll clears all handlers for event", () => {
    const emitter = EventEmitter.create();
    let count = 0;
    emitter.on("x", () => {
      count++;
    });
    emitter.on("x", () => {
      count++;
    });
    emitter.removeAll("x");
    emitter.emit("x", undefined);
    expect(count).toBe(0);
    expect(emitter.listenerCount("x")).toBe(0);
  });

  it("listenerCount returns correct count", () => {
    const emitter = EventEmitter.create();
    expect(emitter.listenerCount("e")).toBe(0);
    const h1 = () => {
      /* noop listener */
    };
    const h2 = () => {
      /* noop listener */
    };
    emitter.on("e", h1);
    expect(emitter.listenerCount("e")).toBe(1);
    emitter.on("e", h2);
    expect(emitter.listenerCount("e")).toBe(2);
    emitter.off("e", h1);
    expect(emitter.listenerCount("e")).toBe(1);
  });

  it("different events are independent", () => {
    const emitter = EventEmitter.create();
    const aLog = [];
    const bLog = [];
    emitter.on("a", v => {
      aLog.push(v);
    });
    emitter.on("b", v => {
      bLog.push(v);
    });
    emitter.emit("a", 1);
    emitter.emit("b", 2);
    emitter.emit("a", 3);
    expect(aLog).toEqual([1, 3]);
    expect(bLog).toEqual([2]);
  });

  it("returned instance is frozen", () => {
    const emitter = EventEmitter.create();
    expect(Object.isFrozen(emitter)).toBe(true);
  });
});

// =============================================================================
// Pool
// =============================================================================

describe("Pool", () => {
  it("a failed create hands the freed slot to a queued waiter", async () => {
    // Arrange
    let calls = 0;
    const pool = Pool.create({
      create: async () => {
        calls++;
        if (calls === 1) {
          await new Promise(resolve => setTimeout(resolve, 20));
          throw new Error("create failed");
        }
        return { id: calls };
      },
      maxSize: 1,
    });
    // Act
    const first = pool.acquire().run();
    const second = pool.acquire().run();
    const results = await Promise.race([
      Promise.all([first, second]),
      new Promise(resolve => setTimeout(() => resolve("hung"), 1000)),
    ]);
    // Assert
    expect(results).not.toBe("hung");
    expect(results[0].isErr).toBe(true);
    expect(results[1].isOk).toBe(true);
    results[1].value.release();
    await pool.drain();
  });

  it("acquire returns a resource", async () => {
    const pool = Pool.create({
      create: async () => ({ id: 1 }),
      maxSize: 2,
    });
    const result = await pool.acquire().run();
    expect(result.isOk).toBe(true);
    expect(result.value).toBeTruthy();
    result.value.release();
    await pool.drain();
  });

  it("release returns resource to pool", async () => {
    let created = 0;
    const pool = Pool.create({
      create: async () => {
        created++;
        return { id: created };
      },
      maxSize: 2,
    });
    const r1 = await pool.acquire().run();
    expect(r1.isOk).toBe(true);
    r1.value.release();
    // Acquiring again should reuse the released resource, not create a new one
    const r2 = await pool.acquire().run();
    expect(r2.isOk).toBe(true);
    expect(created).toBe(1);
    r2.value.release();
    await pool.drain();
  });

  it("acquired resource.value is the created object", async () => {
    const obj = { x: 42 };
    const pool = Pool.create({
      create: async () => obj,
      maxSize: 1,
    });
    const result = await pool.acquire().run();
    expect(result.isOk).toBe(true);
    expect(result.value.value).toBe(obj);
    result.value.release();
    await pool.drain();
  });

  it("use() auto-releases after fn completes", async () => {
    let created = 0;
    const pool = Pool.create({
      create: async () => {
        created++;
        return { id: created };
      },
      maxSize: 1,
    });
    const result = await pool
      .use(async resource => {
        return resource.id;
      })
      .run();
    expect(result.isOk).toBe(true);
    expect(result.value).toBe(1);
    // Pool should have 1 idle resource after use()
    expect(pool.idle()).toBe(1);
    expect(pool.active()).toBe(0);
    await pool.drain();
  });

  it("use() auto-releases on fn error", async () => {
    const pool = Pool.create({
      create: async () => ({ id: 1 }),
      maxSize: 1,
    });
    const result = await pool
      .use(async () => {
        throw new Error("boom");
      })
      .run();
    expect(result.isErr).toBe(true);
    expect(result.error.tag).toBe("PoolError");
    expect(result.error.message.includes("boom")).toBe(true);
    // Resource should be back in the pool
    expect(pool.idle()).toBe(1);
    expect(pool.active()).toBe(0);
    await pool.drain();
  });

  it("maxSize limits concurrent resources", async () => {
    let created = 0;
    const pool = Pool.create({
      create: async () => {
        created++;
        return { id: created };
      },
      maxSize: 2,
    });
    const r1 = await pool.acquire().run();
    const r2 = await pool.acquire().run();
    expect(r1.isOk).toBe(true);
    expect(r2.isOk).toBe(true);
    expect(created).toBe(2);
    expect(pool.active()).toBe(2);

    // Third acquire should block until one is released
    let r3resolved = false;
    const r3promise = pool
      .acquire()
      .run()
      .then(r => {
        r3resolved = true;
        return r;
      });

    // Give the microtask queue a tick
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(r3resolved).toBe(false);

    // Release one resource to unblock
    r1.value.release();
    const r3 = await r3promise;
    expect(r3resolved).toBe(true);
    expect(r3.isOk).toBe(true);

    // Should have reused, not created a third
    expect(created).toBe(2);
    r2.value.release();
    r3.value.release();
    await pool.drain();
  });

  it("size/idle/active return correct counts", async () => {
    const pool = Pool.create({
      create: async () => ({ id: 1 }),
      maxSize: 5,
    });
    expect(pool.size()).toBe(0);
    expect(pool.idle()).toBe(0);
    expect(pool.active()).toBe(0);

    const r1 = await pool.acquire().run();
    expect(pool.size()).toBe(1);
    expect(pool.idle()).toBe(0);
    expect(pool.active()).toBe(1);

    const r2 = await pool.acquire().run();
    expect(pool.size()).toBe(2);
    expect(pool.idle()).toBe(0);
    expect(pool.active()).toBe(2);

    r1.value.release();
    expect(pool.size()).toBe(2);
    expect(pool.idle()).toBe(1);
    expect(pool.active()).toBe(1);

    r2.value.release();
    expect(pool.size()).toBe(2);
    expect(pool.idle()).toBe(2);
    expect(pool.active()).toBe(0);

    await pool.drain();
  });

  it("drain destroys all resources", async () => {
    const destroyed = [];
    const pool = Pool.create({
      create: async () => ({ id: destroyed.length + 1 }),
      destroy: async resource => {
        destroyed.push(resource.id);
      },
      maxSize: 3,
    });
    const r1 = await pool.acquire().run();
    const r2 = await pool.acquire().run();
    r1.value.release();
    // r1 is idle, r2 is active
    expect(pool.idle()).toBe(1);
    expect(pool.active()).toBe(1);

    const drainPromise = pool.drain();
    // The idle resource should be destroyed immediately
    // Release active resource so drain can finish
    r2.value.release();
    await drainPromise;
    expect(destroyed.length).toBe(2);
    expect(pool.size()).toBe(0);
  });

  it("validate rejects unhealthy resources and creates new one", async () => {
    let created = 0;
    const pool = Pool.create({
      create: async () => {
        created++;
        return { id: created };
      },
      validate: resource => resource.id !== 1,
      maxSize: 2,
    });
    // First acquire creates resource with id 1
    const r1 = await pool.acquire().run();
    expect(r1.isOk).toBe(true);
    expect(r1.value.value.id).toBe(1);
    r1.value.release();

    // Second acquire finds id=1 idle, validates it (fails), creates new
    const r2 = await pool.acquire().run();
    expect(r2.isOk).toBe(true);
    expect(r2.value.value.id).toBe(2);
    expect(created).toBe(2);
    r2.value.release();
    await pool.drain();
  });

  it("never exceeds maxSize when concurrent acquires race a create", async () => {
    // Arrange
    let created = 0;
    const pool = Pool.create({
      create: async () => {
        created++;
        await Promise.resolve();
        return { id: created };
      },
      maxSize: 1,
    });

    // Act
    const p1 = pool.acquire().run();
    const p2 = pool.acquire().run();
    const p3 = pool.acquire().run();
    const r1 = await p1;
    r1.value.release();
    const r2 = await p2;
    r2.value.release();
    const r3 = await p3;
    r3.value.release();

    // Assert
    expect(created).toBe(1);
    await pool.drain();
  });

  it("never exceeds maxSize while an idle resource is being validated", async () => {
    // Arrange
    let created = 0;
    const pool = Pool.create({
      create: async () => ({ id: ++created }),
      validate: async () => {
        await Promise.resolve();
        await Promise.resolve();
        return true;
      },
      maxSize: 1,
    });
    const first = await pool.acquire().run();
    first.value.release();

    // Act
    const pa = pool.acquire().run();
    const pb = pool.acquire().run();
    const ra = await pa;
    ra.value.release();
    const rb = await pb;
    rb.value.release();

    // Assert
    expect(created).toBe(1);
    await pool.drain();
  });

  it("rejects waiters pending at drain with a PoolError", async () => {
    // Arrange
    const pool = Pool.create({ create: async () => ({}), maxSize: 1 });
    const held = await pool.acquire().run();
    const waiter = pool.acquire().run();
    await sleep(0);

    // Act
    const drained = pool.drain();
    const outcome = await Promise.race([waiter, sleep(50).then(() => "hung")]);
    held.value.release();
    await drained;

    // Assert
    expect(outcome === "hung").toBe(false);
    expect(outcome.isErr).toBe(true);
    expect(outcome.error.tag).toBe("PoolError");
  });

  it("PoolError has correct tag", () => {
    const err = PoolError("test message");
    expect(err.tag).toBe("PoolError");
    expect(err.code).toBe("POOL_ERROR");
    expect(err.message).toBe("test message");
  });

  it("returned instance is frozen", () => {
    const pool = Pool.create({
      create: async () => ({}),
      maxSize: 1,
    });
    expect(Object.isFrozen(pool)).toBe(true);
  });

  it("acquire after drain returns error", async () => {
    const pool = Pool.create({
      create: async () => ({}),
      maxSize: 1,
    });
    await pool.drain();
    const result = await pool.acquire().run();
    expect(result.isErr).toBe(true);
    expect(result.error.tag).toBe("PoolError");
    expect(result.error.message.includes("draining")).toBe(true);
  });

  it("double release is safe (no-op)", async () => {
    const pool = Pool.create({
      create: async () => ({ id: 1 }),
      maxSize: 2,
    });
    const result = await pool.acquire().run();
    expect(result.isOk).toBe(true);
    result.value.release();
    result.value.release(); // should not throw or double-return
    expect(pool.idle()).toBe(1);
    await pool.drain();
  });
});

// =============================================================================
// Queue
// =============================================================================

describe("Queue", () => {
  it("push and process a job", async () => {
    const processed = [];
    const queue = Queue.create({
      handler: async job => {
        processed.push(job.data);
      },
    });

    queue.push("hello");
    await queue.drain();

    expect(processed).toEqual(["hello"]);
    expect(queue.processed()).toBe(1);
  });

  it("concurrency limits parallel execution", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const queue = Queue.create({
      concurrency: 2,
      handler: async () => {
        currentConcurrent++;
        if (currentConcurrent > maxConcurrent) {
          maxConcurrent = currentConcurrent;
        }
        await sleep(50);
        currentConcurrent--;
      },
    });

    queue.push("a");
    queue.push("b");
    queue.push("c");
    queue.push("d");

    await queue.drain();

    expect(maxConcurrent).toBe(2);
    expect(queue.processed()).toBe(4);
  });

  it("priority ordering (lower priority number runs first)", async () => {
    const order = [];
    let gate;
    const gatePromise = new Promise(resolve => {
      gate = resolve;
    });

    const queue = Queue.create({
      concurrency: 1,
      handler: async job => {
        if (order.length === 0) {
          // First job blocks until gate opens, allowing others to queue
          await gatePromise;
        }
        order.push(job.data);
      },
    });

    // Push the blocker first (default priority 10)
    queue.push("blocker");
    // Wait a tick for the blocker to start processing
    await sleep(5);

    // Now push jobs with different priorities while blocker is active
    queue.push("low", { priority: 10 });
    queue.push("high", { priority: 0 });
    queue.push("medium", { priority: 5 });

    // Release the blocker
    gate();
    await queue.drain();

    // After blocker, jobs should process in priority order: high(0), medium(5), low(10)
    expect(order).toEqual(["blocker", "high", "medium", "low"]);
  });

  it("drain waits for all jobs", async () => {
    const results = [];

    const queue = Queue.create({
      concurrency: 2,
      handler: async job => {
        await sleep(20);
        results.push(job.data);
      },
    });

    queue.push(1);
    queue.push(2);
    queue.push(3);

    // Before drain, not all jobs are done
    expect(results.length < 3).toBe(true);

    await queue.drain();

    // After drain, all jobs are done
    expect(results.length).toBe(3);
    expect(queue.size()).toBe(0);
    expect(queue.active()).toBe(0);
  });

  it("drain resolves immediately when queue is empty", async () => {
    const queue = Queue.create({
      handler: async () => {
        /* noop */
      },
    });

    // Should resolve immediately with no jobs
    await queue.drain();
    expect(queue.size()).toBe(0);
  });

  it("pause/resume lifecycle", async () => {
    const processed = [];

    const queue = Queue.create({
      handler: async job => {
        processed.push(job.data);
      },
    });

    queue.pause();
    queue.push("a");
    queue.push("b");

    // Jobs are pending but not processing
    expect(queue.size()).toBe(2);
    expect(queue.active()).toBe(0);
    await sleep(20);
    expect(processed).toEqual([]);

    // Resume starts processing
    queue.resume();
    await queue.drain();

    expect(processed).toEqual(["a", "b"]);
  });

  it("onError callback fires on handler failure", async () => {
    const errors = [];

    const queue = Queue.create({
      handler: async job => {
        throw new Error(`fail-${job.data}`);
      },
      onError: (error, job) => {
        errors.push({ msg: error.message, data: job.data });
      },
    });

    queue.push("x");
    await queue.drain();

    expect(errors.length).toBe(1);
    expect(errors[0].msg).toBe("fail-x");
    expect(errors[0].data).toBe("x");
    // Failed jobs still count as processed
    expect(queue.processed()).toBe(1);
  });

  it("size/active/processed counts", async () => {
    let resolveFirst;
    const firstJobPromise = new Promise(resolve => {
      resolveFirst = resolve;
    });

    const queue = Queue.create({
      concurrency: 1,
      handler: async job => {
        if (job.data === "first") {
          await firstJobPromise;
        }
      },
    });

    expect(queue.size()).toBe(0);
    expect(queue.active()).toBe(0);
    expect(queue.processed()).toBe(0);

    queue.push("first");
    await sleep(5);

    // First job is active, none pending
    expect(queue.active()).toBe(1);
    expect(queue.size()).toBe(0);
    expect(queue.processed()).toBe(0);

    queue.push("second");
    queue.push("third");

    // Two pending, one active
    expect(queue.size()).toBe(2);
    expect(queue.active()).toBe(1);

    resolveFirst();
    await queue.drain();

    expect(queue.size()).toBe(0);
    expect(queue.active()).toBe(0);
    expect(queue.processed()).toBe(3);
  });

  it("returned instance is frozen", () => {
    const queue = Queue.create({
      handler: async () => {
        /* noop */
      },
    });

    expect(Object.isFrozen(queue)).toBe(true);
  });

  it("jobs have unique ids", async () => {
    const ids = [];

    const queue = Queue.create({
      handler: async job => {
        ids.push(job.id);
      },
    });

    queue.push("a");
    queue.push("b");
    queue.push("c");
    await queue.drain();

    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(3);
  });
});

// =============================================================================
// CronRunner
// =============================================================================

describe("CronRunner", () => {
  it("create with valid cron expression", () => {
    const runner = CronRunner.create({
      schedule: "* * * * *",
      handler: async () => {
        /* noop */
      },
    });

    expect(runner).toBeTruthy();
    expect(typeof runner.start).toBe("function");
    expect(typeof runner.stop).toBe("function");
    expect(typeof runner.isRunning).toBe("function");
    expect(typeof runner.nextRun).toBe("function");
  });

  it("throws on invalid cron expression", () => {
    expect(() =>
      CronRunner.create({
        schedule: "not a cron",
        handler: async () => {
          /* noop */
        },
      }),
    ).toThrow();
  });

  it("start/stop lifecycle", () => {
    const runner = CronRunner.create({
      schedule: "0 * * * *",
      handler: async () => {
        /* noop */
      },
    });

    expect(runner.isRunning()).toBe(false);
    runner.start();
    expect(runner.isRunning()).toBe(true);
    runner.stop();
    expect(runner.isRunning()).toBe(false);
  });

  it("isRunning returns correct state", () => {
    const runner = CronRunner.create({
      schedule: "0 9 * * *",
      handler: async () => {
        /* noop */
      },
    });

    expect(runner.isRunning()).toBe(false);
    runner.start();
    expect(runner.isRunning()).toBe(true);
    runner.start(); // double start is a no-op
    expect(runner.isRunning()).toBe(true);
    runner.stop();
    expect(runner.isRunning()).toBe(false);
    runner.stop(); // double stop is a no-op
    expect(runner.isRunning()).toBe(false);
  });

  it("runImmediately executes handler on start", async () => {
    let called = false;

    const runner = CronRunner.create({
      schedule: "0 0 1 1 *", // once a year, won't fire naturally
      handler: async () => {
        called = true;
      },
      runImmediately: true,
    });

    runner.start();
    // Give the handler a tick to execute
    await sleep(10);
    runner.stop();

    expect(called).toBe(true);
  });

  it("stop prevents further executions", () => {
    const runner = CronRunner.create({
      schedule: "* * * * *",
      handler: async () => {
        /* noop */
      },
    });

    runner.start();
    runner.stop();

    expect(runner.isRunning()).toBe(false);
    // nextRun returns undefined when stopped
    expect(runner.nextRun()).toBe(undefined);
  });

  it("nextRun returns a Date when running", () => {
    const runner = CronRunner.create({
      schedule: "* * * * *", // every minute
      handler: async () => {
        /* noop */
      },
    });

    // Not running: nextRun is undefined
    expect(runner.nextRun()).toBe(undefined);

    runner.start();
    const next = runner.nextRun();
    expect(next instanceof Date).toBe(true);
    expect(next.getTime() > Date.now()).toBe(true);
    runner.stop();
  });

  it("onError callback fires on handler failure", async () => {
    let capturedError;

    const runner = CronRunner.create({
      schedule: "0 0 1 1 *",
      handler: async () => {
        throw new Error("cron-fail");
      },
      onError: error => {
        capturedError = error;
      },
      runImmediately: true,
    });

    runner.start();
    await sleep(10);
    runner.stop();

    expect(capturedError).toBeTruthy();
    expect(capturedError.message).toBe("cron-fail");
  });

  it("returned instance is frozen", () => {
    const runner = CronRunner.create({
      schedule: "* * * * *",
      handler: async () => {
        /* noop */
      },
    });

    expect(Object.isFrozen(runner)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Queue: synchronous handler throws
// ---------------------------------------------------------------------------

describe("Queue with a synchronously throwing handler", () => {
  it("reports the error, keeps running later jobs and restores the active count", async () => {
    // Arrange
    const seen = [];
    const errors = [];
    const queue = Queue.create({
      concurrency: 2,
      handler: job => {
        if (job.data === "bad") throw new Error("sync-boom");
        seen.push(job.data);
        return Promise.resolve();
      },
      onError: (error, job) => errors.push([error.message, job.data]),
    });

    // Act
    let pushThrew = false;
    try {
      queue.push("bad");
      queue.push("ok-1");
      queue.push("ok-2");
    } catch {
      pushThrew = true;
    }
    await queue.drain();

    // Assert
    expect(pushThrew).toBe(false);
    expect(errors).toEqual([["sync-boom", "bad"]]);
    expect(seen).toEqual(["ok-1", "ok-2"]);
    expect(queue.active()).toBe(0);
    expect(queue.size()).toBe(0);
    expect(queue.processed()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Stream.merge and debounce: error and early-exit cleanup
// ---------------------------------------------------------------------------

/** Async iterable that records next/return calls; next() is scripted. */
const trackedSource = nextImpl => {
  const state = { returned: 0, nexts: 0 };
  const stream = Stream(() => ({
    [Symbol.asyncIterator]: () => ({
      next: () => {
        state.nexts++;
        return nextImpl(state.nexts);
      },
      return: () => {
        state.returned++;
        return Promise.resolve({ value: undefined, done: true });
      },
    }),
  }));
  return { state, stream };
};

const neverSettles = () =>
  new Promise(() => {
    /* intentionally never settles */
  });

/** Yields a value per macrotask so an unbounded pump cannot starve the loop. */
const slowValue = n =>
  new Promise(resolve => setImmediate(() => resolve({ value: Ok(n), done: false })));

/** Count timers that were created but neither fired nor cleared. */
const trackTimers = () => {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const live = new Set();
  globalThis.setTimeout = (fn, ms, ...args) => {
    const handle = realSet(
      (...a) => {
        live.delete(handle);
        fn(...a);
      },
      ms,
      ...args,
    );
    live.add(handle);
    return handle;
  };
  globalThis.clearTimeout = handle => {
    live.delete(handle);
    realClear(handle);
  };
  return {
    live: () => live.size,
    restore: () => {
      for (const h of live) realClear(h);
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    },
  };
};

/** Drain a stream; a consumer that never settles reports a hang error. */
const collectUntilError = stream => {
  const values = [];
  const drained = (async () => {
    try {
      for await (const r of stream.run()) values.push(r);
    } catch (error) {
      return { values, error };
    }
    return { values, error: undefined };
  })();
  let hangTimer;
  const hang = new Promise(resolve => {
    hangTimer = setTimeout(() => resolve({ values, error: new Error("consumer hung") }), 200);
  });
  return Promise.race([drained, hang]).finally(() => clearTimeout(hangTimer));
};

describe("Stream.merge and debounce cleanup", () => {
  it("positive control: the listener sees a deliberate unhandled rejection", async () => {
    // Arrange
    const events = [];
    const listener = reason => events.push(reason);
    process.on("unhandledRejection", listener);

    // Act
    void Promise.reject(new Error("deliberate"));
    await new Promise(resolve => setImmediate(resolve));
    process.off("unhandledRejection", listener);

    // Assert
    expect(events.length).toBe(1);
  });

  it("merge: a failing source rejects the consumer, stops other sources, no unhandled rejection", async () => {
    // Arrange
    const events = [];
    const listener = reason => events.push(reason);
    process.on("unhandledRejection", listener);
    const good = trackedSource(slowValue);
    const bad = trackedSource(n =>
      n === 1
        ? Promise.resolve({ value: Ok("x"), done: false })
        : Promise.reject(new Error("src-fail")),
    );

    // Act
    const outcome = await collectUntilError(Stream.merge(good.stream, bad.stream));
    await new Promise(resolve => setImmediate(resolve));
    process.off("unhandledRejection", listener);

    // Assert
    expect(outcome.error?.message).toBe("src-fail");
    expect(good.state.returned).toBe(1);
    expect(events.length).toBe(0);
  });

  it("merge: stopping early returns every source iterator", async () => {
    // Arrange
    const a = trackedSource(slowValue);
    const b = trackedSource(neverSettles);

    // Act
    for await (const _ of Stream.merge(a.stream, b.stream).run()) break;

    // Assert
    expect(a.state.returned).toBe(1);
    expect(b.state.returned).toBe(1);
  });

  it("debounce: a failing source rejects the consumer, clears the timer, no unhandled rejection", async () => {
    // Arrange
    const events = [];
    const listener = reason => events.push(reason);
    process.on("unhandledRejection", listener);
    const timers = trackTimers();
    const src = trackedSource(n =>
      n === 1
        ? Promise.resolve({ value: Ok(1), done: false })
        : Promise.reject(new Error("src-fail")),
    );

    // Act
    let outcome;
    try {
      outcome = await collectUntilError(src.stream.debounce(10_000));
      await new Promise(resolve => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", listener);
    }
    const liveTimers = timers.live();
    timers.restore();

    // Assert
    expect(outcome.error?.message).toBe("src-fail");
    expect(liveTimers).toBe(0);
    expect(events.length).toBe(0);
  });

  it("debounce: stopping early clears the pending timer and returns the source", async () => {
    // Arrange
    const events = [];
    const listener = reason => events.push(reason);
    process.on("unhandledRejection", listener);
    const timers = trackTimers();
    const src = trackedSource(n =>
      n === 1 ? Promise.resolve({ value: Ok(1), done: false }) : neverSettles(),
    );
    const iter = src.stream.debounce(10_000).run()[Symbol.asyncIterator]();

    // Act
    const pending = iter.next();
    await new Promise(resolve => setImmediate(resolve));
    const timersBefore = timers.live();
    await iter.return?.();
    await new Promise(resolve => setImmediate(resolve));
    const timersAfter = timers.live();
    timers.restore();
    process.off("unhandledRejection", listener);
    void pending;

    // Assert
    expect(timersBefore).toBe(1);
    expect(timersAfter).toBe(0);
    expect(src.state.returned).toBe(1);
    expect(events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Task combinators: user callbacks that throw yield Err
// ---------------------------------------------------------------------------

describe("Task combinators with throwing callbacks", () => {
  const boom = () => {
    throw new Error("cb-throw");
  };
  const cases = [
    ["map", () => Task.of(1).map(boom)],
    ["mapErr", () => Task(async () => Err("e")).mapErr(boom)],
    ["flatMap (callback throws)", () => Task.of(1).flatMap(boom)],
    ["tap", () => Task.of(1).tap(boom)],
    ["tapErr", () => Task(async () => Err("e")).tapErr(boom)],
    ["traverse", () => Task.traverse([1], boom)],
    ["ap", () => Task.ap(Task.of(boom), Task.of(1))],
    ["fromPromise onError", () => Task.fromPromise(() => Promise.reject(new Error("x")), boom)],
  ];

  for (const [name, build] of cases) {
    it(`${name} resolves to Err instead of throwing or rejecting`, async () => {
      // Arrange
      let task;
      let buildThrew = false;
      try {
        task = build();
      } catch {
        buildThrew = true;
      }

      // Act
      let result;
      let rejected = false;
      try {
        result = await task.run();
      } catch {
        rejected = true;
      }

      // Assert
      expect(buildThrew).toBe(false);
      expect(rejected).toBe(false);
      expect(result.isErr).toBe(true);
      expect(result.error.message).toBe("cb-throw");
    });
  }
});

describe("Task never-throws edge cases", () => {
  it("timeout: resolves to Err when onTimeout throws", async () => {
    // Arrange
    const boom = new Error("onTimeout-throw");
    const slow = Task(() => new Promise(resolve => setTimeout(() => resolve(Ok(1)), 200)));
    const task = slow.timeout(5, () => {
      throw boom;
    });
    // Act
    let rejected = false;
    let result;
    try {
      result = await task.run();
    } catch {
      rejected = true;
    }
    // Assert
    expect(rejected).toBe(false);
    expect(result.isErr).toBe(true);
    expect(result.error).toBe(boom);
  });

  it("Task(run): resolves to Err when the run thunk throws synchronously", async () => {
    // Arrange
    const boom = new Error("run-throw");
    const task = Task(() => {
      throw boom;
    });
    // Act
    let rejected = false;
    let result;
    try {
      result = await task.run();
    } catch {
      rejected = true;
    }
    // Assert
    expect(rejected).toBe(false);
    expect(result.isErr).toBe(true);
    expect(result.error).toBe(boom);
  });
});

describe("StateMachine inherited event names", () => {
  const m = StateMachine({
    initial: "idle",
    states: { idle: {}, loading: {} },
    transitions: { idle: { FETCH: "loading" }, loading: {} },
  });

  it("send: rejects an inherited state name with an inherited event", () => {
    // Arrange
    const state = "constructor";
    // Act
    const result = m.send(state, undefined, "name");
    // Assert
    expect(result.isErr).toBe(true);
    expect(m.canTransition(state, "name")).toBe(false);
  });

  for (const event of ["__proto__", "constructor", "toString"]) {
    it(`send: rejects inherited name '${event}' like an unknown event`, () => {
      // Arrange
      const unknown = m.send("idle", undefined, "NOPE");
      // Act
      const result = m.send("idle", undefined, event);
      // Assert
      expect(unknown.isErr).toBe(true);
      expect(result.isErr).toBe(true);
      expect(m.canTransition("idle", event)).toBe(false);
    });
  }

  it("send: rejects inherited name used as a state", () => {
    // Act
    const result = m.send("__proto__", undefined, "FETCH");
    // Assert
    expect(result.isErr).toBe(true);
  });
});

describe("Stream.groupBy prototype keys", () => {
  it("groups '__proto__' and 'constructor' keys without touching Object.prototype", async () => {
    // Arrange
    const stream = Stream.of("a", "b", "c");
    const keys = { a: "__proto__", b: "constructor", c: "__proto__" };
    // Act
    const result = await stream.groupBy(v => keys[v]).run();
    // Assert
    const groups = result.unwrap();
    expect(Object.getOwnPropertyDescriptor(groups, "__proto__").value).toEqual(["a", "c"]);
    expect(Object.getOwnPropertyDescriptor(groups, "constructor").value).toEqual(["b"]);
    expect(Object.getPrototypeOf(groups)).toBe(null);
  });
});

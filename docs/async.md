# Async

Lazy async computation, sequences, resilience, and concurrency control.

## Task\<T, E\>

Lazy async computation that returns `Result<T, E>`. Nothing runs until `.run()`.

```ts
import { Task, Ok, Err } from '@igorjs/pure-fx'

// Create
const task = Task.of(42);
const fetched = Task.fromPromise(() => fetch('/api/data'), String);

// Chain (short-circuits on Err)
const pipeline = Task.of(10)
  .map(n => n * 2)
  .flatMap(n => n > 0 ? Task.of(n) : Task.fromResult(Err('negative')));

// Execute
const result = await pipeline.run(); // Result<number, string>

// Parallel
const [a, b, c] = await Task.all([taskA, taskB, taskC]).run();

// Race
const fastest = await Task.race([slow, fast]).run();

// Timeout
const limited = task.timeout(5000, () => 'timed out');

// Retry
const resilient = task.retry({ maxAttempts: 3, delay: 1000 });

// Memoize
const cached = task.memoize(); // subsequent .run() returns cached result
```

## Stream\<T, E\>

Lazy pull-based async sequences. Backpressure-free.

```ts
import { Stream } from '@igorjs/pure-fx'

// Create
const s = Stream.of(1, 2, 3, 4, 5);
const fromApi = Stream.from(someAsyncIterable);
const ticks = Stream.interval(Duration.seconds(1));

// Transform (all lazy)
s.map(n => n * 2)
 .filter(n => n > 4)
 .take(3)
 .flatMap(n => Stream.of(n, n + 1));

// Collect (executes the pipeline)
const result = await s.collect().run(); // Result<number[], never>

// Reactive operators
s.debounce(300);                    // emit after 300ms silence
s.throttle(1000);                   // at most one per second
s.distinctUntilChanged();           // skip consecutive duplicates
s.distinctUntilChanged((a, b) => a.id === b.id); // custom eq

// Merge multiple streams
const merged = Stream.merge(streamA, streamB, streamC);

// Window and chunk
s.chunk(3);    // groups of 3: [[1,2,3], [4,5]]
s.window(2);   // sliding window: [[1,2], [2,3], [3,4], [4,5]]

// Reduce
await s.reduce((sum, n) => sum + n, 0).run(); // Ok(15)
```

## Retry

Builder pattern for retry policies.

```ts
import { Retry, Task } from '@igorjs/pure-fx'

const policy = Retry.exponential({ base: 100, factor: 2, maxDelay: 5000 })
  .maxAttempts(5)
  .jitter(0.2)
  .when(err => err.code !== 'FATAL');

const result = await policy.execute(
  () => Task.fromPromise(() => fetch('/api'), String)
).run();
```

## CircuitBreaker

Prevent cascading failures with open/half-open/closed states.

```ts
import { CircuitBreaker } from '@igorjs/pure-fx'

const breaker = CircuitBreaker.create({
  failureThreshold: 5,
  resetTimeout: Duration.seconds(30),
  halfOpenMax: 2,
});

const result = await breaker.execute(
  () => Task.fromPromise(() => fetch('/api'), String)
).run();
// Err(CircuitOpen(...)) when circuit is open
```

## Concurrency

```ts
import { Semaphore, Mutex, RateLimiter, Cache, Channel } from '@igorjs/pure-fx'

// Semaphore: limit concurrent access
const sem = Semaphore.create(3);
await sem.acquire();
try { /* work */ } finally { sem.release(); }

// Mutex: exclusive access
const mutex = Mutex.create();
await mutex.runWith(async () => { /* exclusive work */ });

// Rate limiter: token bucket
const limiter = RateLimiter.create({ rate: 10, interval: Duration.seconds(1) });
const result = await limiter.tryAcquire(); // Ok(void) or Err(RateLimited)

// Cache: TTL-based memoization
const cache = Cache.create<string, User>({ ttl: Duration.minutes(5) });
await cache.getOrSet('user:1', () => fetchUser('1'));

// Channel: async message passing
const ch = Channel.create<string>(10); // buffer size
await ch.send('hello');
const msg = await ch.receive(); // 'hello'
```

## StateMachine

See [state-machine.md](state-machine.md) for the full guide.

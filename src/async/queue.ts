/**
 * @module queue
 *
 * Async job queue with concurrency control, priorities, and error handling.
 *
 * **Why Queue?**
 * When processing background work (sending emails, syncing data, generating
 * reports), you need bounded concurrency to avoid overwhelming downstream
 * services and priority ordering to ensure critical jobs run first. Queue
 * provides a simple push-based API with pause/resume lifecycle, drain
 * semantics, and per-job error callbacks, all without external dependencies.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * A queued job with metadata.
 *
 * Jobs are created internally when data is pushed to the queue. Each job
 * receives a unique auto-incrementing ID, a priority (lower = higher
 * priority), and a creation timestamp.
 */
export interface Job<T> {
  /** Unique auto-incrementing job identifier. */
  readonly id: string;
  /** The payload data for this job. */
  readonly data: T;
  /** Priority level; lower numbers are processed first. */
  readonly priority: number;
  /** Timestamp (ms since epoch) when the job was created. */
  readonly createdAt: number;
}

/**
 * Configuration for creating a {@link QueueInstance}.
 *
 * @example
 * ```ts
 * const queue = Queue.create<{ userId: string }>({
 *   concurrency: 3,
 *   handler: async (job) => { await sendEmail(job.data.userId); },
 *   onError: (error, job) => { console.log(`Job ${job.id} failed:`, error); },
 * });
 * ```
 */
export interface QueueOptions<T> {
  /** Maximum number of jobs to process in parallel. Defaults to 1. */
  readonly concurrency?: number | undefined;
  /** Async function that processes each job. */
  readonly handler: (job: Job<T>) => Promise<void>;
  /** Optional callback invoked when a job's handler throws. */
  readonly onError?: ((error: unknown, job: Job<T>) => void) | undefined;
}

/**
 * An async job queue with concurrency control and priority ordering.
 *
 * @example
 * ```ts
 * const queue = Queue.create<{ userId: string }>({
 *   concurrency: 3,
 *   handler: async (job) => { await sendEmail(job.data.userId); },
 * });
 *
 * queue.push({ userId: 'u1' });
 * queue.push({ userId: 'u2' }, { priority: 0 });
 * await queue.drain();
 * ```
 */
export interface QueueInstance<T> {
  /** Add a job to the queue. Lower priority numbers are processed first. */
  readonly push: (data: T, options?: { readonly priority?: number }) => void;
  /** Number of pending (not yet started) jobs. */
  readonly size: () => number;
  /** Number of jobs currently being processed. */
  readonly active: () => number;
  /** Total number of jobs that have completed (success or error). */
  readonly processed: () => number;
  /** Returns a Promise that resolves when all pending and active jobs finish. */
  readonly drain: () => Promise<void>;
  /** Pause the queue. Active jobs continue, but no new jobs are dequeued. */
  readonly pause: () => void;
  /** Resume the queue. Immediately attempts to dequeue pending jobs. */
  readonly resume: () => void;
}

// ── Implementation ──────────────────────────────────────────────────────────

let nextJobId = 1;

const createQueue = <T>(options: QueueOptions<T>): QueueInstance<T> => {
  const concurrency = options.concurrency ?? 1;
  const handler = options.handler;
  const onError = options.onError;

  // Pending jobs sorted by priority (lower first), then insertion order
  const pending: Array<Job<T>> = [];
  let activeCount = 0;
  let processedCount = 0;
  let paused = false;

  // Drain waiters: resolve when size === 0 and activeCount === 0
  const drainWaiters: Array<() => void> = [];

  /** Insert a job into the pending array maintaining sort order. */
  const insertSorted = (job: Job<T>): void => {
    // Binary search for insertion point: sort by priority ASC, then createdAt ASC
    let low = 0;
    let high = pending.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const existing = pending[mid]!;
      if (
        existing.priority < job.priority ||
        (existing.priority === job.priority && existing.createdAt <= job.createdAt)
      ) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    pending.splice(low, 0, job);
  };

  /** Notify drain waiters if the queue is idle. */
  const checkDrain = (): void => {
    if (pending.length === 0 && activeCount === 0) {
      for (const resolve of drainWaiters) {
        resolve();
      }
      drainWaiters.length = 0;
    }
  };

  /** Process a single job, then try to dequeue the next one. */
  const processJob = (job: Job<T>): void => {
    activeCount++;
    handler(job).then(
      () => {
        activeCount--;
        processedCount++;
        dequeue();
        checkDrain();
      },
      (error: unknown) => {
        activeCount--;
        processedCount++;
        if (onError !== undefined) {
          onError(error, job);
        }
        dequeue();
        checkDrain();
      },
    );
  };

  /** Try to dequeue and process jobs up to the concurrency limit. */
  const dequeue = (): void => {
    if (paused) {
      return;
    }
    while (activeCount < concurrency && pending.length > 0) {
      const job = pending.shift()!;
      processJob(job);
    }
  };

  return Object.freeze({
    push: (data: T, opts?: { readonly priority?: number }): void => {
      const job: Job<T> = {
        id: String(nextJobId++),
        data,
        priority: opts?.priority ?? 10,
        createdAt: Date.now(),
      };
      insertSorted(job);
      dequeue();
    },

    size: () => pending.length,
    active: () => activeCount,
    processed: () => processedCount,

    drain: (): Promise<void> => {
      if (pending.length === 0 && activeCount === 0) {
        return Promise.resolve();
      }
      return new Promise<void>(resolve => {
        drainWaiters.push(resolve);
      });
    },

    pause: (): void => {
      paused = true;
    },

    resume: (): void => {
      paused = false;
      dequeue();
    },
  });
};

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Create async job queues with concurrency control and priority ordering.
 *
 * @example
 * ```ts
 * const queue = Queue.create<{ userId: string }>({
 *   concurrency: 3,
 *   handler: async (job) => { await sendEmail(job.data.userId); },
 *   onError: (error, job) => { console.log(`Job ${job.id} failed:`, error); },
 * });
 *
 * queue.push({ userId: 'u1' });
 * queue.push({ userId: 'u2' }, { priority: 0 });
 * await queue.drain();
 * ```
 */
export const Queue: {
  /** Create a new async job queue with the given options. */
  readonly create: <T>(options: QueueOptions<T>) => QueueInstance<T>;
} = {
  create: createQueue,
};

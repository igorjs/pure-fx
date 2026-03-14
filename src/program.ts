// ═══════════════════════════════════════════════════════════════════════════════
// Program
// ═══════════════════════════════════════════════════════════════════════════════

import type { Result } from './result.js';
import type { Task } from './task.js';

// ── Error formatting ────────────────────────────────────────────────────────

/** Format an error value for stderr. Prefers toString() over String(). */
const formatError = (error: unknown): string => {
  if (error !== null && typeof error === 'object') {
    const s = String(error);
    if (s !== '[object Object]') return s;
    try { return JSON.stringify(error); } catch { return s; }
  }
  return String(error);
};

// ── Public interface ────────────────────────────────────────────────────────

/**
 * A runnable program built on {@link Task}.
 *
 * Use `.run()` for production (handles signals, exit codes, stderr).
 * Use `.execute()` for testing (returns `Result`, no process lifecycle).
 */
export interface Program<T, E> {
  /**
   * Run with full process lifecycle management.
   *
   * - SIGINT / SIGTERM fire the `AbortSignal` passed to the effect
   * - Second signal force-exits (code 130)
   * - `Ok` -> `process.exit(0)`
   * - `Err` -> stderr + `process.exit(1)`
   * - Interrupted -> `process.exit(130)`
   */
  run(): Promise<void>;

  /**
   * Execute without process lifecycle. Returns the raw {@link Result}.
   *
   * Accepts an optional `AbortSignal` for cancellation in tests.
   */
  execute(signal?: AbortSignal): Promise<Result<T, E>>;
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a {@link Program} from a {@link Task} or an effect function.
 *
 * When given a function, it receives an `AbortSignal` wired to
 * SIGINT/SIGTERM so the effect can respond to graceful shutdown.
 *
 * @example
 * ```ts
 * // Simple: wrap an existing Task
 * const main = Program(Task.of('done'));
 * main.run();
 *
 * // With signal for graceful shutdown
 * const main = Program((signal) =>
 *   pipe(
 *     loadConfig(),
 *     Task.flatMap(cfg => startServer(cfg, { signal })),
 *   )
 * );
 * main.run();
 *
 * // Testing (no process.exit, returns Result)
 * const result = await main.execute();
 * ```
 */
export function Program<T, E>(
  effect: Task<T, E> | ((signal: AbortSignal) => Task<T, E>),
): Program<T, E> {
  const toTask: (signal: AbortSignal) => Task<T, E> =
    typeof effect === 'function' ? effect : () => effect;

  return {
    async run(): Promise<void> {
      const ac = new AbortController();
      let interrupted = false;

      const onSignal = (): void => {
        if (interrupted) process.exit(130);
        interrupted = true;
        ac.abort();
      };

      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);

      try {
        const result = await toTask(ac.signal).run();

        if (result.isOk) {
          process.exit(0);
        } else if (interrupted) {
          process.exit(130);
        } else {
          console.error(formatError(result.unwrapErr()));
          process.exit(1);
        }
      } catch (unhandled: unknown) {
        console.error(formatError(unhandled));
        process.exit(1);
      } finally {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
      }
    },

    async execute(signal?: AbortSignal): Promise<Result<T, E>> {
      return toTask(signal ?? new AbortController().signal).run();
    },
  };
}

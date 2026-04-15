/**
 * @module program
 *
 * Process-lifecycle wrapper for Task-based programs.
 *
 * **Why Program instead of a bare Task.run()?**
 * Production programs need signal handling (SIGINT/SIGTERM for graceful
 * shutdown), structured logging, and correct exit codes. `Program`
 * encapsulates all of this so the effect function only needs to return
 * a `Task`, not manage process lifecycle.
 *
 * **Choosing between `.run()` and `.execute()`:**
 *
 * `.run()` is for **long-running services** (HTTP servers, workers, daemons):
 * it registers signal handlers, logs lifecycle events to stdout/stderr, and
 * calls `process.exit()`. The lifecycle logs ("started", "completed") confirm
 * the process is alive, which is valuable for service monitoring.
 *
 * `.execute()` is for **CLI tools and testing**:
 * - **CLI tools** manage their own output and exit codes. Lifecycle logs
 *   ("started"/"completed") are noise for a tool that should be silent
 *   unless it has something to say. `execute()` returns the raw `Result`
 *   so the caller controls exit codes and output.
 * - **Tests** call `execute()` to get a `Result` without process lifecycle,
 *   enabling assertions on outcomes without spawning child processes.
 *
 * Both methods wire the `AbortSignal` for graceful shutdown. The difference
 * is who owns the process lifecycle: `run()` does it for you, `execute()`
 * lets you do it yourself.
 *
 * @example CLI tool using execute()
 * ```ts
 * const app = Program('my-cli', (signal) => cli(Deno.args));
 * const result = await app.execute();
 * result.match({
 *   Ok: (exitCode) => Deno.exit(exitCode),
 *   Err: (msg) => { console.error(`fatal: ${msg}`); Deno.exit(1); },
 * });
 * ```
 *
 * @example Long-running service using run()
 * ```ts
 * const main = Program('my-service', (signal) =>
 *   pipe(
 *     loadConfig(),
 *     Task.flatMap(cfg => startServer(cfg, { signal })),
 *   ),
 *   { teardownTimeoutMs: 5000 },
 * );
 * await main.run();
 * ```
 */

import type { Task } from "./async/task.js";
import type { Result } from "./core/result.js";
import type { Logger } from "./runtime/logger.js";

// ── Error formatting ────────────────────────────────────────────────────────

/** Format an error value for stderr. Prefers toString() over String(). */
const formatError = (error: unknown): string => {
  if (error !== null && typeof error === "object") {
    const s = String(error);
    if (s !== "[object Object]") return s;
    try {
      return JSON.stringify(error);
    } catch {
      return s;
    }
  }
  return String(error);
};

/** ISO timestamp for log lines. */
const ts = (): string => new Date().toISOString();

// ── Public interface ────────────────────────────────────────────────────────

/**
 * A runnable program built on {@link Task}.
 *
 * **For services:** use `.run()` (handles signals, exit codes, lifecycle logging).
 * **For CLI tools:** use `.execute()` (returns Result, caller owns lifecycle).
 * **For tests:** use `.execute()` (no process.exit, returns Result for assertions).
 */
export interface Program<T, E> {
  /**
   * Run with full process lifecycle management.
   *
   * Best for **long-running services** where lifecycle logging ("started",
   * "completed") aids monitoring and observability.
   *
   * - SIGINT / SIGTERM fire the `AbortSignal` passed to the effect
   * - Second signal force-exits (code 130)
   * - Interrupted -> `process.exit(130)` (takes priority over Ok/Err)
   * - `Ok` -> `process.exit(0)`
   * - `Err` -> stderr + `process.exit(1)`
   *
   * Pass `{ silent: true }` in options to suppress lifecycle logs while
   * keeping signal handling and exit code management. Error logs are
   * always emitted regardless of the silent flag.
   */
  run(): Promise<void>;

  /**
   * Execute without process lifecycle. Returns the raw {@link Result}.
   *
   * Best for **CLI tools** and **tests**:
   * - CLI tools that manage their own output and need non-binary exit codes
   *   (e.g., exit 0 = success, exit 1 = found issues, exit 2 = stale)
   * - Tests that need to assert on the Result without process.exit()
   *
   * Accepts an optional `AbortSignal` for cancellation.
   *
   * @example CLI tool with custom exit codes
   * ```ts
   * const app = Program('lint', (signal) => runLinter(args));
   * const result = await app.execute();
   * result.match({
   *   Ok: (exitCode) => process.exit(exitCode),
   *   Err: (msg) => { console.error(msg); process.exit(1); },
   * });
   * ```
   *
   * @example Test assertions
   * ```ts
   * const result = await app.execute();
   * assert(result.isOk);
   * assertEquals(result.unwrap(), expectedValue);
   * ```
   */
  execute(signal?: AbortSignal): Promise<Result<T, E>>;
}

// ── Options ─────────────────────────────────────────────────────────────────

/** Configuration options for Program. */
export interface ProgramOptions {
  /**
   * Max ms to wait for the effect to complete after an interrupt signal
   * before force-exiting. Without this, only a second signal triggers
   * force-exit.
   */
  readonly teardownTimeoutMs?: number;

  /**
   * Suppress lifecycle logs ("started", "completed") in `.run()`.
   * Error and interrupt messages are always logged regardless.
   *
   * Useful for CLI tools that use `.run()` for signal handling but
   * don't want service-oriented lifecycle messages in their output.
   *
   * Default: `false`.
   */
  readonly silent?: boolean;

  /**
   * Custom logger instance for lifecycle messages. When provided,
   * Program uses `logger.info()` for "started"/"completed" and
   * `logger.error()` for errors/interrupts, instead of raw
   * `console.log`/`console.error`.
   *
   * Pass a silent logger (`Logger.create({ name, sink: Logger.silent })`)
   * to suppress all output, or a JSON logger for structured production logs.
   *
   * Takes precedence over `silent` when both are provided.
   */
  readonly logger?: Logger;
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a named {@link Program} from a {@link Task} or an effect function.
 *
 * When given a function, it receives an `AbortSignal` wired to
 * SIGINT/SIGTERM so the effect can respond to graceful shutdown.
 *
 * @example Service with lifecycle logging (default)
 * ```ts
 * const main = Program('my-service', (signal) =>
 *   pipe(
 *     loadConfig(),
 *     Task.flatMap(cfg => startServer(cfg, { signal })),
 *   ),
 *   { teardownTimeoutMs: 5000 },
 * );
 * await main.run();
 * // [2026-03-16T10:00:00.000Z] [my-service] started
 * // ... on error:
 * // [2026-03-16T10:00:01.234Z] [my-service] error: NotFound(NOT_FOUND): User not found
 * ```
 *
 * @example CLI tool with silent run()
 * ```ts
 * const app = Program('my-cli', (signal) => cli(args), { silent: true });
 * await app.run();
 * // No lifecycle logs, just the CLI's own output
 * ```
 *
 * @example CLI tool with execute() (recommended for CLIs)
 * ```ts
 * const app = Program('my-cli', (signal) => cli(args));
 * const result = await app.execute();
 * result.match({
 *   Ok: (code) => process.exit(code),
 *   Err: (msg) => { console.error(`fatal: ${msg}`); process.exit(1); },
 * });
 * ```
 *
 * @example Custom logger
 * ```ts
 * import { Logger } from '@igorjs/pure-fx';
 * const log = Logger.create({ name: 'api', sink: Logger.json });
 * const main = Program('api', (signal) => startServer(signal), { logger: log });
 * await main.run();
 * // {"timestamp":"...","level":"info","name":"api","message":"started"}
 * ```
 */
export function Program<T, E>(
  name: string,
  effect: Task<T, E> | ((signal: AbortSignal) => Task<T, E>),
  options?: ProgramOptions,
): Program<T, E> {
  const toTask: (signal: AbortSignal) => Task<T, E> =
    typeof effect === "function" ? effect : () => effect;

  const tag = `[${name}]`;
  const teardownTimeoutMs = options?.teardownTimeoutMs;
  const logger = options?.logger;
  const silent = options?.silent ?? false;

  // Log helpers: use custom logger if provided, otherwise console with
  // optional silence for lifecycle (info) messages. Error messages are
  // never suppressed.
  const logInfo = (msg: string): void => {
    if (logger) {
      logger.info(msg);
    } else if (!silent) {
      console.log(`${ts()} ${tag} ${msg}`);
    }
  };

  const logError = (msg: string): void => {
    if (logger) {
      logger.error(msg);
    } else {
      console.error(`${ts()} ${tag} ${msg}`);
    }
  };

  return {
    async run(): Promise<void> {
      const ac = new AbortController();
      let interrupted = false;
      let teardownTimer: ReturnType<typeof setTimeout> | undefined;

      const onSignal = (): void => {
        if (interrupted) process.exit(130);
        interrupted = true;
        logError("interrupted");
        ac.abort();
        if (teardownTimeoutMs !== undefined) {
          teardownTimer = setTimeout(() => process.exit(130), teardownTimeoutMs);
        }
      };

      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);

      logInfo("started");

      let exitCode = 0;
      try {
        const result = await toTask(ac.signal).run();

        if (interrupted) {
          exitCode = 130;
        } else if (result.isOk) {
          logInfo("completed");
        } else {
          logError(`error: ${formatError(result.unwrapErr())}`);
          exitCode = 1;
        }
      } catch (unhandled: unknown) {
        logError(`error: ${formatError(unhandled)}`);
        exitCode = 1;
      } finally {
        if (teardownTimer) clearTimeout(teardownTimer);
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
      }

      process.exit(exitCode);
    },

    async execute(signal?: AbortSignal): Promise<Result<T, E>> {
      return toTask(signal ?? new AbortController().signal).run();
    },
  };
}

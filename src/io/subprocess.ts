/**
 * @module io/subprocess
 *
 * Cross-runtime subprocess execution returning Task instead of throwing.
 *
 * **Why wrap child_process / Deno.Command / Bun.spawn?**
 * Each runtime has its own subprocess API with different shapes, error
 * semantics, and output types. This module uses the Subprocess adapter
 * from runtime/adapters which normalises all three behind a single
 * interface, returning a unified CommandResult wrapped in TaskLike.
 *
 * Non-zero exit codes are not errors: only spawn failures (command not
 * found, timeout, permission denied) produce Err(CommandError).
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import { Err, Ok } from "../core/result.js";
import { resolveSubprocess } from "../runtime/adapters/subprocess.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Subprocess execution failed (command not found, timeout, spawn error). */
export const CommandError: ErrTypeConstructor<"CommandError", string> = ErrType("CommandError");

// ── Command result ──────────────────────────────────────────────────────────

/** Output of a subprocess execution. */
export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// ── Command options ─────────────────────────────────────────────────────────

/** Options for subprocess execution. */
export interface CommandOptions {
  readonly cwd?: string | undefined;
  readonly env?: Record<string, string> | undefined;
  readonly timeout?: number | undefined;
  readonly stdin?: string | undefined;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Cross-runtime subprocess execution.
 *
 * Detects the runtime (Deno, Bun, Node) via the adapter layer and
 * dispatches to the appropriate subprocess API. Returns TaskLike so
 * execution is lazy until `.run()` is called.
 *
 * Non-zero exit codes are **not** errors: the full stdout/stderr/exitCode
 * is returned in Ok. Only actual failures produce Err(CommandError).
 *
 * @example
 * ```ts
 * const result = await Command.exec('echo', ['hello']).run();
 * if (result.isOk) {
 *   console.log(result.value.stdout); // 'hello\n'
 * }
 * ```
 */
export const Command: {
  /** Execute a command with optional arguments and options. */
  readonly exec: (
    cmd: string,
    args?: readonly string[],
    options?: CommandOptions,
  ) => TaskLike<CommandResult, ErrType<"CommandError">>;
} = {
  exec: (
    cmd: string,
    args?: readonly string[],
    options?: CommandOptions,
  ): TaskLike<CommandResult, ErrType<"CommandError">> => {
    const resolvedArgs = args ?? [];
    const resolvedOptions = options ?? {};

    return makeTask(async () => {
      const subprocess = resolveSubprocess();
      try {
        return Ok(await subprocess.exec(cmd, resolvedArgs, resolvedOptions));
      } catch (e) {
        return Err(CommandError(e instanceof Error ? e.message : String(e), { cmd, args }));
      }
    });
  },
};

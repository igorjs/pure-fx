// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

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
import type { Option } from "../core/option.js";
import { None, Some } from "../core/option.js";
import { Err, Ok } from "../core/result.js";
import { resolveSubprocess } from "../runtime/adapters/subprocess.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Subprocess execution failed (command not found, timeout, spawn error). */
export const CommandError: ErrTypeConstructor<"CommandError", string> = ErrType("CommandError");

// ── Command result ──────────────────────────────────────────────────────────

/** Output of a subprocess execution. */
export interface CommandResult {
  /** Process exit code (0 typically means success). */
  readonly exitCode: number;
  /** Captured standard output text. */
  readonly stdout: string;
  /** Captured standard error text. */
  readonly stderr: string;
}

// ── Command options ─────────────────────────────────────────────────────────

/** Options for subprocess execution. */
export interface CommandOptions {
  /** Working directory for the subprocess. */
  readonly cwd?: string | undefined;
  /** Environment variables to set. */
  readonly env?: Record<string, string> | undefined;
  /** Timeout in milliseconds. */
  readonly timeout?: number | undefined;
  /** String piped to subprocess stdin. */
  readonly stdin?: string | undefined;
}

/** Options for spawning a background process. */
export interface SpawnOptions {
  /** Working directory for the subprocess. */
  readonly cwd?: string | undefined;
  /** Environment variables to set. */
  readonly env?: Record<string, string> | undefined;
  /** Pipe and collect stdout/stderr (default: inherit parent streams). */
  readonly capture?: boolean | undefined;
}

// ── Child process handle ────────────────────────────────────────────────────

/** A spawned background process with lifecycle controls. */
export interface ChildProcess {
  /** Process ID, if available. */
  readonly pid: Option<number>;
  /** Kill the process with an optional signal. */
  readonly kill: (signal?: string) => void;
  /**
   * Detach the child so the parent can exit independently.
   *
   * After unref, the parent process will not wait for this child
   * to exit before terminating. Use for fire-and-forget daemons
   * and background workers.
   */
  readonly unref: () => void;
  /** Wait for the process to exit and collect output. */
  readonly wait: () => TaskLike<CommandResult, ErrType<"CommandError">>;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Cross-runtime subprocess execution.
 *
 * @example
 * ```ts
 * // Run and wait for result
 * const result = await Command.exec('echo', ['hello']).run();
 *
 * // Fire and forget
 * const child = await Command.spawn('my-server', ['--port', '8080']).run();
 * if (child.isOk) {
 *   child.value.unref(); // parent can exit, child keeps running
 * }
 *
 * // Spawn and wait later
 * const child = await Command.spawn('build', ['--watch'], { capture: true }).run();
 * if (child.isOk) {
 *   const result = await child.value.wait().run();
 * }
 * ```
 */
export const Command: {
  /** Execute a command, wait for completion, and return output. */
  readonly exec: (
    cmd: string,
    args?: readonly string[],
    options?: CommandOptions,
  ) => TaskLike<CommandResult, ErrType<"CommandError">>;

  /**
   * Spawn a background process and return a handle immediately.
   *
   * Unlike exec, spawn does not wait for the process to finish.
   * Use the returned ChildProcess to kill, unref, or wait later.
   * By default stdout/stderr inherit from the parent; pass
   * `{ capture: true }` to pipe and collect output via wait().
   */
  readonly spawn: (
    cmd: string,
    args?: readonly string[],
    options?: SpawnOptions,
  ) => TaskLike<ChildProcess, ErrType<"CommandError">>;
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

  spawn: (
    cmd: string,
    args?: readonly string[],
    options?: SpawnOptions,
  ): TaskLike<ChildProcess, ErrType<"CommandError">> => {
    const resolvedArgs = args ?? [];
    const resolvedOptions = options ?? {};

    return makeTask(async () => {
      try {
        const subprocess = resolveSubprocess();
        const raw = await subprocess.spawn(cmd, resolvedArgs, resolvedOptions);
        const child: ChildProcess = {
          pid: raw.pid !== undefined ? Some(raw.pid) : None,
          kill: (signal?) => raw.kill(signal),
          unref: () => raw.unref(),
          wait: () =>
            makeTask(async () => {
              try {
                return Ok(await raw.wait());
              } catch (e) {
                return Err(CommandError(e instanceof Error ? e.message : String(e), { cmd, args }));
              }
            }),
        };
        return Ok(child);
      } catch (e) {
        return Err(CommandError(e instanceof Error ? e.message : String(e), { cmd, args }));
      }
    });
  },
};
